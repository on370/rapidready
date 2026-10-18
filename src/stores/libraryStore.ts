import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { normalizePath, normalizeSlash } from '../utils/image';
import { useLibraryUIStore } from './libraryUIStore';

export interface CullingState {
  flag: number | null; // 1 = Pick, -1 = Reject, null = Unrated
  rating: number; // 0-5
  color: string | null;
  tags: string[];
  orientation?: number | null;
}

export interface LibraryImage {
  path: string;
  name: string;
  size: number;
  mtime?: number | null;
  date: string | null;
  date_modified?: string | null;
  width?: number | null;
  height?: number | null;
  exposure_bias?: string | null;
  focal_length?: string | null;
  camera: string | null;
  lens: string | null;
  iso: string | null;
  aperture: string | null;
  shutter: string | null;
  culling: CullingState;
  is_raw?: boolean;
  is_video?: boolean;
  is_monochrome_sensor?: boolean;
  is_monochrome_preview?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
}

export interface ArchiveScanProgress {
  scan_id?: number;
  files_found: number;
  total_bytes: number;
  current_dir: string;
  is_paused: boolean;
  is_cancelled: boolean;
  is_complete: boolean;
  phase?: 'discovering' | 'thumbnailing' | 'syncing' | string;
  total_files?: number;
}

export interface ArchiveChunkPayload {
  scan_id?: number;
  files: LibraryImage[];
  directories?: string[];
}

interface LibraryStore {
  images: LibraryImage[];
  imageIndexMap: Map<string, number>;
  rootPath: string | null;
  setRootPath: (path: string | null) => void;
  setImages: (images: LibraryImage[]) => void;
  
  activeImageIndex: number;
  activeFolderPath: string | null;
  selectedFolderPaths: Set<string>;
  discoveredFolders: Set<string>;
  setActiveFolderPath: (path: string | null) => void;
  setSelectedFolderPaths: (paths: Set<string>) => void;
  addDiscoveredFolders: (folders: string[]) => void;
  removeFolder: (folderPath: string) => void;
  setActiveImageIndex: (index: number) => void;
  renameFolderPath: (oldPath: string, newPath: string) => void;

  selectedPaths: Set<string>;
  setSelectedPaths: (paths: Set<string>) => void;
  toggleSelectedPath: (path: string) => void;
  selectRange: (fromIndex: number, toIndex: number, displayedImages: LibraryImage[]) => void;
  selectAll: (displayedImages: LibraryImage[]) => void;
  selectAllInFolder: (folderPath: string, allFolderPaths?: string[]) => void;
  selectAllInFolders: (topPaths: string[], allFolderPaths: string[]) => void;
  pendingSelectAll: boolean;
  setPendingSelectAll: (val: boolean) => void;
  clearSelection: () => void;
  updateBatchCullingState: (paths: string[], partialState: Partial<CullingState>) => void;
  updateBatchGps: (
    paths: string[],
    coords: { latitude: number | null; longitude: number | null; altitude?: number | null }
  ) => void;
  updateImageCullings: (items: Array<{ path: string; culling: CullingState }>) => void;
  
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  
  filterMode: string;
  setFilterMode: (mode: string) => void;
  selectedRatingFilter: number | null;
  setSelectedRatingFilter: (rating: number | null) => void;
  selectedColorFilter: string | null;
  setSelectedColorFilter: (color: string | null) => void;
  selectedTagFilter: string | null;
  setSelectedTagFilter: (tag: string | null) => void;
  
  autoAdvance: boolean;
  setAutoAdvance: (val: boolean) => void;
  
  updateCullingState: (index: number, partialState: Partial<CullingState>) => void;
  updateImageCullingByPath: (path: string, culling: CullingState) => void;
  invertScrollZoom: boolean;
  setInvertScrollZoom: (b: boolean) => void;
  
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  activeScanId: number | null;
  scanState: 'idle' | 'connecting' | 'scanning' | 'paused' | 'stopped' | 'completed';
  scanProgress: ArchiveScanProgress | null;
  isInitialScan: boolean;
  isFullyIndexed: boolean;
  setIsFullyIndexed: (isFully: boolean) => void;
  scanStartTime: number | null;
  appendImageChunk: (chunk: LibraryImage[], dirs?: string[]) => void;
  addImages: (newImages: LibraryImage[], newDirs?: string[]) => void;
  removeImages: (paths: string[]) => void;
  reconcileFolder: (folderPath?: string) => Promise<void>;
  reconcileActiveFolder: () => Promise<void>;
  reconcileArchiveDelta: (targetPath?: string, isBackground?: boolean) => Promise<void>;
  rebuildArchiveCatalog: (targetPath?: string) => Promise<void>;
  setScanState: (state: 'idle' | 'connecting' | 'scanning' | 'paused' | 'stopped' | 'completed') => void;
  setScanProgress: (progress: ArchiveScanProgress | null) => void;
  pauseScan: () => void;
  resumeScan: () => void;
  cancelScan: () => void;
  startThumbnailing: (targetPath?: string) => Promise<void>;
  loadArchive: (path: string, preserveExisting?: boolean) => Promise<void>;

