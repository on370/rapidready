import { create } from 'zustand';
import { normalizePath } from '../utils/image';

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
}

interface LibraryStore {
  images: LibraryImage[];
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

export const useLibraryStore = create<LibraryStore>((set) => ({
  images: [],
  rootPath: null,
  setRootPath: (path) => set({ rootPath: path }),
  setImages: (images) => set({ images, activeImageIndex: 0, selectedPaths: new Set(), isLoading: false }),
  
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  updateImageMetadata: (path, meta) => set((state) => {
    const norm = normalizePath(path);
    const idx = state.images.findIndex(img => normalizePath(img.path) === norm);
    if (idx === -1) return state;
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
    const pathSet = new Set(paths.map(p => normalizePath(p)));
    const newImages = state.images.map(img => {
      if (pathSet.has(normalizePath(img.path))) {
        return {
          ...img,
          culling: {
            ...img.culling,
            ...partialState
          }
        };
      }
      return img;
    });
    return { images: newImages };
  }),
  updateImageCullings: (items) => set((state) => {
    const map = new Map<string, CullingState>();
    for (const item of items) {
      map.set(normalizePath(item.path), item.culling);
    }
    const newImages = state.images.map((img) => {
      const nextCulling = map.get(normalizePath(img.path));
      if (nextCulling) {
        return {
          ...img,
          culling: {
            ...img.culling,
            ...nextCulling,
          },
        };
      }
      return img;
    });
    return { images: newImages };
  }),
  
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),
  
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
    const newImages = [...state.images];
    if (newImages[index]) {
      newImages[index] = {
        ...newImages[index],
        culling: {
          ...newImages[index].culling,
          ...partialState
        }
      };
    }
    return { images: newImages };
  }),
  updateImageCullingByPath: (path, culling) => set((state) => {
    const norm = normalizePath(path);
    const idx = state.images.findIndex((img) => normalizePath(img.path) === norm);
    if (idx === -1) return state;
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
  setInvertScrollZoom: (invertScrollZoom) => set({ invertScrollZoom }),
  
  gridThumbnailSize: getSavedThumbSize(),
  setGridThumbnailSize: (size) => {
    try {
      localStorage.setItem('rapidready_thumb_size', size.toString());
    } catch (_) {}
    set({ gridThumbnailSize: size });
  },
  loupeScale: 0,
  setLoupeScale: (scale) => set({ loupeScale: scale }),
  activeImageFolder: null,
  setActiveImageFolder: (folder) => set({ activeImageFolder: folder }),
}));
