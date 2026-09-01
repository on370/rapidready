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

interface ImportState {
  sourceDirectory: string | null;
  destinationDirectory: string | null;
  directoryTemplate: string;
  scannedFiles: ScannedFile[];
  isScanning: boolean;
  hideImported: boolean;
  
  setSourceDirectory: (path: string | null) => void;
  setDestinationDirectory: (path: string | null) => void;
  setDirectoryTemplate: (template: string) => void;
  setScannedFiles: (files: Omit<ScannedFile, 'selected'>[]) => void;
  setIsScanning: (scanning: boolean) => void;
  setHideImported: (hide: boolean) => void;
  toggleFileSelection: (path: string) => void;
  toggleGroupSelection: (paths: string[], forceState?: boolean) => void;
}

export const useImportStore = create<ImportState>()(
  persist(
    (set) => ({
      sourceDirectory: null,
      destinationDirectory: null,
      directoryTemplate: '{year}/{year}-{month}-{day}',
      scannedFiles: [],
      isScanning: false,
      hideImported: true,

      setSourceDirectory: (path) => set({ sourceDirectory: path }),
      setDestinationDirectory: (path) => set({ destinationDirectory: path }),
      setDirectoryTemplate: (template) => set({ directoryTemplate: template }),
      setScannedFiles: (files) => set({ 
        scannedFiles: files.map(f => ({ ...f, selected: !f.already_imported })) 
      }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),
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
    }),
    {
      name: 'rapidready-import-storage',
      partialize: (state) => ({
        destinationDirectory: state.destinationDirectory,
        directoryTemplate: state.directoryTemplate,
        hideImported: state.hideImported,
      }),
    }
  )
);
