import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { normalizePath } from '../utils/image';
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
  is_monochrome_sensor?: boolean;
  is_monochrome_preview?: boolean;
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
}

interface LibraryStore {
  images: LibraryImage[];
  imageIndexMap: Map<string, number>;
  rootPath: string | null;
  setRootPath: (path: string | null) => void;
  setImages: (images: LibraryImage[]) => void;
  
  activeImageIndex: number;
  activeFolderPath: string | null;
  setActiveFolderPath: (path: string | null) => void;
  setActiveImageIndex: (index: number) => void;

  selectedPaths: Set<string>;
  setSelectedPaths: (paths: Set<string>) => void;
  toggleSelectedPath: (path: string) => void;
  selectRange: (fromIndex: number, toIndex: number, displayedImages: LibraryImage[]) => void;
  selectAll: (displayedImages: LibraryImage[]) => void;
  clearSelection: () => void;
  updateBatchCullingState: (paths: string[], partialState: Partial<CullingState>) => void;
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
  appendImageChunk: (chunk: LibraryImage[]) => void;
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

export const useLibraryStore = create<LibraryStore>((set) => ({
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
  appendImageChunk: (chunk) => set((state) => {
    if (chunk.length === 0) return state;
    const validChunk = state.rootPath
      ? chunk.filter(img => {
          const normRoot = normalizePath(state.rootPath!);
          const normPath = normalizePath(img.path);
          return normPath.startsWith(normRoot.endsWith('/') ? normRoot : normRoot + '/') || normPath === normRoot;
        })
      : chunk;
    if (validChunk.length === 0) return state;

    const startIdx = state.images.length;
    const nextMap = new Map(state.imageIndexMap);
    for (let i = 0; i < validChunk.length; i++) {
      nextMap.set(normalizePath(validChunk[i].path), startIdx + i);
    }
    return {
      images: [...state.images, ...validChunk],
      imageIndexMap: nextMap,
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
      return {
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
      const loadedImages = (await invoke('scan_archive_directory', {
        path,
        scanId,
        existingPaths,
        initialBytes: initialBytes > 0 ? initialBytes : null,
      })) as LibraryImage[];

      if (useLibraryStore.getState().activeScanId !== scanId) {
        return;
      }

      const currentScanState = useLibraryStore.getState().scanState;
      const nextScanState = currentScanState === 'completed' ? 'completed' : 'idle';
      if (currentScanState !== 'stopped') {
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
            return { images: allImages, imageIndexMap, isLoading: false, scanState: nextScanState };
          });
        } else {
          const imageIndexMap = new Map<string, number>();
          for (let i = 0; i < loadedImages.length; i++) {
            imageIndexMap.set(normalizePath(loadedImages[i].path), i);
          }
          set({ images: loadedImages, imageIndexMap, isLoading: false, scanState: nextScanState });
        }
      } else {
        set({ isLoading: false });
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
  setActiveFolderPath: (path) => set({ activeFolderPath: path, isViewingLastImport: false, activeImageIndex: 0, selectedPaths: new Set(), selectedRatingFilter: null, selectedColorFilter: null, selectedTagFilter: null }),
  setActiveImageIndex: (index) => set({ activeImageIndex: index }),

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
