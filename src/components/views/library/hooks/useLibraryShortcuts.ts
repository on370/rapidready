import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLibraryStore, LibraryImage } from '../../../../stores/libraryStore';
import { useCollectionsStore } from '../../../../stores/collectionsStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { useSettingsStore } from '../../../../stores/settingsStore';

interface UseLibraryShortcutsProps {
  activeImage: LibraryImage | undefined;
  activeImageIndex: number;
  displayedImages: LibraryImage[];
  numColumns?: number;
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  setActiveImageIndex: (index: number) => void;
  setSelectedPaths: (paths: Set<string>) => void;
  selectAll: (displayedImages: LibraryImage[]) => void;
  handleCulling: (flag: number | null, rating: number) => void;
  handleSetColor: (color: string | null) => void;
  handleRotate: (direction: 'cw' | 'ccw') => void;
}

export function useLibraryShortcuts({
  activeImage,
  activeImageIndex,
  displayedImages,
  numColumns = 4,
  viewMode,
  setViewMode,
  setActiveImageIndex,
  setSelectedPaths,
  selectAll,
  handleCulling,
  handleSetColor,
  handleRotate,
}: UseLibraryShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if an input/textarea is focused
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      // Don't trigger shortcuts if a modal dialog is currently open
      if (useCollectionsStore.getState().isExportModalOpen) return;
      if (document.querySelector('.fixed.inset-0, [data-context-menu]')) return;

      const shortcutPreset = useSettingsStore.getState().shortcutPreset;
      
      // Shortcut: Cmd/Ctrl + A -> Select All
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAll(displayedImages);
        return;
      }

      // Shortcut: Shift + F (without Cmd/Ctrl) -> Toggle Focus Peaking
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        useLibraryUIStore.getState().toggleFocusPeaking();
        return;
      }

      // Shortcut: H (without Cmd/Ctrl/Shift) -> Cycle Inspector Histogram (Off -> Overlay -> Full)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        useLibraryUIStore.getState().cycleInspectorHistogramMode();
        return;
      }

      // Shortcut: Cmd/Ctrl + Shift + F -> Reveal in Finder / Explorer
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (activeImage) {
          invoke('show_in_finder', { path: activeImage.path });
        }
        return;
      }

      // Darktable function keys for color labels (F2=Red, F3=Yellow, F4=Green, F5=Blue)
      if (shortcutPreset === 'darktable' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'F2') {
          e.preventDefault();
          handleSetColor(activeImage?.culling.color === 'red' ? null : 'red');
          return;
        }
        if (e.key === 'F3') {
          e.preventDefault();
          handleSetColor(activeImage?.culling.color === 'yellow' ? null : 'yellow');
          return;
        }
        if (e.key === 'F4') {
          e.preventDefault();
          handleSetColor(activeImage?.culling.color === 'green' ? null : 'green');
          return;
        }
        if (e.key === 'F5') {
          e.preventDefault();
          handleSetColor(activeImage?.culling.color === 'blue' ? null : 'blue');
          return;
        }
      }

      // Shortcut: F5 (in Lightroom mode) or Cmd/Ctrl + Shift + R -> Refresh / Reconcile active folder
      if ((shortcutPreset !== 'darktable' && e.key === 'F5') || ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        useLibraryStore.getState().reconcileActiveFolder();
        return;
      }

      // Shortcut: Cmd/Ctrl + R -> Rotate CW
      if ((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        handleRotate('cw');
        return;
      }

      // Shortcut: Cmd/Ctrl + L -> Rotate CCW
      if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleRotate('ccw');
        return;
      }

      // Shortcut: Shift + R in darktable mode -> Open in RapidRAW
      if (shortcutPreset === 'darktable' && !e.metaKey && !e.ctrlKey && !e.altKey && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (activeImage) {
          invoke('open_in_rapidraw', { path: activeImage.path });
        }
        return;
      }

      // Shortcut: R (without modifiers)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (shortcutPreset === 'darktable') {
          // In darktable: R toggles Reject (-1 vs null)
          handleCulling(activeImage?.culling.flag === -1 ? null : -1, activeImage?.culling.rating || 0);
        } else {
          // In Lightroom standard: R opens in RapidRAW
          if (activeImage) {
            invoke('open_in_rapidraw', { path: activeImage.path });
          }
        }
        return;
      }

      // Shortcut: . (Period) -> Rotate CW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '.') {
        e.preventDefault();
        handleRotate('cw');
        return;
      }

      // Shortcut: , (Comma) -> Rotate CCW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === ',') {
        e.preventDefault();
        handleRotate('ccw');
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'j') {
        const next = Math.min(displayedImages.length - 1, activeImageIndex + 1);
        setActiveImageIndex(next);
        if (!e.shiftKey && displayedImages[next]) {
          setSelectedPaths(new Set([displayedImages[next].path]));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        const prev = Math.max(0, activeImageIndex - 1);
        setActiveImageIndex(prev);
        if (!e.shiftKey && displayedImages[prev]) {
          setSelectedPaths(new Set([displayedImages[prev].path]));
        }
      } else if (e.key === 'ArrowDown') {
        const step = viewMode === 'grid' ? numColumns : 1;
        const next = Math.min(displayedImages.length - 1, activeImageIndex + step);
        setActiveImageIndex(next);
        if (!e.shiftKey && displayedImages[next]) {
          setSelectedPaths(new Set([displayedImages[next].path]));
        }
      } else if (e.key === 'ArrowUp') {
        const step = viewMode === 'grid' ? numColumns : 1;
        const prev = Math.max(0, activeImageIndex - step);
        setActiveImageIndex(prev);
        if (!e.shiftKey && displayedImages[prev]) {
          setSelectedPaths(new Set([displayedImages[prev].path]));
        }
      } else {
        switch (e.key) {
          case 'p':
          case 'P':
            handleCulling(1, activeImage?.culling.rating || 0);
            break;
          case 'x':
          case 'X':
            handleCulling(-1, activeImage?.culling.rating || 0);
            break;
          case 'u':
          case 'U':
            handleCulling(null, activeImage?.culling.rating || 0);
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
            handleCulling(activeImage?.culling.flag || null, parseInt(e.key));
            break;
          case '6':
            handleSetColor(activeImage?.culling.color === 'red' ? null : 'red');
            break;
          case '7':
            handleSetColor(activeImage?.culling.color === 'yellow' ? null : 'yellow');
            break;
          case '8':
            handleSetColor(activeImage?.culling.color === 'green' ? null : 'green');
            break;
          case '9':
            handleSetColor(activeImage?.culling.color === 'blue' ? null : 'blue');
            break;
          case 'e':
          case 'E':
          case 'Enter':
            setViewMode('loupe');
            e.preventDefault();
            break;
          case 'g':
          case 'G':
            setViewMode('grid');
            e.preventDefault();
            break;
          case 'Escape':
            e.preventDefault();
            if (viewMode === 'loupe') {
              setViewMode('grid');
            } else {
              // In grid view: deselect any selected collection, last import, or folder
              // to return the grid view to showing all photos of the configured location
              const libState = useLibraryStore.getState();
              const colState = useCollectionsStore.getState();
              colState.selectCollection(null, null);
              libState.setIsViewingLastImport(false);
              libState.setActiveFolderPath(libState.rootPath || null);
              libState.setSelectedFolderPaths(new Set());
            }
            break;
          case ' ':
            e.preventDefault();
            if (e.shiftKey) {
              if (activeImageIndex > 0) {
                const prev = activeImageIndex - 1;
                setActiveImageIndex(prev);
                if (displayedImages[prev]) setSelectedPaths(new Set([displayedImages[prev].path]));
              }
            } else {
              if (activeImageIndex < displayedImages.length - 1) {
                const next = activeImageIndex + 1;
                setActiveImageIndex(next);
                if (displayedImages[next]) setSelectedPaths(new Set([displayedImages[next].path]));
              }
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImage, activeImageIndex, displayedImages, handleCulling, handleSetColor, handleRotate, viewMode, setViewMode, numColumns, selectAll, setSelectedPaths, setActiveImageIndex]);
}
