import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScannedFile {
  path: string;
  name: string;
  size: number;
  date: string | null;
  formatted_date: string | null;
  hash: string;
  already_imported: boolean;
  selected: boolean;
}

export type StructureMode = 'date' | 'custom' | 'project' | 'flat';

export const DATE_FORMAT_OPTIONS = [
  { id: '{year}/{year}-{month}-{day}', label: 'YYYY / YYYY-MM-DD' },
  { id: '{year}/{month}/{day}', label: 'YYYY / MM / DD' },
  { id: '{year}-{month}-{day}', label: 'YYYY-MM-DD' },
  { id: '{year}/{month}', label: 'YYYY / MM' },
];

export interface ScanProgress {
  current: number;
  total: number;
  percent: number;
  current_file: string;
}

interface ImportState {
  sourceDirectory: string | null;
  destinationDirectory: string | null;
  selectedLocationId: string | null;
  structureMode: StructureMode;
  dateFormat: string;
  customPattern: string;
  projectName: string;
  activePresetId: string | null;
  isPresetModified: boolean;
  directoryTemplate: string;
  scannedFiles: ScannedFile[];
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  hideImported: boolean;
  
  setSourceDirectory: (path: string | null) => void;
  setDestinationDirectory: (path: string | null, locationId?: string | null) => void;
  setStructureMode: (mode: StructureMode) => void;
  setDateFormat: (format: string) => void;
  setCustomPattern: (pattern: string) => void;
  setProjectName: (name: string) => void;
  setDirectoryTemplate: (template: string) => void;
  setActivePreset: (presetId: string | null, isModified?: boolean) => void;
  setPresetModified: (modified: boolean) => void;
  setScannedFiles: (files: Omit<ScannedFile, 'selected'>[]) => void;
  setIsScanning: (scanning: boolean) => void;
  setScanProgress: (progress: ScanProgress | null) => void;
  setHideImported: (hide: boolean) => void;
  toggleFileSelection: (path: string) => void;
  toggleGroupSelection: (paths: string[], forceState?: boolean) => void;
  getEffectiveTemplate: () => string;
}

export const useImportStore = create<ImportState>()(
  persist(
    (set, get) => ({
      sourceDirectory: null,
      destinationDirectory: null,
      selectedLocationId: null,
      structureMode: 'date',
      dateFormat: '{year}/{year}-{month}-{day}',
      customPattern: '{year}/{year}-{month}-{day}',
      projectName: '',
      activePresetId: 'default-std',
      isPresetModified: false,
      directoryTemplate: '{year}/{year}-{month}-{day}',
      scannedFiles: [],
      isScanning: false,
      scanProgress: null,
      hideImported: true,

      setSourceDirectory: (path) => set({ sourceDirectory: path }),
      setDestinationDirectory: (path, locationId = null) => {
        set({ destinationDirectory: path, selectedLocationId: locationId, isPresetModified: true });
      },
      setStructureMode: (mode) => {
        set({ structureMode: mode, isPresetModified: true });
        const template = get().getEffectiveTemplate();
        set({ directoryTemplate: template });
      },
      setDateFormat: (format) => {
        set({ dateFormat: format, isPresetModified: true });
        if (get().structureMode === 'date') {
          set({ directoryTemplate: format });
        }
      },
      setCustomPattern: (pattern) => {
        set({ customPattern: pattern, isPresetModified: true });
        if (get().structureMode === 'custom') {
          set({ directoryTemplate: pattern });
        }
      },
      setProjectName: (name) => {
        set({ projectName: name, isPresetModified: true });
        if (get().structureMode === 'project') {
          set({ directoryTemplate: name });
        }
      },
      setDirectoryTemplate: (template) => set({ directoryTemplate: template }),
      setActivePreset: (presetId, isModified = false) => set({ activePresetId: presetId, isPresetModified: isModified }),
      setPresetModified: (modified) => set({ isPresetModified: modified }),
      setScannedFiles: (files) => set({ 
        scannedFiles: files.map(f => ({ ...f, selected: !f.already_imported })) 
      }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),
      setScanProgress: (progress) => set({ scanProgress: progress }),
      setHideImported: (hide) => set({ hideImported: hide }),
      toggleFileSelection: (path) => set((state) => ({
        scannedFiles: state.scannedFiles.map(f => 
          f.path === path ? { ...f, selected: !f.selected } : f
        )
      })),
      toggleGroupSelection: (paths, forceState) => set((state) => ({
        scannedFiles: state.scannedFiles.map(f => 
          paths.includes(f.path) 
            ? { ...f, selected: forceState !== undefined ? forceState : !f.selected } 
            : f
        )
      })),
      getEffectiveTemplate: () => {
        const state = get();
        switch (state.structureMode) {
          case 'date':
            return state.dateFormat;
          case 'custom':
            return state.customPattern;
          case 'project':
            return state.projectName.trim() || 'Project';
          case 'flat':
            return '';
        }
      }
    }),
    {
      name: 'rapidready-import-storage',
      partialize: (state) => ({
        destinationDirectory: state.destinationDirectory,
        selectedLocationId: state.selectedLocationId,
        structureMode: state.structureMode,
        dateFormat: state.dateFormat,
        customPattern: state.customPattern,
        projectName: state.projectName,
        directoryTemplate: state.directoryTemplate,
        activePresetId: state.activePresetId,
        hideImported: state.hideImported,
      }),
    }
  )
);
