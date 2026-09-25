import { create } from 'zustand';

interface LibraryUIStore {
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  
  isInspectorOpen: boolean;
  setIsInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;
  
  gridThumbnailSize: number;
  setGridThumbnailSize: (size: number) => void;
  
  gridColumns: number;
  setGridColumns: (cols: number) => void;
  
  gridScrollTop: number;
  setGridScrollTop: (top: number) => void;
  
  loupeScale: number;
  setLoupeScale: (scale: number) => void;
  
  showFilmstrip: boolean;
  setShowFilmstrip: (show: boolean) => void;
  toggleFilmstrip: () => void;
  
  filmstripHeight: number;
  setFilmstripHeight: (height: number) => void;
  
  autoAdvance: boolean;
  setAutoAdvance: (val: boolean) => void;
  
  invertScrollZoom: boolean;
  setInvertScrollZoom: (invert: boolean) => void;

  focusPeakingEnabled: boolean;
  setFocusPeakingEnabled: (enabled: boolean) => void;
  toggleFocusPeaking: () => void;

  focusPeakingColor: FocusPeakingColor;
  setFocusPeakingColor: (color: FocusPeakingColor) => void;

  focusPeakingThreshold: number;
  setFocusPeakingThreshold: (threshold: number) => void;
}

export type FocusPeakingColor = 'green' | 'red' | 'cyan' | 'yellow';

const getSavedFocusPeakingEnabled = (): boolean => {
  try {
    return localStorage.getItem('rapidready_focus_peaking_enabled') === 'true';
  } catch (_) {}
  return false;
};

const getSavedFocusPeakingColor = (): FocusPeakingColor => {
  try {
    const val = localStorage.getItem('rapidready_focus_peaking_color');
    if (val === 'green' || val === 'red' || val === 'cyan' || val === 'yellow') {
      return val;
    }
  } catch (_) {}
  return 'green';
};

const getSavedFocusPeakingThreshold = (): number => {
  try {
    const val = localStorage.getItem('rapidready_focus_peaking_threshold');
    if (val) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed >= 0.005 && parsed <= 0.200) {
        return parsed;
      }
    }
  } catch (_) {}
  return 0.040;
};

const getSavedThumbSize = (): number => {
  try {
    const saved = localStorage.getItem('rapidready_thumb_size');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 120 && parsed <= 400) {
        return parsed;
      }
    }
  } catch (_) {}
  return 180;
};

const getSavedFilmstripHeight = (): number => {
  try {
    const saved = localStorage.getItem('rapidready_filmstrip_height');
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= 56 && val <= 180) return val;
    }
  } catch (_) {}
  return 80;
};

export const useLibraryUIStore = create<LibraryUIStore>((set) => ({
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),
  
  isInspectorOpen: true,
  setIsInspectorOpen: (open) => set({ isInspectorOpen: open }),
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  
  gridThumbnailSize: getSavedThumbSize(),
  setGridThumbnailSize: (size) => {
    try {
      localStorage.setItem('rapidready_thumb_size', size.toString());
    } catch (_) {}
    set({ gridThumbnailSize: size });
  },
  
  gridColumns: 4,
  setGridColumns: (cols) => set((state) => (state.gridColumns === cols ? state : { gridColumns: cols })),
  
  gridScrollTop: 0,
  setGridScrollTop: (top) => set({ gridScrollTop: top }),
  
  loupeScale: 0,
  setLoupeScale: (scale) => set({ loupeScale: scale }),
  
  showFilmstrip: true,
  setShowFilmstrip: (show) => set({ showFilmstrip: show }),
  toggleFilmstrip: () => set((state) => ({ showFilmstrip: !state.showFilmstrip })),
  
  filmstripHeight: getSavedFilmstripHeight(),
  setFilmstripHeight: (height) => {
    try {
      localStorage.setItem('rapidready_filmstrip_height', height.toString());
    } catch (_) {}
    set({ filmstripHeight: height });
  },
  
  autoAdvance: true,
  setAutoAdvance: (val) => set({ autoAdvance: val }),
  
  invertScrollZoom: false,
  setInvertScrollZoom: (invert) => set({ invertScrollZoom: invert }),

  focusPeakingEnabled: getSavedFocusPeakingEnabled(),
  setFocusPeakingEnabled: (enabled) => {
    try {
      localStorage.setItem('rapidready_focus_peaking_enabled', enabled ? 'true' : 'false');
    } catch (_) {}
    set({ focusPeakingEnabled: enabled });
  },
  toggleFocusPeaking: () => set((state) => {
    const next = !state.focusPeakingEnabled;
    try {
      localStorage.setItem('rapidready_focus_peaking_enabled', next ? 'true' : 'false');
    } catch (_) {}
    return { focusPeakingEnabled: next };
  }),

  focusPeakingColor: getSavedFocusPeakingColor(),
  setFocusPeakingColor: (color) => {
    try {
      localStorage.setItem('rapidready_focus_peaking_color', color);
    } catch (_) {}
    set({ focusPeakingColor: color });
  },

  focusPeakingThreshold: getSavedFocusPeakingThreshold(),
  setFocusPeakingThreshold: (threshold) => {
    try {
      localStorage.setItem('rapidready_focus_peaking_threshold', threshold.toString());
    } catch (_) {}
    set({ focusPeakingThreshold: threshold });
  },
}));
