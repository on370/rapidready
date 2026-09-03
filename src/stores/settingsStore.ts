import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ArchiveLocation {
  id: string;
  name: string;
  path: string;
}

export interface ImportPreset {
  id: string;
  name: string;
  locationId: string | null;
  destinationPath?: string | null;
  structureMode: 'date' | 'custom' | 'project' | 'flat';
  dateFormat: string;
  customPattern: string;
  projectName: string;
}

interface SettingsState {
  autoDetect: boolean;
  verifyCopy: boolean;
  deleteSource: boolean;
  launchSystem: boolean;
  openRapidRaw: boolean;
  startupView: 'import' | 'library';
  lastLibraryPath: string | null;
  locations: ArchiveLocation[];
  recentPaths: string[];
  presets: ImportPreset[];
  
  setAutoDetect: (val: boolean) => void;
  setVerifyCopy: (val: boolean) => void;
  setDeleteSource: (val: boolean) => void;
  setLaunchSystem: (val: boolean) => void;
  setOpenRapidRaw: (val: boolean) => void;
  setStartupView: (val: 'import' | 'library') => void;
  setLastLibraryPath: (val: string | null) => void;
  addLocation: (location: ArchiveLocation) => void;
  removeLocation: (id: string) => void;
  updateLocation: (id: string, name: string, path?: string) => void;
  addRecentPath: (path: string) => void;
  addPreset: (preset: ImportPreset) => void;
  removePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<ImportPreset>) => void;
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
      recentPaths: [],
      presets: [
        {
          id: 'default-std',
          name: 'Standard',
          locationId: null,
          structureMode: 'date',
          dateFormat: 'YYYY/YYYY-MM-DD',
          customPattern: '{year}/{year}-{month}-{day}',
          projectName: '',
        }
      ],
      
      setAutoDetect: (autoDetect) => set({ autoDetect }),
      setVerifyCopy: (verifyCopy) => set({ verifyCopy }),
      setDeleteSource: (deleteSource) => set({ deleteSource }),
      setLaunchSystem: (launchSystem) => set({ launchSystem }),
      setOpenRapidRaw: (openRapidRaw) => set({ openRapidRaw }),
      setStartupView: (startupView) => set({ startupView }),
      setLastLibraryPath: (lastLibraryPath) => set({ lastLibraryPath }),
      addLocation: (location) => set((state) => ({ locations: [...state.locations, location] })),
      removeLocation: (id) => set((state) => ({ locations: state.locations.filter(l => l.id !== id) })),
      updateLocation: (id, name, path) => set((state) => ({
        locations: state.locations.map(l => l.id === id ? { ...l, name, ...(path ? { path } : {}) } : l)
      })),
      addRecentPath: (path) => set((state) => {
        const filtered = state.recentPaths.filter(p => p !== path);
        return { recentPaths: [path, ...filtered].slice(0, 5) };
      }),
      addPreset: (preset) => set((state) => ({ presets: [...state.presets, preset] })),
      removePreset: (id) => set((state) => ({ presets: state.presets.filter(p => p.id !== id) })),
      updatePreset: (id, updates) => set((state) => ({
        presets: state.presets.map(p => p.id === id ? { ...p, ...updates } : p)
      })),
    }),
    {
      name: 'rapidready-settings',
    }
  )
);
