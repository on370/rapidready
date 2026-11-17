//! Groups near-identical frames (bursts, repeated attempts at one shot) for review, and suggests
//! which frame of each group to keep.
//!
//! Grouping: frames are split into scenes at camera changes and long pauses, then grouped by a
//! visual signature that combines structure (difference hash), a tiny normalized thumbnail
//! (tolerant of exposure changes) and a coarse color histogram. Frames further apart in time must
//! look more alike to join.
//!
//! Keeper: frames in a group share their composition, so instead of comparing whole-frame detail
//! (which rewards busy backgrounds and noise) each frame is scored on the regions that are sharpest
//! anywhere in the group, i.e. the subject, relative to the best frame there. Material clipping
//! counts against a frame. When frames are too close to separate, the suggestion says so.
//!
//! Everything runs on the cached 720px screen previews: no RAW decoding, no models.

use image::{DynamicImage, GrayImage, imageops::FilterType};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};

/// Longest edge the signature is computed at.
const ANALYSIS_DIM: u32 = 720;
/// Sharpness grid along the long and short edge of the frame.
const TILES_LONG: u32 = 6;
const TILES_SHORT: u32 = 4;
/// A tile belongs to the subject when some frame of the group is at least this sharp there,
/// relative to the sharpest tile of the group.
const SUBJECT_TILE_SHARE: f32 = 0.35;
/// Frames clipping this much more of the frame than the group's best lose some score.
const CLIP_MARGIN: f32 = 0.02;
const CLIP_PENALTY: f32 = 0.85;
/// The keeper must lead the next frame by this share of its score for the suggestion to be clear.
const CLEAR_MARGIN: f32 = 0.10;
/// Frames this close in time join on the normal similarity threshold.
const BURST_GAP_MS: i64 = 10_000;
/// Up to this gap only near-identical frames join (a retake of the same framing); beyond it a new
/// scene always starts. Many cameras record whole seconds only, so gaps are coarse.
const SCENE_GAP_MS: i64 = 60_000;
/// Share of the normal threshold that applies between bursts and scenes.
const RETAKE_FACTOR: f32 = 0.6;

