import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LibraryImage } from '../../../../stores/libraryStore';

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
      
      // Shortcut: Cmd/Ctrl + A -> Select All
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAll(displayedImages);
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

      // Shortcut: R (without Cmd/Ctrl) -> Open in RapidRAW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (activeImage) {
          invoke('open_in_rapidraw', { path: activeImage.path });
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
          case 'Escape':
            setViewMode('grid');
            e.preventDefault();
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
