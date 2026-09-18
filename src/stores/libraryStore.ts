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
  date: string | null;
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
  appendImageChunk: (chunk: LibraryImage[], dirs?: string[]) => void;
  setScanState: (state: 'idle' | 'connecting' | 'scanning' | 'paused' | 'stopped' | 'completed') => void;
  setScanProgress: (progress: ArchiveScanProgress | null) => void;
  pauseScan: () => void;
  resumeScan: () => void;
  cancelScan: () => void;
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

let nextScanCounter = 1;

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
  discoveredFolders: new Set<string>(),
  addDiscoveredFolders: (folders) => set((state) => {
    if (!folders || folders.length === 0) return state;
    const next = new Set(state.discoveredFolders);
    let changed = false;
    for (const f of folders) {
      const norm = normalizePath(f);
      if (!next.has(norm)) {
        next.add(norm);
        changed = true;
      }
    }
    return changed ? { discoveredFolders: next } : state;
  }),
  removeFolder: (folderPath) => set((state) => {
    const norm = normalizePath(folderPath);
    const prefix = norm + '/';
    const next = new Set<string>();
    let changed = false;
    for (const f of state.discoveredFolders) {
      if (f === norm || f.startsWith(prefix)) {
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
      const updated = new Set(state.discoveredFolders);
      let fChanged = false;
      for (const d of dirs) {
        const normD = normalizePath(d);
        if (!updated.has(normD)) {
          updated.add(normD);
          fChanged = true;
        }
      }
      if (fChanged) nextFolders = updated;
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

    const startIdx = state.images.length;
    const nextMap = new Map(state.imageIndexMap);
    for (let i = 0; i < validChunk.length; i++) {
      nextMap.set(normalizePath(validChunk[i].path), startIdx + i);
    }
    return {
      images: [...state.images, ...validChunk],
      imageIndexMap: nextMap,
      discoveredFolders: nextFolders,
    };
  }),
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
  loadArchive: async (path: string, preserveExisting = false) => {
    const scanId = nextScanCounter++;
    const currentImages = useLibraryStore.getState().images;
    const isContinuing = preserveExisting && currentImages.length > 0;
    const existingPaths = isContinuing ? currentImages.map(i => i.path) : null;
    const initialBytes = isContinuing ? currentImages.reduce((sum, img) => sum + (img.size || 0), 0) : 0;

    set((s) => ({
      activeScanId: scanId,
      rootPath: path,
      activeFolderPath: path,
      selectedFolderPaths: path ? new Set([normalizePath(path)]) : new Set(),
      discoveredFolders: isContinuing ? s.discoveredFolders : (path ? new Set([normalizePath(path)]) : new Set()),
      viewMode: 'grid',
      isLoading: true,
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
      })) as { files: LibraryImage[]; directories: string[] };

      if (useLibraryStore.getState().activeScanId !== scanId) {
        return;
      }

      const loadedImages = scanResult.files || [];
      const loadedDirs = scanResult.directories || [];

      const currentScanState = useLibraryStore.getState().scanState;
      const nextScanState = currentScanState === 'completed' ? 'completed' : currentScanState === 'stopped' ? 'stopped' : 'idle';
      if (isContinuing) {
        set((state) => {
          const map = new Map<string, LibraryImage>();
          for (const img of state.images) {
            map.set(normalizePath(img.path), img);
          }
          for (const img of loadedImages) {
            map.set(normalizePath(img.path), img);
          }
          const allImages = Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
          const imageIndexMap = new Map<string, number>();
          for (let i = 0; i < allImages.length; i++) {
            imageIndexMap.set(normalizePath(allImages[i].path), i);
          }
          const nextFolders = new Set(state.discoveredFolders);
          for (const d of loadedDirs) {
            nextFolders.add(normalizePath(d));
          }
          return { images: allImages, imageIndexMap, discoveredFolders: nextFolders, isLoading: false, scanState: nextScanState };
        });
      } else {
        const sorted = (loadedImages && loadedImages.length > 0 ? loadedImages : useLibraryStore.getState().images)
          .slice()
          .sort((a, b) => a.path.localeCompare(b.path));
        const imageIndexMap = new Map<string, number>();
        for (let i = 0; i < sorted.length; i++) {
          imageIndexMap.set(normalizePath(sorted[i].path), i);
        }
        const nextFolders = new Set(useLibraryStore.getState().discoveredFolders);
        if (path) nextFolders.add(normalizePath(path));
        for (const d of loadedDirs) {
          nextFolders.add(normalizePath(d));
        }
        set({ images: sorted, imageIndexMap, discoveredFolders: nextFolders, isLoading: false, scanState: nextScanState });
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
    const norm = path ? normalizePath(path) : null;
    set({
      activeFolderPath: path,
      selectedFolderPaths: norm ? new Set([norm]) : new Set(),
      isViewingLastImport: false,
      activeImageIndex: 0,
      selectedPaths: new Set(),
      selectedRatingFilter: null,
      selectedColorFilter: null,
      selectedTagFilter: null,
    });
  },
  setSelectedFolderPaths: (paths) => {
    const normPaths = new Set(Array.from(paths).map(p => normalizePath(p)));
    const first = normPaths.size > 0 ? Array.from(normPaths)[0] : null;
    set({
      selectedFolderPaths: normPaths,
      activeFolderPath: first,
      isViewingLastImport: false,
      activeImageIndex: 0,
      selectedPaths: new Set(),
      selectedRatingFilter: null,
      selectedColorFilter: null,
      selectedTagFilter: null,
    });
  },
  setActiveImageIndex: (index) => set({ activeImageIndex: index }),
  selectAllInFolder: (folderPath, allFolderPaths) => {
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
        if (normP.startsWith(oldPrefix)) {
          const rel = normP.substring(oldPrefix.length);
          updatedDiscoveredFolders.add(normalizePath(newPrefix + rel));
          foldersChanged = true;
        } else if (normP === normOld) {
          updatedDiscoveredFolders.add(normalizePath(normNew));
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
  
  lastImportPaths: [],
  isViewingLastImport: false,
  setIsViewingLastImport: (viewing) => set({ isViewingLastImport: viewing, activeFolderPath: null, activeImageIndex: 0, selectedPaths: new Set(), selectedRatingFilter: null, selectedColorFilter: null, selectedTagFilter: null }),
  setLastImportPaths: (paths) => set({ lastImportPaths: paths }),
  
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