/// One photo to consider, as known to the library.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameInput {
    pub path: String,
    /// Capture time in milliseconds (any epoch, only differences matter).
    pub time_ms: Option<i64>,
    pub camera: Option<String>,
    /// 1 = pick, -1 = reject.
    pub flag: Option<i8>,
    pub rating: Option<u8>,
    pub size: Option<u64>,
    pub mtime: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum KeeperBasis {
    /// Already picked by the user.
    Pick,
    /// Highest existing star rating.
    Rating,
    /// Sharpest in the subject regions.
    Sharpness,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarGroup {
    /// Members in capture order.
    pub paths: Vec<String>,
    /// Index into `paths`; `None` when every member is rejected.
    pub keeper: Option<usize>,
    /// Relative subject sharpness per member, 1.0 = best of the group.
    pub scores: Vec<f32>,
    pub basis: Option<KeeperBasis>,
    /// The keeper clearly leads (or was chosen by the user); otherwise it's a close call.
    pub clear: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupingResult {
    pub groups: Vec<SimilarGroup>,
    /// Photos that are not similar to a neighbour.
    pub singles: usize,
    /// Photos whose preview could not be read.
    pub failed: Vec<String>,
    pub cancelled: bool,
}

/// What grouping and ranking need to know about one frame's pixels.
#[derive(Debug, Clone)]
pub struct Signature {
    dhash: u64,
    /// 16x16 grayscale, zero mean, unit length.
    thumb: Vec<f32>,
    /// Coarse HSV histogram, sums to 1.
    hist: Vec<f32>,
    /// Sharpness per tile, reading order of the frame as displayed.
    tiles: Vec<f32>,
    /// Share of near-white pixels.
    clipped: f32,
}

pub fn signature(img: &DynamicImage) -> Signature {
    let img = if img.width().max(img.height()) > ANALYSIS_DIM {
        img.thumbnail(ANALYSIS_DIM, ANALYSIS_DIM)
    } else {
        img.clone()
    };
    let gray = img.to_luma8();
    let clipped = gray.pixels().filter(|p| p.0[0] >= 250).count() as f32 / (gray.len().max(1)) as f32;
    Signature {
        dhash: dhash(&gray),
        thumb: normalized_thumb(&gray),
        hist: color_histogram(&img),
        tiles: tile_sharpness(&gray),
        clipped,
    }
}

fn dhash(gray: &GrayImage) -> u64 {
    let small = image::imageops::resize(gray, 9, 8, FilterType::Triangle);
    let mut bits = 0u64;
    for y in 0..8 {
        for x in 0..8 {
            bits <<= 1;
            if small.get_pixel(x, y).0[0] > small.get_pixel(x + 1, y).0[0] {
                bits |= 1;
            }
        }
    }
    bits
}

fn normalized_thumb(gray: &GrayImage) -> Vec<f32> {
    let small = image::imageops::resize(gray, 16, 16, FilterType::Triangle);
    let mut v: Vec<f32> = small.pixels().map(|p| f32::from(p.0[0])).collect();
    let mean = v.iter().sum::<f32>() / v.len() as f32;
    v.iter_mut().for_each(|x| *x -= mean);
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-3 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
    v
}

/// 12 hue bins x 2 saturation x 2 value; low-saturation pixels land in hue bin 0.
fn color_histogram(img: &DynamicImage) -> Vec<f32> {
    let small = img.thumbnail(64, 64).to_rgb8();
    let mut hist = vec![0f32; 48];
    for p in small.pixels() {
        let [r, g, b] = p.0.map(|c| f32::from(c) / 255.0);
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let delta = max - min;
        let s = if max > 0.0 { delta / max } else { 0.0 };
        let h = if delta < 1e-6 || s < 0.15 {
            0.0
        } else if max == r {
            ((g - b) / delta).rem_euclid(6.0)
        } else if max == g {
            (b - r) / delta + 2.0
        } else {
            (r - g) / delta + 4.0
        } / 6.0;
        let hb = ((h * 12.0) as usize).min(11);
        let sb = usize::from(s >= 0.4);
        let vb = usize::from(max >= 0.5);
        hist[hb * 4 + sb * 2 + vb] += 1.0;
    }
    let total = hist.iter().sum::<f32>().max(1.0);
    hist.iter_mut().for_each(|x| *x /= total);
    hist
}

/// Variance of the Laplacian per tile, after a 3x3 box blur so sensor noise doesn't read as detail.
fn tile_sharpness(gray: &GrayImage) -> Vec<f32> {
    let (w, h) = gray.dimensions();
    let (cols, rows) = if w >= h { (TILES_LONG, TILES_SHORT) } else { (TILES_SHORT, TILES_LONG) };
    let n = (cols * rows) as usize;
    if w < 8 || h < 8 {
        return vec![0.0; n];
    }
    let px = |x: u32, y: u32| f32::from(gray.get_pixel(x, y).0[0]);
    let mut blurred = vec![0f32; (w * h) as usize];
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let mut s = 0.0;
            for dy in 0..3 {
                for dx in 0..3 {
                    s += px(x + dx - 1, y + dy - 1);
                }
            }
            blurred[(y * w + x) as usize] = s / 9.0;
        }
    }
    let b = |x: u32, y: u32| blurred[(y * w + x) as usize];
    let (mut sum, mut sq, mut cnt) = (vec![0f64; n], vec![0f64; n], vec![0u32; n]);
    for y in 2..h - 2 {
        for x in 2..w - 2 {
            let lap = f64::from(b(x - 1, y) + b(x + 1, y) + b(x, y - 1) + b(x, y + 1) - 4.0 * b(x, y));
            let t = ((y * rows / h) * cols + x * cols / w) as usize;
            sum[t] += lap;
            sq[t] += lap * lap;
            cnt[t] += 1;
        }
    }
    (0..n)
        .map(|t| {
            let c = f64::from(cnt[t].max(1));
            (sq[t] / c - (sum[t] / c).powi(2)) as f32
        })
        .collect()
}

/// Visual distance in 0..1; near-identical frames score well under 0.1.
pub fn distance(a: &Signature, b: &Signature) -> f32 {
    let hamming = (a.dhash ^ b.dhash).count_ones() as f32 / 64.0;
    let ncc: f32 = a.thumb.iter().zip(&b.thumb).map(|(x, y)| x * y).sum();
    let structure = ((1.0 - ncc) / 2.0).clamp(0.0, 1.0);
    let color = a.hist.iter().zip(&b.hist).map(|(x, y)| (x - y).abs()).sum::<f32>() / 2.0;
    0.30 * hamming + 0.45 * structure + 0.25 * color
}

/// Distance limits for `sensitivity` in 0 (strict) ..= 1 (loose): to the previous members, and to
/// the first member (so a slow pan can't chain unrelated frames together).
fn thresholds(sensitivity: f32) -> (f32, f32) {
    let near = 0.10 + 0.12 * sensitivity.clamp(0.0, 1.0);
    (near, near * 1.5)
}

