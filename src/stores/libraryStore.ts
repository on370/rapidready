import { create } from 'zustand';

export interface CullingState {
  flag: number | null; // 1 = Pick, -1 = Reject, null = Unrated
  rating: number; // 0-5
  color: string | null;
  tags: string[];
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
  
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  
  filterMode: string;
  setFilterMode: (mode: string) => void;
  
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
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  images: [],
  rootPath: null,
  setRootPath: (path) => set({ rootPath: path }),
  setImages: (images) => set({ images, activeImageIndex: 0, isLoading: false }),
  
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  updateImageMetadata: (path, meta) => set((state) => {
    const idx = state.images.findIndex(img => img.path === path);
    if (idx === -1) return state;
    const newImages = [...state.images];
    newImages[idx] = { ...newImages[idx], ...meta };
    return { images: newImages };
  }),
  
  activeImageIndex: 0,
  activeFolderPath: null,
  setActiveFolderPath: (path) => set({ activeFolderPath: path, isViewingLastImport: false }),
  setActiveImageIndex: (index) => set({ activeImageIndex: index }),
  
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),
  
  lastImportPaths: [],
  isViewingLastImport: false,
  setIsViewingLastImport: (viewing) => set({ isViewingLastImport: viewing, activeFolderPath: null, activeImageIndex: 0 }),
  setLastImportPaths: (paths) => set({ lastImportPaths: paths }),
  
  filterMode: 'all',
  setFilterMode: (mode) => set({ filterMode: mode }),
  
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
    const idx = state.images.findIndex((img) => img.path === path);
    if (idx === -1) return state;
    const cur = state.images[idx].culling;
    if (
      cur.rating === culling.rating &&
      cur.flag === culling.flag &&
      cur.color === culling.color &&
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
  setInvertScrollZoom: (invertScrollZoom) => set({ invertScrollZoom })
}));
