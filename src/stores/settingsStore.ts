import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  autoDetect: boolean;
  verifyCopy: boolean;
  deleteSource: boolean;
  launchSystem: boolean;
  openRapidRaw: boolean;
  startupView: 'import' | 'library';
  lastLibraryPath: string | null;
  locations: { id: string, name: string, path: string }[];
  presets: { id: string, name: string, locationId: string, subfolderFormat: string }[];
  
  setAutoDetect: (val: boolean) => void;
  setVerifyCopy: (val: boolean) => void;
  setDeleteSource: (val: boolean) => void;
  setLaunchSystem: (val: boolean) => void;
  setOpenRapidRaw: (val: boolean) => void;
  setStartupView: (val: 'import' | 'library') => void;
  setLastLibraryPath: (val: string | null) => void;
  addLocation: (location: { id: string, name: string, path: string }) => void;
  removeLocation: (id: string) => void;
  updateLocation: (id: string, name: string) => void;
  addPreset: (preset: { id: string, name: string, locationId: string, subfolderFormat: string }) => void;
  removePreset: (id: string) => void;
  updatePreset: (id: string, name: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoDetect: true,
      verifyCopy: true,
      deleteSource: false,
      launchSystem: false,
      openRapidRaw: true,
      startupView: 'import',
      lastLibraryPath: null,
      locations: [],
      presets: [],
      
      setAutoDetect: (autoDetect) => set({ autoDetect }),
      setVerifyCopy: (verifyCopy) => set({ verifyCopy }),
      setDeleteSource: (deleteSource) => set({ deleteSource }),
      setLaunchSystem: (launchSystem) => set({ launchSystem }),
      setOpenRapidRaw: (openRapidRaw) => set({ openRapidRaw }),
      setStartupView: (startupView) => set({ startupView }),
      setLastLibraryPath: (lastLibraryPath) => set({ lastLibraryPath }),
      addLocation: (location) => set((state) => ({ locations: [...state.locations, location] })),
      removeLocation: (id) => set((state) => ({ locations: state.locations.filter(l => l.id !== id) })),
      updateLocation: (id, name) => set((state) => ({ locations: state.locations.map(l => l.id === id ? { ...l, name } : l) })),
      addPreset: (preset) => set((state) => ({ presets: [...state.presets, preset] })),
      removePreset: (id) => set((state) => ({ presets: state.presets.filter(p => p.id !== id) })),
      updatePreset: (id, name) => set((state) => ({ presets: state.presets.map(p => p.id === id ? { ...p, name } : p) })),
    }),
    {
      name: 'rapidready-settings',
    }
  )
);