/// Splits frames (indices, sorted by camera then time) into scenes at camera changes and long gaps.
fn scenes(order: &[usize], frames: &[FrameInput]) -> Vec<Vec<usize>> {
    let mut out: Vec<Vec<usize>> = Vec::new();
    for &i in order {
        match out.last_mut() {
            Some(s) if frames[i].camera == frames[*s.last().unwrap()].camera
                && gap_ms(frames, *s.last().unwrap(), i) <= SCENE_GAP_MS => s.push(i),
            _ => out.push(vec![i]),
        }
    }
    out
}

fn gap_ms(frames: &[FrameInput], a: usize, b: usize) -> i64 {
    (frames[b].time_ms.unwrap_or(0) - frames[a].time_ms.unwrap_or(0)).abs()
}

/// Groups one scene's frames (in time order) into runs of similar frames.
fn group_scene(scene: &[usize], frames: &[FrameInput], sigs: &[Option<Signature>], sensitivity: f32) -> Vec<Vec<usize>> {
    let (near, seed_limit) = thresholds(sensitivity);
    let d = |a: usize, b: usize| distance(sigs[a].as_ref().unwrap(), sigs[b].as_ref().unwrap());
    // Similar enough to belong together, given how far apart in time they were taken.
    let close = |a: usize, b: usize| d(a, b) <= if gap_ms(frames, a, b) <= BURST_GAP_MS { near } else { near * RETAKE_FACTOR };
    let mut groups: Vec<Vec<usize>> = Vec::new();
    for &i in scene {
        let joins = groups.last().is_some_and(|g| {
            // Close to one of the last few members (one odd frame doesn't break a burst) and still
            // close enough to where the group started.
            g.iter().rev().take(3).any(|&m| close(m, i)) && d(g[0], i) <= seed_limit
        });
        if joins {
            groups.last_mut().unwrap().push(i);
        } else {
            groups.push(vec![i]);
        }
    }
    // Merge neighbours that turn out to be the same shot (split by a run of odd frames).
    let mut merged: Vec<Vec<usize>> = Vec::new();
    for g in groups {
        if let Some(last) = merged.last_mut() {
            if close(last[last.len() / 2], g[g.len() / 2]) {
                last.extend(g);
                continue;
            }
        }
        merged.push(g);
    }
    merged
}

/// Scores members and suggests a keeper. Existing decisions come first: a rejected frame is never
/// suggested, a picked or top-rated one is preferred, and only then does sharpness decide.
fn rank(members: &[usize], sigs: &[Option<Signature>], frames: &[FrameInput]) -> (Option<usize>, Vec<f32>, Option<KeeperBasis>, bool) {
    let sig = |m: usize| sigs[m].as_ref().unwrap();
    let same_grid = members.iter().all(|&m| sig(m).tiles.len() == sig(members[0]).tiles.len());
    let raw: Vec<f32> = if same_grid {
        let n = sig(members[0]).tiles.len();
        let tile_max: Vec<f32> = (0..n).map(|k| members.iter().map(|&m| sig(m).tiles[k]).fold(0.0, f32::max)).collect();
        let peak = tile_max.iter().copied().fold(0.0, f32::max);
        let subject: Vec<usize> = (0..n).filter(|&k| peak > 0.0 && tile_max[k] >= SUBJECT_TILE_SHARE * peak).collect();
        members
            .iter()
            .map(|&m| {
                if subject.is_empty() {
                    return 0.0;
                }
                subject.iter().map(|&k| sig(m).tiles[k] / tile_max[k]).sum::<f32>() / subject.len() as f32
            })
            .collect()
    } else {
        // Mixed orientations: fall back to each frame's three sharpest tiles.
        members
            .iter()
            .map(|&m| {
                let mut t = sig(m).tiles.clone();
                t.sort_by(|a, b| b.total_cmp(a));
                t.iter().take(3).sum::<f32>() / 3.0
            })
            .collect()
    };
    let best_clip = members.iter().map(|&m| sig(m).clipped).fold(f32::INFINITY, f32::min);
    let penalized: Vec<f32> = members
        .iter()
        .zip(&raw)
        .map(|(&m, &s)| if sig(m).clipped > best_clip + CLIP_MARGIN { s * CLIP_PENALTY } else { s })
        .collect();
    let top = penalized.iter().copied().fold(0.0, f32::max);
    let scores: Vec<f32> = penalized.iter().map(|&s| if top > 0.0 { s / top } else { 0.0 }).collect();

    let eligible: Vec<usize> = (0..members.len()).filter(|&i| frames[members[i]].flag != Some(-1)).collect();
    if eligible.is_empty() {
        return (None, scores, None, false);
    }
    let best_of = |pool: &[usize]| *pool.iter().max_by(|&&a, &&b| scores[a].total_cmp(&scores[b])).unwrap();
    let picked: Vec<usize> = eligible.iter().copied().filter(|&i| frames[members[i]].flag == Some(1)).collect();
    let top_rating = eligible.iter().map(|&i| frames[members[i]].rating.unwrap_or(0)).max().unwrap_or(0);
    let (keeper, basis) = if !picked.is_empty() {
        (best_of(&picked), KeeperBasis::Pick)
    } else if top_rating > 0 {
        let rated: Vec<usize> = eligible.iter().copied().filter(|&i| frames[members[i]].rating.unwrap_or(0) == top_rating).collect();
        (best_of(&rated), KeeperBasis::Rating)
    } else {
        (best_of(&eligible), KeeperBasis::Sharpness)
    };
    let runner_up = eligible.iter().filter(|&&i| i != keeper).map(|&i| scores[i]).fold(0.0, f32::max);
    let clear = basis != KeeperBasis::Sharpness
        || (scores[keeper] > 0.0 && (scores[keeper] - runner_up) / scores[keeper] >= CLEAR_MARGIN);
    (Some(keeper), scores, Some(basis), clear)
}

