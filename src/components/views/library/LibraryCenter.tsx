import React, { useEffect, useCallback, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLibraryStore, LibraryImage, CullingState } from "../../../stores/libraryStore";
import { ContextMenu } from "./ContextMenu";
import { ArchiveConnectingOverlay } from "./components/ArchiveConnectingOverlay";
import { ArchiveScanBanner } from "./components/ArchiveScanBanner";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { normalizePath } from "../../../utils/image";

import { CullingToolbar } from "./components/CullingToolbar";
import { LibraryGrid } from "./components/LibraryGrid";
import { LoupeViewer } from "./components/LoupeViewer";
import { useLibraryShortcuts } from "./hooks/useLibraryShortcuts";

import { useLibraryUIStore } from "../../../stores/libraryUIStore";
import { useToastStore } from "../../../stores/toastStore";

interface LibraryCenterProps {
  viewMode?: 'grid' | 'loupe';
  setViewMode?: (mode: 'grid' | 'loupe') => void;
  toggleInspector?: () => void;
}

export function LibraryCenter({ 
  viewMode: propViewMode, 
  setViewMode: propSetViewMode, 
  toggleInspector: propToggleInspector 
}: LibraryCenterProps = {}) {
  const { t } = useTranslation('library');
  const storeViewMode = useLibraryUIStore((s) => s.viewMode);
  const storeSetViewMode = useLibraryUIStore((s) => s.setViewMode);
  const storeToggleInspector = useLibraryUIStore((s) => s.toggleInspector);
  const loupeScale = useLibraryUIStore((s) => s.loupeScale);
  const setLoupeScale = useLibraryUIStore((s) => s.setLoupeScale);
  const gridColumns = useLibraryUIStore((s) => s.gridColumns);
  const setGridScrollTop = useLibraryUIStore((s) => s.setGridScrollTop);

  const viewMode = propViewMode || storeViewMode;
  const setViewMode = propSetViewMode || storeSetViewMode;
  const toggleInspector = propToggleInspector || storeToggleInspector;

  const { 
    images, activeImageIndex, setActiveImageIndex, autoAdvance, 
    updateCullingState, updateBatchCullingState, updateImageCullings,
    selectedPaths, setSelectedPaths, toggleSelectedPath, selectRange, selectAll,
    activeFolderPath, filterMode,
    selectedRatingFilter,
    selectedColorFilter,
    selectedTagFilter,
    lastImportPaths, isViewingLastImport, rootPath,
  } = useLibraryStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const normLastImport = React.useMemo(() => {
    return new Set(lastImportPaths.map(p => normalizePath(p)));
  }, [lastImportPaths]);

  const normActiveFolder = React.useMemo(() => {
    return activeFolderPath ? normalizePath(activeFolderPath) : null;
  }, [activeFolderPath]);

  const normRoot = React.useMemo(() => {
    return rootPath ? normalizePath(rootPath) : null;
  }, [rootPath]);

  const scopedImages = React.useMemo(() => {
    return isViewingLastImport
      ? images.filter(img => normLastImport.has(normalizePath(img.path)))
      : normActiveFolder && normActiveFolder !== normRoot
        ? images.filter(img => {
            const p = normalizePath(img.path);
            return p.startsWith(normActiveFolder + '/') || p === normActiveFolder;
          })
        : images;
  }, [images, isViewingLastImport, normLastImport, normActiveFolder, normRoot]);

  const displayedImages = React.useMemo(() => {
    return scopedImages.filter(img => {
      if (selectedTagFilter && !img.culling.tags.includes(selectedTagFilter)) {
        return false;
      }
      if (selectedColorFilter && img.culling.color !== selectedColorFilter) {
        return false;
      }
      if (selectedRatingFilter !== null && (img.culling.rating || 0) < selectedRatingFilter) {
        return false;
      }
      if (filterMode === 'picks') return img.culling.flag === 1;
      if (filterMode === 'rejected') return img.culling.flag === -1;
      if (filterMode.startsWith('rated')) {
        const minStars = parseInt(filterMode.replace('rated', '')) || 1;
        return (img.culling.rating || 0) >= minStars;
      }
      return true; // 'all'
    });
  }, [scopedImages, selectedTagFilter, selectedColorFilter, selectedRatingFilter, filterMode]);

  const availableTags = React.useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const img of scopedImages) {
      for (const tag of img.culling.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [scopedImages]);

  const colorCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of scopedImages) {
      if (img.culling.color) {
        counts.set(img.culling.color, (counts.get(img.culling.color) || 0) + 1);
      }
    }
    return counts;
  }, [scopedImages]);

  const ratingCounts = React.useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const img of scopedImages) {
      const r = img.culling.rating || 0;
      for (let s = 1; s <= 5; s++) {
        if (r >= s) counts[s]++;
      }
    }
    return counts;
  }, [scopedImages]);

  const activeImage = displayedImages[activeImageIndex];

  // Sync active photo folder with libraryStore so sidebar tree highlights and scrolls to location
  useEffect(() => {
    if (activeImage?.path) {
      const norm = normalizePath(activeImage.path);
      const lastSlash = norm.lastIndexOf('/');
      const folder = lastSlash > 0 ? norm.substring(0, lastSlash) : null;
      useLibraryStore.getState().setActiveImageFolder(folder);
    } else {
      useLibraryStore.getState().setActiveImageFolder(null);
    }
  }, [activeImage?.path]);

  // When active folder or collection changes, always select and display the first image in the folder
  const prevFolderRef = useRef(activeFolderPath);
  const prevLastImportRef = useRef(isViewingLastImport);

  useEffect(() => {
    if (prevFolderRef.current !== activeFolderPath || prevLastImportRef.current !== isViewingLastImport) {
      prevFolderRef.current = activeFolderPath;
      prevLastImportRef.current = isViewingLastImport;
      setGridScrollTop(0);
      
      if (displayedImages.length > 0) {
        setActiveImageIndex(0);
        setSelectedPaths(new Set([displayedImages[0].path]));
      } else {
        setActiveImageIndex(0);
        setSelectedPaths(new Set());
      }
    }
  }, [activeFolderPath, isViewingLastImport, displayedImages, setActiveImageIndex, setSelectedPaths, setGridScrollTop]);

  // Safeguard: keep activeImageIndex within valid range if displayedImages shrinks (e.g. filter change or deletes)
  useEffect(() => {
    if (displayedImages.length > 0 && activeImageIndex >= displayedImages.length) {
      setActiveImageIndex(0);
      setSelectedPaths(new Set([displayedImages[0].path]));
    }
  }, [displayedImages.length, activeImageIndex, setActiveImageIndex, setSelectedPaths]);

  const handleRotate = useCallback(async (direction: 'cw' | 'ccw') => {
    if (!activeImage) return;
    const targetPaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    try {
      const res = await invoke<Array<{ path: string; culling: CullingState }>>('rotate_images', {
        paths: targetPaths,
        direction,
      });
      if (res && res.length > 0) {
        updateImageCullings(res);
      }
    } catch (err) {
      console.error('Failed to rotate images:', err);
      useToastStore.getState().showError(
        t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
        t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
      );
    }
  }, [activeImage, selectedPaths, updateImageCullings, t]);

  const handleCulling = useCallback((flag: number | null, rating: number) => {
    if (!activeImage) return;
    
    const targetPaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (targetPaths.length > 1) {
      updateBatchCullingState(targetPaths, { flag, rating });
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: targetPaths,
        flag: flag === null ? 0 : flag,
        rating,
        color: null,
      }).then((res) => {
        if (res && res.failed > 0) {
          useToastStore.getState().showWarning(
            t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
            t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
          );
        }
      }).catch((err) => {
        console.error('Failed to save batch culling state:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { flag, rating });
      
      invoke('set_culling_state', { 
        path: activeImage.path,
        flag,
        rating,
        color: activeImage.culling.color,
        tags: activeImage.culling.tags,
      }).catch((err) => {
        console.error('Failed to save culling state:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });

      // Auto-advance only for single selection
      if (autoAdvance && flag !== null && activeImageIndex < displayedImages.length - 1) {
        const nextIdx = activeImageIndex + 1;
        setActiveImageIndex(nextIdx);
        if (displayedImages[nextIdx]) {
          setSelectedPaths(new Set([displayedImages[nextIdx].path]));
        }
      }
    }
  }, [activeImage, selectedPaths, images, autoAdvance, activeImageIndex, displayedImages, updateBatchCullingState, updateCullingState, setActiveImageIndex, setSelectedPaths, t]);

  const handleSetColor = useCallback((newColor: string | null) => {
    if (!activeImage) return;

    const targetPaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (targetPaths.length > 1) {
      updateBatchCullingState(targetPaths, { color: newColor });
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: targetPaths,
        color: newColor || 'none',
      }).then((res) => {
        if (res && res.failed > 0) {
          useToastStore.getState().showWarning(
            t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
            t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
          );
        }
      }).catch((err) => {
        console.error('Failed to set batch color:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { color: newColor });

      invoke('set_culling_state', { 
        path: activeImage.path,
        flag: activeImage.culling.flag,
        rating: activeImage.culling.rating,
        color: newColor,
        tags: activeImage.culling.tags,
      }).catch((err) => {
        console.error('Failed to set color:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    }
  }, [activeImage, selectedPaths, images, updateBatchCullingState, updateCullingState, t]);

  const rejectedImages = React.useMemo(() => {
    return scopedImages.filter(i => i.culling.flag === -1);
  }, [scopedImages]);
  const rejectedCount = rejectedImages.length;

  const handleDeleteRejected = useCallback(() => {
    if (rejectedCount === 0) return;
    ask(t('delete.confirmMessage', { count: rejectedCount }), {
      title: t('delete.confirmTitle'),
      kind: 'warning',
      okLabel: t('delete.okLabel'),
      cancelLabel: t('delete.cancelLabel')
    }).then(confirmed => {
      if (confirmed) {
        invoke('delete_files', { paths: rejectedImages.map(i => i.path), toTrash: true }).then(() => {
          const rejectedPathSet = new Set(rejectedImages.map(i => i.path));
          const remaining = images.filter(i => !rejectedPathSet.has(i.path));
          useLibraryStore.getState().setImages(remaining);
        }).catch(err => {
          console.error(err);
          alert(t('delete.failedError') + err);
        });
      }
    });
  }, [rejectedCount, rejectedImages, images, t]);

  const handleItemClick = useCallback((e: React.MouseEvent, clickedIndex: number, img: LibraryImage) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelectedPath(img.path);
      setActiveImageIndex(clickedIndex);
    } else if (e.shiftKey) {
      selectRange(activeImageIndex, clickedIndex, displayedImages);
      setActiveImageIndex(clickedIndex);
    } else {
      setSelectedPaths(new Set([img.path]));
      setActiveImageIndex(clickedIndex);
    }
  }, [activeImageIndex, displayedImages, toggleSelectedPath, selectRange, setSelectedPaths, setActiveImageIndex]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedPaths.has(path)) {
      setSelectedPaths(new Set([path]));
      setActiveImageIndex(index);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  }, [selectedPaths, setSelectedPaths, setActiveImageIndex]);

  // Global Keyboard Shortcuts
  useLibraryShortcuts({
    activeImage,
    activeImageIndex,
    displayedImages,
    numColumns: gridColumns || 4,
    viewMode,
    setActiveImageIndex,
    setSelectedPaths,
    selectAll,
    setViewMode,
    handleCulling,
    handleSetColor,
    handleRotate,
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header, Filter and Culling Toolbars */}
      <CullingToolbar
        activeImage={activeImage}
        displayedImages={displayedImages}
        availableTags={availableTags}
        colorCounts={colorCounts}
        ratingCounts={ratingCounts}
        rejectedCount={rejectedCount}
        handleCulling={handleCulling}
        handleSetColor={handleSetColor}
        handleRotate={handleRotate}
        handleDeleteRejected={handleDeleteRejected}
        toggleInspector={toggleInspector}
      />

      {/* Content Area */}
      <div className="flex-1 relative min-h-0 min-w-0 overflow-hidden z-0">
        {/* LibraryGrid: kept mounted at all times to preserve DOM layout and scroll state */}
        <div 
          className={`absolute inset-0 flex flex-col ${viewMode === 'grid' ? 'z-10 visible' : 'z-0 invisible pointer-events-none'}`}
        >
          <LibraryGrid
            displayedImages={displayedImages}
            activeImageIndex={activeImageIndex}
            selectedPaths={selectedPaths}
            onItemClick={handleItemClick}
            onOpenLoupe={(idx) => {
              setActiveImageIndex(idx);
              setViewMode('loupe');
            }}
            onContextMenu={handleContextMenu}
            viewMode={viewMode}
          />
        </div>

        {/* LoupeViewer: mounted on-demand when viewMode === 'loupe' */}
        {viewMode === 'loupe' && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <LoupeViewer
              activeImage={activeImage}
              activeImageIndex={activeImageIndex}
              displayedImages={displayedImages}
              selectedPaths={selectedPaths}
              setActiveImageIndex={setActiveImageIndex}
              setSelectedPaths={setSelectedPaths}
              onItemClick={handleItemClick}
              onContextMenu={handleContextMenu}
            />
          </div>
        )}
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedPaths.has(activeImage?.path || '') && selectedPaths.size > 1 ? selectedPaths.size : 1}
          currentRating={activeImage?.culling?.rating || 0}
          currentColor={activeImage?.culling?.color || null}
          onClose={() => setContextMenu(null)}
          onRotate={(dir) => handleRotate(dir)}
          onCulling={(flag, rating) => handleCulling(flag !== undefined ? flag : (activeImage?.culling.flag ?? null), rating ?? activeImage?.culling.rating ?? 0)}
          onSetColor={(color) => handleSetColor(color)}
          onOpenInRapidRaw={() => {
            if (activeImage) invoke('open_in_rapidraw', { path: activeImage.path });
          }}
          onShowInFinder={() => {
            if (activeImage) invoke('show_in_finder', { path: activeImage.path });
          }}
          zoomOptions={viewMode === 'loupe' ? {
            currentScale: loupeScale,
            onSetScale: (scale: number) => setLoupeScale(scale),
          } : undefined}
        />
      )}

      {/* Phase 1: Connecting Overlay (debounced >300ms, cancelable) */}
      <ArchiveConnectingOverlay />

      {/* Phase 2 & 3: Non-blocking Progressive Scan Banner */}
      <ArchiveScanBanner />
    </div>
  );
}