  updateImageMetadata: (path: string, meta: Partial<LibraryImage>) => void;
  lastImportPaths: string[];
  isViewingLastImport: boolean;
  setIsViewingLastImport: (viewing: boolean) => void;
  setLastImportPaths: (paths: string[]) => void;
  
  gridThumbnailSize: number;
  setGridThumbnailSize: (size: number) => void;
  loupeScale: number;
  setLoupeScale: (scale: number) => void;
  activeImageFolder: string | null;
  setActiveImageFolder: (folder: string | null) => void;
}

const getSavedThumbSize = (): number => {
  try {
    const saved = localStorage.getItem('rapidready_thumb_size');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) return Math.max(120, Math.min(400, parsed));
    }
  } catch (_) {}
  return 190;
};

const getSavedLastImport = (): string[] => {
  try {
    const saved = localStorage.getItem('rapidready_last_import');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
};

let nextScanCounter = 1;

/**
 * Deduplicates and normalizes incoming folder paths against existing discovered folders.
 * Uses case-insensitive matching to prevent duplicate branches on Windows/macOS filesystems,
 * while authoritatively upgrading lowercase-only names when proper casing is discovered.
 * Performs zero allocations if no folders change.
 */
export function mergeFoldersDeduped(
  existing: Set<string>,
  incoming: Iterable<string> | null | undefined
): { next: Set<string>; changed: boolean } {
  if (!incoming) return { next: existing, changed: false };

  const lowerMap = new Map<string, string>();
  for (const f of existing) {
    lowerMap.set(f.toLowerCase(), f);
  }

  let changed = false;
  let next = existing;

  for (const raw of incoming) {
    if (!raw) continue;
    const norm = normalizeSlash(raw);
    const lower = norm.toLowerCase();
    const existingEntry = lowerMap.get(lower);

    if (!existingEntry) {
      if (!changed) {
        next = new Set(existing);
      }
      next.add(norm);
      lowerMap.set(lower, norm);
      changed = true;
    } else if (norm !== lower && existingEntry === lower) {
      // Authoritative casing upgrade (e.g. from "_inbox" to "_Inbox")
      if (!changed) {
        next = new Set(existing);
      }
      next.delete(existingEntry);
      next.add(norm);
      lowerMap.set(lower, norm);
      changed = true;
    }
  }

  return { next, changed };
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  images: [],
  imageIndexMap: new Map<string, number>(),
  rootPath: null,
  setRootPath: (path) => set({ rootPath: path }),
  setImages: (images) => {
    const map = new Map<string, number>();
    for (let i = 0; i < images.length; i++) {
      map.set(normalizePath(images[i].path), i);
    }
    set({ images, imageIndexMap: map, activeImageIndex: 0, selectedPaths: new Set(), isLoading: false });
  },
  
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  activeScanId: null,
  scanState: 'idle',
  scanProgress: null,
  isInitialScan: false,
  isFullyIndexed: false,
  setIsFullyIndexed: (val) => set({ isFullyIndexed: val }),
  scanStartTime: null,
  discoveredFolders: new Set<string>(),
  addDiscoveredFolders: (folders) => set((state) => {
    if (!folders || folders.length === 0) return state;
    const { next, changed } = mergeFoldersDeduped(state.discoveredFolders, folders);
    return changed ? { discoveredFolders: next } : state;
  }),
  removeFolder: (folderPath) => set((state) => {
    const norm = normalizeSlash(folderPath).toLowerCase();
    const prefix = norm + '/';
    const next = new Set<string>();
    let changed = false;
    for (const f of state.discoveredFolders) {
      const fNorm = normalizeSlash(f).toLowerCase();
      if (fNorm === norm || fNorm.startsWith(prefix)) {
        changed = true;
      } else {
        next.add(f);
      }
    }
    return changed ? { discoveredFolders: next } : state;
  }),
  appendImageChunk: (chunk, dirs = []) => set((state) => {
    let nextFolders = state.discoveredFolders;
    if (dirs && dirs.length > 0) {
      const { next, changed } = mergeFoldersDeduped(state.discoveredFolders, dirs);
      if (changed) nextFolders = next;
    }

    if (chunk.length === 0) {
      return nextFolders !== state.discoveredFolders ? { discoveredFolders: nextFolders } : state;
    }

    const validChunk = state.rootPath
      ? chunk.filter(img => {
          const normRoot = normalizePath(state.rootPath!);
          const normPath = normalizePath(img.path);
          return normPath.startsWith(normRoot.endsWith('/') ? normRoot : normRoot + '/') || normPath === normRoot;
        })
      : chunk;
    if (validChunk.length === 0) {
      return nextFolders !== state.discoveredFolders ? { discoveredFolders: nextFolders } : state;
    }

    const nextImages = [...state.images];
    const nextMap = new Map(state.imageIndexMap);
    let changed = false;

    for (const img of validChunk) {
      const norm = normalizePath(img.path);
      const existingIdx = nextMap.get(norm);
      if (existingIdx !== undefined) {
        nextImages[existingIdx] = { ...nextImages[existingIdx], ...img };
        changed = true;
      } else {
        const newIdx = nextImages.length;
        nextImages.push(img);
        nextMap.set(norm, newIdx);
        changed = true;
      }
    }

    if (!changed && nextFolders === state.discoveredFolders) {
      return state;
    }

    return {
      images: nextImages,
      imageIndexMap: nextMap,
      discoveredFolders: nextFolders,
    };
  }),
  addImages: (newImages, newDirs = []) => set((state) => {
    let nextFolders = state.discoveredFolders;
    if (newDirs && newDirs.length > 0) {
      const { next, changed } = mergeFoldersDeduped(state.discoveredFolders, newDirs);
      if (changed) nextFolders = next;
    }

    if (!newImages || newImages.length === 0) {
      return nextFolders !== state.discoveredFolders ? { discoveredFolders: nextFolders } : state;
    }

    const validImages = state.rootPath
      ? newImages.filter(img => {
          const normRoot = normalizePath(state.rootPath!);
          const normPath = normalizePath(img.path);
          return normPath.startsWith(normRoot.endsWith('/') ? normRoot : normRoot + '/') || normPath === normRoot;
        })
      : newImages;

    if (validImages.length === 0) {
      return nextFolders !== state.discoveredFolders ? { discoveredFolders: nextFolders } : state;
    }

    const nextImages = [...state.images];
    const nextMap = new Map(state.imageIndexMap);
    let changed = false;

    for (const img of validImages) {
      const norm = normalizePath(img.path);
      const existingIdx = nextMap.get(norm);
      if (existingIdx !== undefined) {
        nextImages[existingIdx] = { ...nextImages[existingIdx], ...img };
        changed = true;
      } else {
        const newIdx = nextImages.length;
        nextImages.push(img);
        nextMap.set(norm, newIdx);
        changed = true;
      }
    }

    if (!changed && nextFolders === state.discoveredFolders) {
      return state;
    }

    return {
      images: nextImages,
      imageIndexMap: nextMap,
      discoveredFolders: nextFolders,
    };
  }),
  removeImages: (paths) => set((state) => {
    if (!paths || paths.length === 0) return state;

    const toRemove = new Set<string>();
    for (const p of paths) {
      toRemove.add(normalizePath(p));
    }

    let anyFound = false;
    for (const p of toRemove) {
      if (state.imageIndexMap.has(p)) {
        anyFound = true;
        break;
      }
    }

    if (!anyFound) return state;

    const nextImages = state.images.filter(img => !toRemove.has(normalizePath(img.path)));
    const nextMap = new Map<string, number>();
    for (let i = 0; i < nextImages.length; i++) {
      nextMap.set(normalizePath(nextImages[i].path), i);
    }

    const nextSelected = new Set(state.selectedPaths);
    for (const p of toRemove) {
      nextSelected.delete(p);
    }

    const nextActiveIndex = state.activeImageIndex >= nextImages.length
      ? Math.max(0, nextImages.length - 1)
      : state.activeImageIndex;

    return {
      images: nextImages,
      imageIndexMap: nextMap,
      selectedPaths: nextSelected,
      activeImageIndex: nextActiveIndex,
    };
  }),
  reconcileFolder: async (targetPath?: string) => {
    const folder = targetPath || get().activeFolderPath;
    if (!folder) return;

    const normFolder = normalizePath(folder);
    const knownPaths = get().images
      .filter(img => {
        const p = normalizePath(img.path);
        const lastSlash = p.lastIndexOf('/');
        const dir = lastSlash >= 0 ? p.substring(0, lastSlash) : '';
        return dir === normFolder;
      })
      .map(img => img.path);

    try {
      const diff = await invoke<{
        folder_path: string;
        added: LibraryImage[];
        removed: string[];
        new_dirs: string[];
      }>('reconcile_folder', {
        folderPath: folder,
        knownPaths,
      });

      if (diff) {
        if ((diff.added && diff.added.length > 0) || (diff.new_dirs && diff.new_dirs.length > 0)) {
          get().addImages(diff.added || [], diff.new_dirs || []);
        }
        if (diff.removed && diff.removed.length > 0) {
          get().removeImages(diff.removed);
        }
      }
    } catch (err) {
      console.error('Error reconciling folder:', err);
    }
  },
  reconcileActiveFolder: async () => {
    return get().reconcileFolder();
  },
  setScanState: (scanState) => set({ scanState }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  pauseScan: () => {
    invoke('pause_archive_scan').catch(console.error);
    set((s) => ({
      scanState: 'paused',
      scanProgress: s.scanProgress ? { ...s.scanProgress, is_paused: true } : null,
    }));
  },
  resumeScan: () => {
    invoke('resume_archive_scan').catch(console.error);
    set((s) => ({
      scanState: 'scanning',
      scanProgress: s.scanProgress ? { ...s.scanProgress, is_paused: false } : null,
    }));
  },
  cancelScan: () => {
    invoke('cancel_archive_scan').catch(console.error);
    set((s) => {
      const isThumbnailing = s.scanProgress?.phase === 'thumbnailing';
      if (isThumbnailing) {
        // In Phase 2: Cancel halts background thumbnail generation, preserving all photos in the grid intact
        return {
          scanState: 'stopped',
          isLoading: false,
          scanProgress: s.scanProgress ? { ...s.scanProgress, is_cancelled: true } : null,
        };
      }
      const count = s.scanProgress?.files_found ?? s.images.length;
      const sortedImages = [...s.images].sort((a, b) => a.path.localeCompare(b.path));
      const imageIndexMap = new Map<string, number>();
      for (let i = 0; i < sortedImages.length; i++) {
        imageIndexMap.set(normalizePath(sortedImages[i].path), i);
      }
      return {
        images: sortedImages,
        imageIndexMap,
        scanState: count > 0 ? 'stopped' : 'idle',
        isLoading: false,
        scanProgress: s.scanProgress ? { ...s.scanProgress, is_cancelled: true } : null,
      };
    });
  },
  startThumbnailing: async (targetPath?: string) => {
    const root = targetPath || get().rootPath;
    if (!root) return;
    const scanId = nextScanCounter++;
    const totalFiles = get().images.length;
    set({
      activeScanId: scanId,
      scanState: 'scanning',
      isInitialScan: true,
      scanProgress: {
        scan_id: scanId,
        files_found: 0,
        total_bytes: 0,
        current_dir: root,
        is_paused: false,
        is_cancelled: false,
        is_complete: false,
        phase: 'thumbnailing',
        total_files: totalFiles,
      },
    });
    try {
      await invoke('start_archive_thumbnailing', { path: root, scanId });
    } catch (err) {
      console.error('Failed to start archive thumbnailing:', err);
    }
  },
  reconcileArchiveDelta: async (targetPath?: string, isBackground = false) => {
    const root = targetPath || get().rootPath;
    if (!root) return;

    const scanId = nextScanCounter++;
    if (!isBackground) {
      set({
        activeScanId: scanId,
        scanState: 'scanning',
        scanProgress: {
          scan_id: scanId,
          files_found: get().images.length,
          total_bytes: 0,
          current_dir: root,
          is_paused: false,
          is_cancelled: false,
          is_complete: false,
          phase: 'syncing',
        },
      });
    }

    try {
      const delta = await invoke<{
        root_path: string;
        added: LibraryImage[];
        updated: LibraryImage[];
        removed: string[];
        new_dirs: string[];
      }>('reconcile_archive_delta', {
        path: root,
        scanId,
      });

      if (delta) {
        if ((delta.added && delta.added.length > 0) || (delta.new_dirs && delta.new_dirs.length > 0)) {
          get().addImages(delta.added || [], delta.new_dirs || []);
        }
        if (delta.removed && delta.removed.length > 0) {
          get().removeImages(delta.removed);
        }
        if (delta.updated && delta.updated.length > 0) {
          for (const item of delta.updated) {
            get().updateImageMetadata(item.path, item);
          }
        }
      }

      if (!isBackground) {
        set({
          scanState: 'completed',
          scanProgress: get().scanProgress ? {
            ...get().scanProgress!,
            is_complete: true,
          } : null,
        });
      }
    } catch (err) {
      console.error('Error reconciling archive delta:', err);
      if (!isBackground) {
        set({ scanState: 'idle' });
      }
    }
  },
  rebuildArchiveCatalog: async (targetPath?: string) => {
    const root = targetPath || get().rootPath;
    if (!root) return;
    try {
      await invoke('rebuild_archive_catalog', { path: root });
      set({
        images: [],
        imageIndexMap: new Map(),
        discoveredFolders: new Set([normalizeSlash(root)]),
        isInitialScan: true,
        scanStartTime: Date.now(),
      });
      await get().loadArchive(root, false);
    } catch (err) {
      console.error('Error rebuilding archive catalog:', err);
    }
  },
  loadArchive: async (path: string, preserveExisting = false) => {
    const scanId = nextScanCounter++;
    const currentImages = useLibraryStore.getState().images;
    const isContinuing = preserveExisting && currentImages.length > 0;

    if (!isContinuing) {
      // Phase 1 (< 30 ms): Try loading cached metadata from local SQLite archive_catalog.db
      try {
        const cached = await invoke<{
          files: LibraryImage[];
          directories: string[];
          is_fully_indexed?: boolean;
        }>('get_cached_archive_files', { path });

        if (cached && cached.files && cached.files.length > 0) {
          const sorted = cached.files.slice().sort((a, b) => a.path.localeCompare(b.path));
          const imageIndexMap = new Map<string, number>();
          for (let i = 0; i < sorted.length; i++) {
            imageIndexMap.set(normalizePath(sorted[i].path), i);
          }
          const initialFolders = new Set<string>();
          initialFolders.add(normalizeSlash(path));
          const { next: nextFolders } = mergeFoldersDeduped(initialFolders, cached.directories || []);

          const isFullyIndexed = cached.is_fully_indexed === true;
          const initialBytes = sorted.reduce((sum, img) => sum + (img.size || 0), 0);

          set({
            activeScanId: scanId,
            rootPath: path,
            activeFolderPath: path,
            selectedFolderPaths: path ? new Set([normalizePath(path)]) : new Set(),
            discoveredFolders: nextFolders,
            viewMode: 'grid',
            isLoading: false,
            scanState: isFullyIndexed ? 'idle' : 'scanning',
            isInitialScan: !isFullyIndexed,
            isFullyIndexed,
            scanStartTime: isFullyIndexed ? null : Date.now(),
            scanProgress: isFullyIndexed ? null : {
              scan_id: scanId,
              files_found: 0,
              total_bytes: initialBytes,
              current_dir: path,
              is_paused: false,
              is_cancelled: false,
              is_complete: false,
              phase: 'thumbnailing',
              total_files: sorted.length,
            },
            images: sorted,
            imageIndexMap,
          });

          if (isFullyIndexed) {
            // Phase 2: Start background delta-sync silently without blocking UI
            // Delay by 2000ms so initial viewport grid tiles have 100% free bandwidth
            setTimeout(() => {
              if (useLibraryStore.getState().rootPath === path) {
                useLibraryStore.getState().reconcileArchiveDelta(path, true);
              }
            }, 2000);
          } else {
            invoke('start_archive_thumbnailing', { path, scanId }).catch(() => {});
          }
          return;
        }
      } catch (e) {
        console.warn("Failed to load cached archive metadata, falling back to full scan:", e);
      }
    }

    const isInitial = !isContinuing;
    const existingPaths = isContinuing ? currentImages.map(i => i.path) : null;
    const initialBytes = isContinuing ? currentImages.reduce((sum, img) => sum + (img.size || 0), 0) : 0;

    set((s) => ({
      activeScanId: scanId,
      rootPath: path,
      activeFolderPath: path,
      selectedFolderPaths: path ? new Set([normalizePath(path)]) : new Set(),
      discoveredFolders: isContinuing ? s.discoveredFolders : (path ? new Set([normalizeSlash(path)]) : new Set()),
      viewMode: 'grid',
      isLoading: true,
      isInitialScan: isInitial,
      scanStartTime: isInitial ? Date.now() : null,
      scanState: isContinuing ? 'scanning' : 'connecting',
      scanProgress: isContinuing ? {
        scan_id: scanId,
        files_found: s.images.length,
        total_bytes: initialBytes,
        current_dir: path,
        is_paused: false,
        is_cancelled: false,
        is_complete: false,
      } : null,
      images: isContinuing ? s.images : [],
      imageIndexMap: isContinuing ? s.imageIndexMap : new Map<string, number>(),
    }));
    try {
      const scanResult = (await invoke('scan_archive_directory', {
        path,
        scanId,
        existingPaths,
        initialBytes: initialBytes > 0 ? initialBytes : null,
      })) as { files: LibraryImage[]; directories: string[]; is_fully_indexed?: boolean };

      if (useLibraryStore.getState().activeScanId !== scanId) {
        return;
      }

      const loadedImages = scanResult.files || [];
      const loadedDirs = scanResult.directories || [];
      const isFullyIndexed = scanResult.is_fully_indexed === true;

      const currentScanState = useLibraryStore.getState().scanState;
      const isCancelledOrStopped = currentScanState === 'stopped';
      const shouldStartPhase2 = !isFullyIndexed && !isCancelledOrStopped;
      const nextScanState = isCancelledOrStopped ? 'stopped' : (shouldStartPhase2 ? 'scanning' : (currentScanState === 'completed' ? 'completed' : 'idle'));

      let finalImagesCount = 0;
      if (isContinuing) {
        set((state) => {
          const map = new Map<string, LibraryImage>();
          for (const img of state.images) {
            map.set(normalizePath(img.path), img);
          }
          for (const img of loadedImages) {
            map.set(normalizePath(img.path), img);
          }
          const allImages = Array.from(map.values()).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
          finalImagesCount = allImages.length;
          const imageIndexMap = new Map<string, number>();
          for (let i = 0; i < allImages.length; i++) {
            imageIndexMap.set(normalizePath(allImages[i].path), i);
          }
          const { next: nextFolders } = mergeFoldersDeduped(state.discoveredFolders, loadedDirs);
          return {
            images: allImages,
            imageIndexMap,
            discoveredFolders: nextFolders,
            isLoading: false,
            scanState: nextScanState,
            isInitialScan: shouldStartPhase2 ? true : state.isInitialScan,
            scanProgress: shouldStartPhase2 ? {
              scan_id: scanId,
              files_found: state.scanProgress?.files_found ?? finalImagesCount,
              total_bytes: 0,
              current_dir: path,
              is_paused: false,
              is_cancelled: false,
              is_complete: false,
              phase: 'thumbnailing',
              total_files: finalImagesCount,
            } : state.scanProgress,
            isFullyIndexed,
          };
        });
      } else {
        const sorted = (loadedImages && loadedImages.length > 0 ? loadedImages : useLibraryStore.getState().images)
          .slice()
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        finalImagesCount = sorted.length;
        const imageIndexMap = new Map<string, number>();
        for (let i = 0; i < sorted.length; i++) {
          imageIndexMap.set(normalizePath(sorted[i].path), i);
        }
        const initialFolders = new Set(useLibraryStore.getState().discoveredFolders);
        if (path) {
          initialFolders.add(normalizeSlash(path));
        }
        const { next: nextFolders } = mergeFoldersDeduped(initialFolders, loadedDirs);
        const prevProg = useLibraryStore.getState().scanProgress;
        set({
          images: sorted,
          imageIndexMap,
          discoveredFolders: nextFolders,
          isLoading: false,
          scanState: nextScanState,
          isInitialScan: shouldStartPhase2,
          scanProgress: shouldStartPhase2 ? {
            scan_id: scanId,
            files_found: prevProg?.files_found ?? finalImagesCount,
            total_bytes: 0,
            current_dir: path,
            is_paused: false,
            is_cancelled: false,
            is_complete: false,
            phase: 'thumbnailing',
            total_files: finalImagesCount,
          } : null,
          isFullyIndexed,
        });
      }

      if (shouldStartPhase2) {
        // Phase 1 (Discovery) completed! Start Phase 2 (Background Thumbnailing)
        invoke('start_archive_thumbnailing', { path, scanId }).catch((err) => {
          console.error("Failed to start archive thumbnailing:", err);
        });
      }
    } catch (e) {
      if (useLibraryStore.getState().activeScanId === scanId) {
        console.error("Failed to load archive directory:", e);
        set({ isLoading: false, scanState: 'idle' });
      }
    }
  },
  updateImageMetadata: (path, meta) => set((state) => {
    const norm = normalizePath(path);
    const idx = state.imageIndexMap.get(norm);
    if (idx === undefined || !state.images[idx]) return state;
    const newImages = [...state.images];
    newImages[idx] = { ...newImages[idx], ...meta };
    return { images: newImages };
  }),
  
  activeImageIndex: 0,
  activeFolderPath: null,
  selectedFolderPaths: new Set<string>(),
  pendingSelectAll: false,
  setPendingSelectAll: (val) => set({ pendingSelectAll: val }),
  setActiveFolderPath: (path) => {
    invoke('set_active_viewport_folder', { folderPath: path || null }).catch(() => {});
    const norm = path ? normalizePath(path) : null;
    set((state) => ({
      activeFolderPath: path,
      selectedFolderPaths: norm ? new Set([norm]) : new Set(),
      isViewingLastImport: path ? false : state.isViewingLastImport,
      activeImageIndex: 0,
      selectedPaths: new Set(),
      selectedRatingFilter: null,
      selectedColorFilter: null,
      selectedTagFilter: null,
    }));
  },
  setSelectedFolderPaths: (paths) => {
    const normPaths = new Set(Array.from(paths).map(p => normalizePath(p)));
    const first = normPaths.size > 0 ? Array.from(normPaths)[0] : null;
    invoke('set_active_viewport_folder', { folderPath: first || null }).catch(() => {});
    set((state) => ({
      selectedFolderPaths: normPaths,
      activeFolderPath: first,
      isViewingLastImport: normPaths.size > 0 ? false : state.isViewingLastImport,
      activeImageIndex: 0,
      selectedPaths: new Set(),
      selectedRatingFilter: null,
      selectedColorFilter: null,
      selectedTagFilter: null,
    }));
  },
  setActiveImageIndex: (index) => set({ activeImageIndex: index }),
  selectAllInFolder: (folderPath, allFolderPaths) => {
    invoke('set_active_viewport_folder', { folderPath: folderPath || null }).catch(() => {});
    const normTarget = normalizePath(folderPath);
    const { images } = get();
    const matching = images.filter(img => {
      const p = normalizePath(img.path);
      return p.startsWith(normTarget + '/') || p === normTarget;
    });
    const nextSelected = new Set(matching.map(i => i.path));
    const folderSet = allFolderPaths && allFolderPaths.length > 0
      ? new Set(allFolderPaths.map(p => normalizePath(p)))
      : new Set([normTarget]);
    set({
      activeFolderPath: folderPath,
      selectedFolderPaths: folderSet,
      isViewingLastImport: false,
      activeImageIndex: 0,
      selectedPaths: nextSelected,
      selectedRatingFilter: null,
      selectedColorFilter: null,
      selectedTagFilter: null,
      pendingSelectAll: true,
    });
  },
  selectAllInFolders: (topPaths, allFolderPaths) => {
    const folderSet = new Set(allFolderPaths.map(p => normalizePath(p)));
    const { images } = get();
    const matching = images.filter(img => {
      const p = normalizePath(img.path);
      const lastSlash = p.lastIndexOf('/');
      const dir = lastSlash > 0 ? p.substring(0, lastSlash) : p;
      return folderSet.has(dir);
    });
    const nextSelected = new Set(matching.map(i => i.path));
    set({
      activeFolderPath: topPaths[0] || null,
      selectedFolderPaths: folderSet,
      isViewingLastImport: false,
      activeImageIndex: 0,
      selectedPaths: nextSelected,
      selectedRatingFilter: null,
      selectedColorFilter: null,
      selectedTagFilter: null,
      pendingSelectAll: true,
    });
  },
  renameFolderPath: (oldPath: string, newPath: string) => {
    const normOld = normalizeSlash(oldPath);
    const normNew = normalizeSlash(newPath);
    const oldPrefix = normOld + '/';
    const newPrefix = normNew + '/';

    set((state) => {
      let anyChanged = false;
      const updatedImages = state.images.map((img) => {
        const normImg = normalizeSlash(img.path);
        if (normImg.startsWith(oldPrefix)) {
          anyChanged = true;
          const rel = normImg.substring(oldPrefix.length);
          return {
            ...img,
            path: newPrefix + rel,
          };
        } else if (normImg === normOld) {
          anyChanged = true;
          return {
            ...img,
            path: normNew,
          };
        }
        return img;
      });

      const updatedSelectedFolderPaths = new Set<string>();
      for (const p of state.selectedFolderPaths) {
        const normP = normalizeSlash(p);
        if (normP.startsWith(oldPrefix)) {
          const rel = normP.substring(oldPrefix.length);
          updatedSelectedFolderPaths.add(normalizePath(newPrefix + rel));
        } else if (normP === normOld) {
          updatedSelectedFolderPaths.add(normalizePath(normNew));
        } else {
          updatedSelectedFolderPaths.add(p);
        }
      }

      let updatedActiveFolder = state.activeFolderPath;
      if (updatedActiveFolder) {
        const normActive = normalizeSlash(updatedActiveFolder);
        if (normActive.startsWith(oldPrefix)) {
          updatedActiveFolder = newPrefix + normActive.substring(oldPrefix.length);
        } else if (normActive === normOld) {
          updatedActiveFolder = normNew;
        }
      }

      const updatedSelectedPaths = new Set<string>();
      for (const p of state.selectedPaths) {
        const normP = normalizeSlash(p);
        if (normP.startsWith(oldPrefix)) {
          const rel = normP.substring(oldPrefix.length);
          updatedSelectedPaths.add(newPrefix + rel);
        } else if (normP === normOld) {
          updatedSelectedPaths.add(normNew);
        } else {
          updatedSelectedPaths.add(p);
        }
      }

      const updatedDiscoveredFolders = new Set<string>();
      let foldersChanged = false;
      for (const p of state.discoveredFolders) {
        const normP = normalizeSlash(p);
        if (normP.toLowerCase().startsWith(oldPrefix.toLowerCase())) {
          const rel = normP.substring(oldPrefix.length);
          updatedDiscoveredFolders.add(normalizeSlash(newPrefix + rel));
          foldersChanged = true;
        } else if (normP.toLowerCase() === normOld.toLowerCase()) {
          updatedDiscoveredFolders.add(normalizeSlash(normNew));
          foldersChanged = true;
        } else {
          updatedDiscoveredFolders.add(p);
        }
      }

      if (!anyChanged && !foldersChanged && updatedSelectedFolderPaths.size === state.selectedFolderPaths.size && updatedActiveFolder === state.activeFolderPath) {
        return state;
      }

      const newIndexMap = new Map<string, number>();
      for (let i = 0; i < updatedImages.length; i++) {
        newIndexMap.set(normalizePath(updatedImages[i].path), i);
      }

      return {
        images: updatedImages,
        imageIndexMap: newIndexMap,
        selectedFolderPaths: updatedSelectedFolderPaths,
        activeFolderPath: updatedActiveFolder,
        selectedPaths: updatedSelectedPaths,
        discoveredFolders: updatedDiscoveredFolders,
      };
    });
  },

  selectedPaths: new Set<string>(),
  setSelectedPaths: (paths) => set({ selectedPaths: paths }),
  toggleSelectedPath: (path) => set((state) => {
    const next = new Set(state.selectedPaths);
    if (next.has(path)) {
      next.delete(path);
      return { selectedPaths: next };
    }
    const norm = normalizePath(path);
    let found: string | null = null;
    for (const p of next) {
      if (normalizePath(p) === norm) {
        found = p;
        break;
      }
    }
    if (found) {
      next.delete(found);
    } else {
      next.add(path);
    }
    return { selectedPaths: next };
  }),
  selectRange: (fromIndex, toIndex, displayedImages) => set(() => {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const next = new Set<string>();
    for (let i = start; i <= end; i++) {
      if (displayedImages[i]) {
        next.add(displayedImages[i].path);
      }
    }
    return { selectedPaths: next };
  }),
  selectAll: (displayedImages) => set(() => ({
    selectedPaths: new Set(displayedImages.map(img => img.path))
  })),
  clearSelection: () => set({ selectedPaths: new Set() }),
  updateBatchCullingState: (paths, partialState) => set((state) => {
    const newImages = [...state.images];
    let changed = false;
    for (const path of paths) {
      const idx = state.imageIndexMap.get(normalizePath(path));
      if (idx !== undefined && newImages[idx]) {
        newImages[idx] = {
          ...newImages[idx],
          culling: {
            ...newImages[idx].culling,
            ...partialState
          }
        };
        changed = true;
      }
    }
    return changed ? { images: newImages } : state;
  }),
  updateBatchGps: (paths, coords) => set((state) => {
    const newImages = [...state.images];
    let changed = false;
    for (const path of paths) {
      const idx = state.imageIndexMap.get(normalizePath(path));
      if (idx !== undefined && newImages[idx]) {
        newImages[idx] = {
          ...newImages[idx],
          latitude: coords.latitude,
          longitude: coords.longitude,
          altitude: coords.altitude !== undefined ? coords.altitude : (coords.latitude === null ? null : newImages[idx].altitude),
        };
        changed = true;
      }
    }
    return changed ? { images: newImages } : state;
  }),
  updateImageCullings: (items) => set((state) => {
    const newImages = [...state.images];
    let changed = false;
    for (const item of items) {
      const idx = state.imageIndexMap.get(normalizePath(item.path));
      if (idx !== undefined && newImages[idx]) {
        newImages[idx] = {
          ...newImages[idx],
          culling: {
            ...newImages[idx].culling,
            ...item.culling,
          },
        };
        changed = true;
      }
    }
    return changed ? { images: newImages } : state;
  }),
  
  viewMode: 'grid',
  setViewMode: (mode) => {
    useLibraryUIStore.getState().setViewMode(mode);
    set({ viewMode: mode });
  },
  
  lastImportPaths: getSavedLastImport(),
  isViewingLastImport: false,
  setIsViewingLastImport: (viewing) => set({
    isViewingLastImport: viewing,
    activeFolderPath: null,
    selectedFolderPaths: new Set(),
    activeImageIndex: 0,
    selectedPaths: new Set(),
    selectedRatingFilter: null,
    selectedColorFilter: null,
    selectedTagFilter: null
  }),
  setLastImportPaths: (paths) => {
    try {
      localStorage.setItem('rapidready_last_import', JSON.stringify(paths));
    } catch (_) {}
    set({ lastImportPaths: paths });
  },
  
  filterMode: 'all',
  setFilterMode: (mode) => set({ filterMode: mode }),
  selectedRatingFilter: null,
  setSelectedRatingFilter: (rating) => set({ selectedRatingFilter: rating, activeImageIndex: 0 }),
  selectedColorFilter: null,
  setSelectedColorFilter: (color) => set({ selectedColorFilter: color, activeImageIndex: 0 }),
  selectedTagFilter: null,
  setSelectedTagFilter: (tag) => set({ selectedTagFilter: tag, activeImageIndex: 0 }),
  
  autoAdvance: true,
  setAutoAdvance: (val) => set({ autoAdvance: val }),
  
  updateCullingState: (index, partialState) => set((state) => {
    if (!state.images[index]) return state;
    const newImages = [...state.images];
    newImages[index] = {
      ...newImages[index],
      culling: {
        ...newImages[index].culling,
        ...partialState
      }
    };
    return { images: newImages };
  }),
  updateImageCullingByPath: (path, culling) => set((state) => {
    const norm = normalizePath(path);
    const idx = state.imageIndexMap.get(norm);
    if (idx === undefined || !state.images[idx]) return state;
    const cur = state.images[idx].culling;
    if (
      cur.rating === culling.rating &&
      cur.flag === culling.flag &&
      cur.color === culling.color &&
      cur.orientation === culling.orientation &&
      JSON.stringify(cur.tags) === JSON.stringify(culling.tags)
    ) {
      return state;
    }
    const newImages = [...state.images];
    newImages[idx] = {
      ...newImages[idx],
      culling: {
        ...newImages[idx].culling,
        ...culling,
      },
    };
    return { images: newImages };
  }),
  invertScrollZoom: false,
  setInvertScrollZoom: (invertScrollZoom) => {
    useLibraryUIStore.getState().setInvertScrollZoom(invertScrollZoom);
    set({ invertScrollZoom });
  },
  
  gridThumbnailSize: getSavedThumbSize(),
  setGridThumbnailSize: (size) => {
    try {
      localStorage.setItem('rapidready_thumb_size', size.toString());
    } catch (_) {}
    useLibraryUIStore.getState().setGridThumbnailSize(size);
    set({ gridThumbnailSize: size });
  },
  loupeScale: 0,
  setLoupeScale: (scale) => {
    useLibraryUIStore.getState().setLoupeScale(scale);
    set({ loupeScale: scale });
  },
  activeImageFolder: null,
  setActiveImageFolder: (folder) => set({ activeImageFolder: folder }),
}));