/// Reads every frame's preview with `load` (in parallel), then groups and ranks.
/// `sensitivity`: 0 = only near-identical frames, 1 = also looser variations.
pub fn group_similar<L, C, P>(frames: &[FrameInput], sensitivity: f32, load: L, is_cancelled: C, progress: P) -> GroupingResult
where
    L: Fn(&FrameInput) -> anyhow::Result<DynamicImage> + Sync,
    C: Fn() -> bool + Sync,
    P: Fn(usize, usize) + Sync,
{
    let done = AtomicUsize::new(0);
    let total = frames.len();
    let sigs: Vec<Option<Signature>> = frames
        .par_iter()
        .map(|f| {
            if is_cancelled() {
                return None;
            }
            let sig = load(f).ok().map(|img| signature(&img));
            progress(done.fetch_add(1, Ordering::Relaxed) + 1, total);
            sig
        })
        .collect();
    if is_cancelled() {
        return GroupingResult { cancelled: true, ..Default::default() };
    }

    let failed: Vec<String> = frames.iter().zip(&sigs).filter(|(_, s)| s.is_none()).map(|(f, _)| f.path.clone()).collect();
    let mut order: Vec<usize> = (0..frames.len()).filter(|&i| sigs[i].is_some() && frames[i].time_ms.is_some()).collect();
    order.sort_by(|&a, &b| {
        (&frames[a].camera, frames[a].time_ms, &frames[a].path).cmp(&(&frames[b].camera, frames[b].time_ms, &frames[b].path))
    });

    let mut groups = Vec::new();
    let mut singles = frames.len() - failed.len() - order.len();
    for scene in scenes(&order, frames) {
        for members in group_scene(&scene, frames, &sigs, sensitivity) {
            if members.len() < 2 {
                singles += members.len();
                continue;
            }
            let (keeper, scores, basis, clear) = rank(&members, &sigs, frames);
            groups.push(SimilarGroup {
                paths: members.iter().map(|&m| frames[m].path.clone()).collect(),
                keeper,
                scores,
                basis,
                clear,
            });
        }
    }
    GroupingResult { groups, singles, failed, cancelled: false }
}

