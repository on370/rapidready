use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use anyhow::Result;
use super::*;

pub fn warm_thumbnail_cache_with_progress<F>(
    paths: &[String],
    scale: u32,
    token: u64,
    token_atomic: &AtomicU64,
    mut on_progress: F,
) -> usize
where
    F: FnMut(usize, usize),
{
    let total = paths.len();
    if total == 0 {
        return 0;
    }

    let mut cached_count = 0;
    for path_str in paths {
        let path = Path::new(path_str);
        if is_thumbnail_ram_cached(path, scale, None, None, None) {
            cached_count += 1;
        }
    }
    on_progress(cached_count, total);

    let mut processed = 0;
    let mut last_reported = cached_count;
    let mut last_report_time = std::time::Instant::now();

    for path_str in paths {
        if token_atomic.load(Ordering::SeqCst) != token {
            break;
        }
        // Yield to high-priority interactive viewport requests
        while is_viewport_active() {
            if token_atomic.load(Ordering::SeqCst) != token {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        if token_atomic.load(Ordering::SeqCst) != token {
            break;
        }
        let path = Path::new(path_str);
        if !is_thumbnail_ram_cached(path, scale, None, None, None) {
            let _ = get_thumbnail_bytes(path, scale, None);
            std::thread::yield_now();
            cached_count += 1;

            // Throttle progress events: emit at least every 1 item or 50ms, or when finished
            if cached_count - last_reported >= 1
                && (last_report_time.elapsed() >= std::time::Duration::from_millis(50) || cached_count == total)
            {
                on_progress(cached_count, total);
                last_reported = cached_count;
                last_report_time = std::time::Instant::now();
            }
        }
        processed += 1;
    }

    if cached_count != last_reported {
        on_progress(cached_count, total);
    }
    processed
}

pub fn warm_thumbnail_cache_with_token(
    paths: &[String],
    scale: u32,
    token: u64,
    token_atomic: &AtomicU64,
) -> usize {
    warm_thumbnail_cache_with_progress(paths, scale, token, token_atomic, |_, _| {})
}

pub fn warm_thumbnail_cache_sync(paths: &[String], scale: u32, token: u64) -> usize {
    warm_thumbnail_cache_with_token(paths, scale, token, &WARMUP_TOKEN)
}

/// Picasa-Model Background Thumbnail Generator Pipeline:
/// Generates micro-thumbnails (scale 1) into L2 packed binary chunks (`chunk_cache`)
/// for all candidate files in an archive root. Yields immediately whenever interactive
/// viewport requests occur.
pub fn generate_missing_thumbnails_for_archive<P>(
    catalog: &crate::archive_catalog::ArchiveCatalog,
    chunk_cache: &crate::chunk_cache::ChunkCache,
    root: &str,
    scale: u32,
    controller: &crate::archive::ScanController,
    on_progress: P,
) -> Result<usize>
where
    P: FnMut(usize, usize, &str, u64) + Send,
{
    let candidates = catalog.get_thumbnail_candidates_for_root(root)?;
    if candidates.is_empty() {
        let _ = catalog.set_archive_indexing_status(root, true);
        return Ok(0);
    }

    let total_archive_files = candidates.len();

    // Identify candidate files missing from chunk cache
    let mut missing = Vec::new();
    for cand in candidates {
        let path_obj = Path::new(&cand.path);
        let key = crate::chunk_cache::compute_cache_key(
            path_obj,
            cand.size,
            cand.mtime,
            scale,
            cand.orientation.unwrap_or(1),
        );
        if !chunk_cache.has_thumbnail(&key, scale) {
            missing.push(cand);
        }
    }

    let total_missing = missing.len();
    let already_cached = total_archive_files.saturating_sub(total_missing);

    if total_missing == 0 {
        let _ = catalog.set_archive_indexing_status(root, true);
        let mut cb = on_progress;
        cb(total_archive_files, total_archive_files, "", 0);
        return Ok(0);
    }

    // Prioritize queue order:
    // 1. Non-video items come AFTER video items in the vector (so photos are popped first from the end).
    // 2. Active folder items come at the very end of the vector (popped first of all).
    if let Some(active_folder) = get_active_folder() {
        let folder_str = active_folder.as_str();
        missing.sort_by(|a, b| {
            let key_a = (!a.is_video, a.path.starts_with(folder_str), std::cmp::Reverse(&a.path));
            let key_b = (!b.is_video, b.path.starts_with(folder_str), std::cmp::Reverse(&b.path));
            key_a.cmp(&key_b)
        });
    } else {
        missing.sort_by(|a, b| {
            let key_a = (!a.is_video, std::cmp::Reverse(&a.path));
            let key_b = (!b.is_video, std::cmp::Reverse(&b.path));
            key_a.cmp(&key_b)
        });
    }

    let queue = Mutex::new(missing);
    let completed = AtomicUsize::new(0);
    let processed_bytes = AtomicU64::new(0);
    let on_progress_mutex = Mutex::new(on_progress);
    let last_report_time = Mutex::new(std::time::Instant::now());

    if let Ok(mut cb) = on_progress_mutex.lock() {
        cb(already_cached, total_archive_files, "", 0);
    }

    let is_remote = crate::metadata_resolver::is_network_or_remote_path(Path::new(root));
    let worker_count = if is_remote {
        std::thread::available_parallelism()
            .map(|n| n.get().clamp(2, 3))
            .unwrap_or(2)
    } else {
        std::thread::available_parallelism()
            .map(|n| n.get().clamp(3, 6))
            .unwrap_or(4)
    };
    let poll_active_viewport_cache = || {
        if let Ok(mut q) = queue.try_lock() {
            if q.is_empty() {
                return;
            }
            let vp_opt = ACTIVE_VIEWPORT_PATHS.lock().ok().and_then(|g| g.clone());
            let Some(vp) = vp_opt else { return; };
            if vp.set.is_empty() {
                return;
            }

            let mut i = q.len();
            let mut newly_completed = 0;
            let mut newly_bytes = 0u64;
            let mut last_path = String::new();

            while i > 0 {
                i -= 1;
                let norm_q = crate::archive_catalog::normalize_canonical_path(&q[i].path);
                if vp.set.contains(&norm_q) {
                    let cand = &q[i];
                    let path_obj = Path::new(&cand.path);
                    let key = crate::chunk_cache::compute_cache_key(
                        path_obj,
                        cand.size,
                        cand.mtime,
                        scale,
                        cand.orientation.unwrap_or(1),
                    );
                    if chunk_cache.has_thumbnail(&key, scale) {
                        let item = q.swap_remove(i);
                        newly_completed += 1;
                        newly_bytes += item.size;
                        last_path = item.path;
                    }
                }
            }

            if newly_completed > 0 {
                let done = completed.fetch_add(newly_completed, Ordering::SeqCst) + newly_completed;
                let bytes_accum = processed_bytes.fetch_add(newly_bytes, Ordering::Relaxed) + newly_bytes;
                if let Ok(mut cb) = on_progress_mutex.lock() {
                    cb(already_cached + done, total_archive_files, &last_path, bytes_accum);
                }
            }
        }
    };
    let active_folder_tracker = Mutex::new(get_active_folder());

    std::thread::scope(|s| {
        for _ in 0..worker_count {
            s.spawn(|| {
                loop {
                    if controller.is_cancelled() {
                        break;
                    }
                    while controller.is_paused() {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                        if controller.is_cancelled() {
                            return;
                        }
                    }
                    // Cooperative preemption: wait while interactive UI scrolling is active
                    if !wait_while_viewport_active_with_poll(Some(controller), poll_active_viewport_cache) {
                        return;
                    }

                    // Grab a batch of up to 8 items in O(1) without holding lock during processing
                    let batch: Vec<crate::archive_catalog::ThumbnailCandidate> = {
                        let mut q = match queue.lock() {
                            Ok(guard) => guard,
                            Err(_) => break,
                        };
                        if q.is_empty() {
                            Vec::new()
                        } else {
                            // Dynamic folder re-prioritization: if active folder changed, sort remaining items
                            let cur_folder = get_active_folder();
                            if let Ok(mut tracker) = active_folder_tracker.try_lock() {
                                if *tracker != cur_folder {
                                    *tracker = cur_folder.clone();
                                    if let Some(ref folder) = cur_folder {
                                        let folder_str = folder.as_str();
                                        q.sort_by(|a, b| {
                                            let key_a = (!a.is_video, a.path.starts_with(folder_str), std::cmp::Reverse(&a.path));
                                            let key_b = (!b.is_video, b.path.starts_with(folder_str), std::cmp::Reverse(&b.path));
                                            key_a.cmp(&key_b)
                                        });
                                    }
                                }
                            }

                            let batch_size = 8.min(q.len());
                            let mut b = Vec::with_capacity(batch_size);

                            // Viewport priority: immediately take visible items first
                            if let Ok(lock) = ACTIVE_VIEWPORT_PATHS.lock() {
                                if let Some(ref vp) = *lock {
                                    if !vp.set.is_empty() {
                                        let mut i = q.len();
                                        while i > 0 && b.len() < batch_size {
                                            i -= 1;
                                            let norm_q = crate::archive_catalog::normalize_canonical_path(&q[i].path);
                                            if vp.set.contains(&norm_q) {
                                                b.push(q.swap_remove(i));
                                            }
                                        }
                                    }
                                }
                            }

                            // Fill remaining batch slots from the end of the queue
                            while b.len() < batch_size {
                                if let Some(item) = q.pop() {
                                    b.push(item);
                                } else {
                                    break;
                                }
                            }
                            b
                        }
                    };

                    if batch.is_empty() {
                        break;
                    }

                    for item in batch {
                        if controller.is_cancelled() {
                            return;
                        }
                        while controller.is_paused() {
                            std::thread::sleep(std::time::Duration::from_millis(50));
                            if controller.is_cancelled() {
                                return;
                            }
                        }
                        if !wait_while_viewport_active_with_poll(Some(controller), poll_active_viewport_cache) {
                            return;
                        }

                    let path_obj = Path::new(&item.path);
                    let key = crate::chunk_cache::compute_cache_key(
                        path_obj,
                        item.size,
                        item.mtime,
                        scale,
                        item.orientation.unwrap_or(1),
                    );

                    // Skip if thumbnail was already created (e.g. on-demand by UI rr-image handler)
                    if chunk_cache.has_thumbnail(&key, scale) {
                        let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                        let bytes_accum = processed_bytes.fetch_add(item.size, Ordering::Relaxed) + item.size;
                        let should_report = if let Ok(mut last) = last_report_time.lock() {
                            if done == total_missing || last.elapsed() >= std::time::Duration::from_millis(150) {
                                *last = std::time::Instant::now();
                                true
                            } else {
                                false
                            }
                        } else {
                            false
                        };
                        if should_report {
                            if let Ok(mut cb) = on_progress_mutex.lock() {
                                cb(already_cached + done, total_archive_files, &item.path, bytes_accum);
                            }
                        }
                        continue;
                    }

                    // Generate thumbnail and save into L2 chunk cache & L1 RAM cache (handled within get_preview_jpeg)
                    if let Ok(bytes) = get_preview_jpeg_with_orient_and_hints(
                        path_obj,
                        scale,
                        item.orientation,
                        Some(item.size),
                        Some(item.mtime),
                    ) {
                        if !chunk_cache.has_thumbnail(&key, scale) {
                            let _ = chunk_cache.write_thumbnail(&key, scale, &bytes);
                        }
                    }

                    let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    let bytes_accum = processed_bytes.fetch_add(item.size, Ordering::Relaxed) + item.size;

                    let should_report = {
                        if let Ok(mut last) = last_report_time.lock() {
                            if done == total_missing || last.elapsed() >= std::time::Duration::from_millis(150) {
                                *last = std::time::Instant::now();
                                true
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    if should_report {
                        if let Ok(mut cb) = on_progress_mutex.lock() {
                            cb(already_cached + done, total_archive_files, &item.path, bytes_accum);
                        }
                    }

                    std::thread::yield_now();
                    }
                }
            });
        }
    });

    let total_done = completed.load(Ordering::SeqCst);
    if let Ok(mut cb) = on_progress_mutex.lock() {
        cb(already_cached + total_done, total_archive_files, "", processed_bytes.load(Ordering::Relaxed));
    }

    if !controller.is_cancelled() && total_done >= total_missing {
        let _ = catalog.set_archive_indexing_status(root, true);
    }

    Ok(total_done)
}
