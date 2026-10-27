import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';

const resetOsFullscreenIfActive = async () => {
  try {
    const win = getCurrentWindow();
    const isFs = await win.isFullscreen();
    if (isFs) {
      await win.setFullscreen(false);
    }
  } catch (_) {}
};

interface LibraryUIStore {
  viewMode: 'grid' | 'loupe' | 'fullscreen';
  previousViewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe' | 'fullscreen') => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  toggleFullscreen: () => void;

  isSlideshowPlaying: boolean;
  setIsSlideshowPlaying: (playing: boolean) => void;
  toggleSlideshowPlaying: () => void;

  slideshowIntervalSec: 2 | 3 | 5 | 10;
  setSlideshowIntervalSec: (sec: 2 | 3 | 5 | 10) => void;

  slideshowLoop: boolean;
  setSlideshowLoop: (loop: boolean) => void;
  toggleSlideshowLoop: () => void;

  slideshowCrossfade: boolean;
  setSlideshowCrossfade: (crossfade: boolean) => void;
  toggleSlideshowCrossfade: () => void;
  
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

  inspectorHistogramMode: InspectorHistogramMode;
  setInspectorHistogramMode: (mode: InspectorHistogramMode) => void;
  cycleInspectorHistogramMode: () => void;
}

export type FocusPeakingColor = 'green' | 'red' | 'cyan' | 'yellow';
export type InspectorHistogramMode = 'off' | 'overlay' | 'full';

const getSavedInspectorHistogramMode = (): InspectorHistogramMode => {
  try {
    const val = localStorage.getItem('rapidready_inspector_histogram_mode');
    if (val === 'off' || val === 'overlay' || val === 'full') {
      return val;
    }
  } catch (_) {}
  return 'off';
};

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

const getSavedSlideshowInterval = (): 2 | 3 | 5 | 10 => {
  try {
    const val = localStorage.getItem('rapidready_slideshow_interval');
    if (val) {
      const num = parseInt(val, 10);
      if (num === 2 || num === 3 || num === 5 || num === 10) return num;
    }
  } catch (_) {}
  return 3;
};

const getSavedSlideshowLoop = (): boolean => {
  try {
    const val = localStorage.getItem('rapidready_slideshow_loop');
    if (val !== null) return val === 'true';
  } catch (_) {}
  return true;
};

const getSavedSlideshowCrossfade = (): boolean => {
  try {
    const val = localStorage.getItem('rapidready_slideshow_crossfade');
    if (val !== null) return val !== 'false';
  } catch (_) {}
  return true;
};

export const useLibraryUIStore = create<LibraryUIStore>((set) => ({
  viewMode: 'grid',
  previousViewMode: 'grid',
  setViewMode: (mode) => set((state) => {
    if (mode === 'fullscreen') {
      const prev = (state.viewMode === 'fullscreen' ? state.previousViewMode : state.viewMode) as 'grid' | 'loupe';
      return {
        viewMode: 'fullscreen',
        previousViewMode: prev || 'grid',
      };
    } else {
      resetOsFullscreenIfActive();
      return {
        viewMode: mode,
        isSlideshowPlaying: false,
      };
    }
  }),
  enterFullscreen: () => set((state) => {
    const prev = (state.viewMode === 'fullscreen' ? state.previousViewMode : state.viewMode) as 'grid' | 'loupe';
    return {
      viewMode: 'fullscreen',
      previousViewMode: prev || 'grid',
    };
  }),
  exitFullscreen: () => {
    resetOsFullscreenIfActive();
    set((state) => ({
      viewMode: state.previousViewMode || 'grid',
      isSlideshowPlaying: false,
    }));
  },
  toggleFullscreen: () => {
    const state = useLibraryUIStore.getState();
    if (state.viewMode === 'fullscreen') {
      state.exitFullscreen();
    } else {
      state.enterFullscreen();
    }
  },

  isSlideshowPlaying: false,
  setIsSlideshowPlaying: (playing) => set({ isSlideshowPlaying: playing }),
  toggleSlideshowPlaying: () => set((state) => ({ isSlideshowPlaying: !state.isSlideshowPlaying })),

  slideshowIntervalSec: getSavedSlideshowInterval(),
  setSlideshowIntervalSec: (sec) => {
    try {
      localStorage.setItem('rapidready_slideshow_interval', sec.toString());
    } catch (_) {}
    set({ slideshowIntervalSec: sec });
  },

  slideshowLoop: getSavedSlideshowLoop(),
  setSlideshowLoop: (loop) => {
    try {
      localStorage.setItem('rapidready_slideshow_loop', loop ? 'true' : 'false');
    } catch (_) {}
    set({ slideshowLoop: loop });
  },
  toggleSlideshowLoop: () => set((state) => {
    const next = !state.slideshowLoop;
    try {
      localStorage.setItem('rapidready_slideshow_loop', next ? 'true' : 'false');
    } catch (_) {}
    return { slideshowLoop: next };
  }),

  slideshowCrossfade: getSavedSlideshowCrossfade(),
  setSlideshowCrossfade: (crossfade) => {
    try {
      localStorage.setItem('rapidready_slideshow_crossfade', crossfade ? 'true' : 'false');
    } catch (_) {}
    set({ slideshowCrossfade: crossfade });
  },
  toggleSlideshowCrossfade: () => set((state) => {
    const next = !state.slideshowCrossfade;
    try {
      localStorage.setItem('rapidready_slideshow_crossfade', next ? 'true' : 'false');
    } catch (_) {}
    return { slideshowCrossfade: next };
  }),
  
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

  inspectorHistogramMode: getSavedInspectorHistogramMode(),
  setInspectorHistogramMode: (mode) => {
    try {
      localStorage.setItem('rapidready_inspector_histogram_mode', mode);
    } catch (_) {}
    set({ inspectorHistogramMode: mode });
  },
  cycleInspectorHistogramMode: () => set((state) => {
    const current = state.inspectorHistogramMode;
    const next: InspectorHistogramMode = current === 'off' ? 'overlay' : current === 'overlay' ? 'full' : 'off';
    try {
      localStorage.setItem('rapidready_inspector_histogram_mode', next);
    } catch (_) {}
    return { inspectorHistogramMode: next };
  }),
}));