/// Reads a frame's 720px screen preview (from the cache when present, otherwise the embedded
/// preview), the same image the grid and loupe use.
pub fn load_preview(frame: &FrameInput) -> anyhow::Result<DynamicImage> {
    let bytes = crate::thumbnail::get_preview_jpeg_with_orient_and_hints(
        std::path::Path::new(&frame.path),
        2,
        None,
        frame.size,
        frame.mtime,
    )?;
    Ok(image::load_from_memory(&bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    /// A deterministic scene of colored rectangles; `seed` picks the layout.
    fn scene(seed: u32, shift: u32) -> DynamicImage {
        let mut img = RgbImage::from_pixel(480, 320, Rgb([40, 60, 90]));
        let mut s = seed.wrapping_mul(2_654_435_761).wrapping_add(1);
        let mut rnd = |m: u32| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            s % m
        };
        for _ in 0..25 {
            let (x, y, w, h) = (rnd(440), rnd(290), 10 + rnd(60), 8 + rnd(40));
            let c = Rgb([rnd(255) as u8, rnd(255) as u8, rnd(255) as u8]);
            for yy in y..(y + h).min(320) {
                for xx in (x + shift)..(x + shift + w).min(480) {
                    img.put_pixel(xx, yy, c);
                }
            }
        }
        DynamicImage::ImageRgb8(img)
    }

    fn brighter(img: &DynamicImage) -> DynamicImage {
        img.brighten(25)
    }

    fn frame(path: &str, t: i64) -> FrameInput {
        FrameInput { path: path.into(), time_ms: Some(t), camera: Some("cam".into()), flag: None, rating: None, size: None, mtime: None }
    }

    fn run(frames: &[FrameInput], images: &[(&str, DynamicImage)]) -> GroupingResult {
        let load = |f: &FrameInput| Ok(images.iter().find(|(p, _)| *p == f.path).unwrap().1.clone());
        group_similar(frames, 0.5, load, || false, |_, _| {})
    }

    #[test]
    fn distance_separates_scenes_and_tolerates_exposure_and_small_shifts() {
        let a = signature(&scene(1, 0));
        assert!(distance(&a, &signature(&brighter(&scene(1, 0)))) < 0.08);
        assert!(distance(&a, &signature(&scene(1, 4))) < 0.12);
        assert!(distance(&a, &signature(&scene(2, 0))) > 0.25);
    }

    #[test]
    fn groups_a_burst_and_suggests_the_sharp_frame() {
        let sharp = scene(1, 0);
        let soft = sharp.blur(2.0);
        let images = [("soft", soft), ("sharp", sharp.clone()), ("bright", brighter(&sharp).blur(1.2)), ("other", scene(2, 0))];
        let frames = [frame("soft", 0), frame("sharp", 300), frame("bright", 600), frame("other", 900)];
        let r = run(&frames, &images);
        assert_eq!(r.groups.len(), 1, "{r:?}");
        let g = &r.groups[0];
        assert_eq!(g.paths, ["soft", "sharp", "bright"]);
        assert_eq!(g.keeper, Some(1));
        assert_eq!(g.basis, Some(KeeperBasis::Sharpness));
        assert!(g.clear);
        assert!(g.scores[0] < 0.8 && (g.scores[1] - 1.0).abs() < 1e-6);
        assert_eq!(r.singles, 1);
    }

    #[test]
    fn long_pauses_split_scenes_even_for_identical_frames() {
        let img = scene(3, 0);
        let images = [("a", img.clone()), ("b", img.clone()), ("c", img.clone()), ("d", img)];
        // A burst of two, a pause of a minute, another burst of two.
        let frames = [frame("a", 0), frame("b", 200), frame("c", 90_000), frame("d", 90_200)];
        let r = run(&frames, &images);
        assert_eq!(r.groups.iter().map(|g| g.paths.clone()).collect::<Vec<_>>(), [vec!["a", "b"], vec!["c", "d"]]);
    }

    #[test]
    fn user_decisions_win_and_rejected_frames_are_never_suggested() {
        let sharp = scene(4, 0);
        let soft = sharp.blur(2.0);
        let images = [("soft", soft.clone()), ("sharp", sharp.clone()), ("soft2", soft)];
        let mut frames = vec![frame("soft", 0), frame("sharp", 100), frame("soft2", 200)];
        frames[1].flag = Some(-1); // the sharp one was rejected
        frames[2].flag = Some(1); // and a soft one picked
        let g = &run(&frames, &images).groups[0];
        assert_eq!(g.keeper, Some(2));
        assert_eq!(g.basis, Some(KeeperBasis::Pick));
        assert!(g.clear);
    }

    #[test]
    fn identical_frames_are_a_close_call() {
        let img = scene(5, 0);
        let images = [("a", img.clone()), ("b", img)];
        let g = &run(&[frame("a", 0), frame("b", 100)], &images).groups[0];
        assert!(!g.clear);
    }

    #[test]
    fn unreadable_previews_are_reported_not_grouped() {
        let frames = [frame("a", 0), frame("b", 100)];
        let load = |f: &FrameInput| if f.path == "a" { Ok(scene(1, 0)) } else { anyhow::bail!("offline") };
        let r = group_similar(&frames, 0.5, load, || false, |_, _| {});
        assert_eq!(r.failed, ["b"]);
        assert!(r.groups.is_empty());
        assert_eq!(r.singles, 1);
    }
}
