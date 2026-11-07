import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLibraryStore, LibraryImage, CullingState } from "../../../stores/libraryStore";
import { ContextMenu } from "./ContextMenu";
import { ArchiveConnectingOverlay } from "./components/ArchiveConnectingOverlay";
import { ArchiveScanBanner } from "./components/ArchiveScanBanner";
import { invoke } from "@tauri-apps/api/core";
import { normalizePath, normalizeSlash } from "../../../utils/image";
import { getTopLevelSelectedPaths } from "./LibraryLeftSidebar";

import { CullingToolbar } from "./components/CullingToolbar";
import { LibraryGrid } from "./components/LibraryGrid";
import { LoupeViewer } from "./components/LoupeViewer";
import { FullscreenViewer } from "./components/FullscreenViewer";
import { useLibraryShortcuts } from "./hooks/useLibraryShortcuts";
import { AppErrorBoundary } from "../../ui/AppErrorBoundary";

import { useLibraryUIStore } from "../../../stores/libraryUIStore";
import { useToastStore } from "../../../stores/toastStore";
import { useDialogStore } from "../../../stores/dialogStore";
import { useCollectionsStore, findAlbumById } from "../../../stores/collectionsStore";
import { openInConfiguredRawDeveloper } from "../../../stores/settingsStore";
import { FolderHeart, Download, ArrowDownAZ, X } from "lucide-react";

const numericCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface LibraryCenterProps {
  viewMode?: 'grid' | 'loupe' | 'fullscreen';
  setViewMode?: (mode: 'grid' | 'loupe' | 'fullscreen') => void;
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
  const sortBy = useLibraryUIStore((s) => s.sortBy);
  const sortDirection = useLibraryUIStore((s) => s.sortDirection);

  const viewMode = propViewMode || storeViewMode;
  const setViewMode = propSetViewMode || storeSetViewMode;
  const toggleInspector = propToggleInspector || storeToggleInspector;

  const { 
    images, activeImageIndex, setActiveImageIndex, autoAdvance, 
    updateCullingState, updateBatchCullingState, updateImageCullings,
    selectedPaths, setSelectedPaths, selectRange, selectAll,
    activeFolderPath, selectedFolderPaths, filterMode,
    selectedRatingFilter,
    selectedColorFilter,
    selectedTagFilter,
    lastImportPaths, isViewingLastImport, rootPath, scanState,
  } = useLibraryStore();

  const activeCollectionId = useCollectionsStore((s) => s.activeCollectionId);
  const collectionsTree = useCollectionsStore((s) => s.collectionsTree);
  const selectCollection = useCollectionsStore((s) => s.selectCollection);
  const openExportModal = useCollectionsStore((s) => s.openExportModal);
  const sortCollectionByExif = useCollectionsStore((s) => s.sortCollectionByExif);
  const removeFromCollection = useCollectionsStore((s) => s.removeFromCollection);
  const reorderImages = useCollectionsStore((s) => s.reorderImages);
  const addToCollection = useCollectionsStore((s) => s.addToCollection);
  const createCollection = useCollectionsStore((s) => s.createCollection);

  const activeCollection = useMemo(() => {
    return activeCollectionId ? findAlbumById(collectionsTree, activeCollectionId) : null;
  }, [activeCollectionId, collectionsTree]);

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

  const imageByPathMap = React.useMemo(() => {
    const m = new Map<string, LibraryImage>();
    for (const img of images) {
      m.set(normalizePath(img.path), img);
    }
    return m;
  }, [images]);

  const imagesStructureKey = React.useMemo(() => {
    if (images.length === 0) return '0';
    const first = images[0]?.path || '';
    const last = images[images.length - 1]?.path || '';
    return `${images.length}:${first}:${last}`;
  }, [images]);

  const sortedScopedPaths = React.useMemo(() => {
    // When viewing an active collection, display collection images in their exact manual order!
    if (activeCollectionId) {
      if (!activeCollection) {
        // Collection selected but tree is still loading or album not found:
        // NEVER fall through to showing all library images! Return empty array while loading.
        return [];
      }
      const allImgs = useLibraryStore.getState().images;
      const knownPaths = new Set(allImgs.map(img => normalizePath(img.path)));
      return activeCollection.images.filter(p => knownPaths.has(normalizePath(p)));
    }

    const currentImages = useLibraryStore.getState().images;
    let list: LibraryImage[];
    if (isViewingLastImport) {
      list = currentImages.filter(img => normLastImport.has(normalizePath(img.path)));
    } else if (
      selectedFolderPaths && 
      selectedFolderPaths.size > 0 && 
      !(selectedFolderPaths.size === 1 && normRoot && selectedFolderPaths.has(normRoot))
    ) {
      list = currentImages.filter((img) => {
        const p = normalizePath(img.path);
        const lastSlash = p.lastIndexOf('/');
        const dir = lastSlash > 0 ? p.substring(0, lastSlash) : p;
        return selectedFolderPaths.has(dir);
      });
    } else if (normActiveFolder && normActiveFolder !== normRoot) {
      list = currentImages.filter((img) => {
        const p = normalizePath(img.path);
        return p.startsWith(normActiveFolder + '/') || p === normActiveFolder;
      });
    } else {
      list = currentImages;
    }

    // Helper to extract a normalized comparable date string
    const getDateKey = (img: LibraryImage): string => {
      let d = img.date || img.date_modified || '';
      if (d) {
        if (d.length >= 10 && d[4] === ':' && d[7] === ':') {
          d = d.substring(0, 4) + '-' + d.substring(5, 7) + '-' + d.substring(8);
        }
        if (img.subsec_time) {
          d += '.' + img.subsec_time;
        }
        return d;
      }
      if (img.mtime) {
        return new Date(img.mtime * 1000).toISOString();
      }
      return '';
    };

    // Pre-cache date mappings for O(N) lookup instead of O(N log N) during sort
    let dateMap: Map<string, string> | null = null;
    if (sortBy === 'date') {
      dateMap = new Map<string, string>();
      for (const img of list) {
        dateMap.set(img.path, getDateKey(img));
      }
    }

    const dirMul = sortDirection === 'asc' ? 1 : -1;

    const sorted = list.slice().sort((a, b) => {
      // Primary sort criterion
      if (sortBy === 'filename') {
        const cmp = numericCollator.compare(a.name, b.name);
        if (cmp !== 0) return cmp * dirMul;
      } else if (sortBy === 'date') {
        const dateKeyA = dateMap ? (dateMap.get(a.path) || '') : getDateKey(a);
        const dateKeyB = dateMap ? (dateMap.get(b.path) || '') : getDateKey(b);
        if (!dateKeyA && dateKeyB) return 1;
        if (dateKeyA && !dateKeyB) return -1;
        if (dateKeyA !== dateKeyB) {
          return (dateKeyA < dateKeyB ? -1 : 1) * dirMul;
        }
      } else if (sortBy === 'rating') {
        const ratingA = a.culling.rating || 0;
        const ratingB = b.culling.rating || 0;
        if (ratingA !== ratingB) {
          return (ratingA - ratingB) * dirMul;
        }
        const flagA = a.culling.flag || 0;
        const flagB = b.culling.flag || 0;
        if (flagA !== flagB) {
          return (flagA - flagB) * dirMul;
        }
      } else if (sortBy === 'size') {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        if (sizeA !== sizeB) {
          return (sizeA - sizeB) * dirMul;
        }
      }

      // Deterministic tie-breaker
      const nameCmp = numericCollator.compare(a.name, b.name);
      if (nameCmp !== 0) return nameCmp;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });

    return sorted.map(img => img.path);
  }, [
    activeCollectionId, activeCollection, imagesStructureKey, isViewingLastImport, 
    normLastImport, selectedFolderPaths, normActiveFolder, normRoot, 
    sortBy, sortDirection
  ]);

  const scopedImages = React.useMemo(() => {
    const result: LibraryImage[] = [];
    for (const p of sortedScopedPaths) {
      const img = imageByPathMap.get(normalizePath(p));
      if (img) result.push(img);
    }
    return result;
  }, [sortedScopedPaths, imageByPathMap]);

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

  const lastCountsRef = useRef<{ tags: { name: string; count: number }[]; colors: Map<string, number>; ratings: number[] }>({
    tags: [],
    colors: new Map(),
    ratings: [0, 0, 0, 0, 0, 0],
  });
  const lastCalcTimeRef = useRef<number>(0);

  const availableTags = React.useMemo(() => {
    const isScanning = scanState === 'scanning';
    const now = Date.now();
    if (isScanning && scopedImages.length > 2000 && now - lastCalcTimeRef.current < 1500 && lastCountsRef.current.tags.length > 0) {
      return lastCountsRef.current.tags;
    }
    const tagCounts = new Map<string, number>();
    for (const img of scopedImages) {
      for (const tag of img.culling.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const result = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    lastCountsRef.current.tags = result;
    lastCalcTimeRef.current = now;
    return result;
  }, [scopedImages, scanState]);

  const colorCounts = React.useMemo(() => {
    const isScanning = scanState === 'scanning';
    const now = Date.now();
    if (isScanning && scopedImages.length > 2000 && now - lastCalcTimeRef.current < 1500 && lastCountsRef.current.colors.size > 0) {
      return lastCountsRef.current.colors;
    }
    const counts = new Map<string, number>();
    for (const img of scopedImages) {
      if (img.culling.color) {
        counts.set(img.culling.color, (counts.get(img.culling.color) || 0) + 1);
      }
    }
    lastCountsRef.current.colors = counts;
    return counts;
  }, [scopedImages, scanState]);

  const ratingCounts = React.useMemo(() => {
    const isScanning = scanState === 'scanning';
    const now = Date.now();
    if (isScanning && scopedImages.length > 2000 && now - lastCalcTimeRef.current < 1500 && lastCountsRef.current.ratings.some(r => r > 0)) {
      return lastCountsRef.current.ratings;
    }
    const counts = [0, 0, 0, 0, 0, 0];
    for (const img of scopedImages) {
      const r = img.culling.rating || 0;
      for (let s = 1; s <= 5; s++) {
        if (r >= s) counts[s]++;
      }
    }
    lastCountsRef.current.ratings = counts;
    return counts;
  }, [scopedImages, scanState]);

  const safeActiveIndex = displayedImages.length === 0 ? 0 : Math.min(Math.max(activeImageIndex, 0), displayedImages.length - 1);

  const activeImage = useMemo(() => {
    if (selectedPaths.size === 0) return undefined;
    const candidate = displayedImages[safeActiveIndex];
    if (candidate && selectedPaths.has(candidate.path)) {
      return candidate;
    }
    const found = displayedImages.find(img => selectedPaths.has(img.path));
    if (found) return found;
    return images.find(img => selectedPaths.has(img.path));
  }, [selectedPaths, displayedImages, safeActiveIndex, images]);

  // Sync active photo folder with libraryStore so sidebar tree highlights and scrolls to location
  useEffect(() => {
    if (activeCollectionId) {
      // Don't hijack sidebar folder selection when browsing an album
      return;
    }
    if (activeImage?.path) {
      const norm = normalizePath(activeImage.path);
      const lastSlash = norm.lastIndexOf('/');
      const folder = lastSlash > 0 ? norm.substring(0, lastSlash) : null;
      useLibraryStore.getState().setActiveImageFolder(folder);
    } else {
      useLibraryStore.getState().setActiveImageFolder(null);
    }
  }, [activeImage?.path, activeCollectionId]);

  // When active folder or collection changes, always select and display the first image in the folder/collection
  const prevFolderRef = useRef(activeFolderPath);
  const prevFoldersKeyRef = useRef('');
  const prevLastImportRef = useRef(isViewingLastImport);
  const prevCollectionIdRef = useRef(activeCollectionId);
  const prevCollectionReadyRef = useRef(!!activeCollection);

  const selectedFoldersKey = useMemo(() => {
    return Array.from(selectedFolderPaths || []).sort().join(';');
  }, [selectedFolderPaths]);

  useEffect(() => {
    const collectionJustLoaded = !prevCollectionReadyRef.current && !!activeCollection;
    if (
      prevFolderRef.current !== activeFolderPath || 
      prevFoldersKeyRef.current !== selectedFoldersKey ||
      prevLastImportRef.current !== isViewingLastImport ||
      prevCollectionIdRef.current !== activeCollectionId ||
      collectionJustLoaded
    ) {
      prevFolderRef.current = activeFolderPath;
      prevFoldersKeyRef.current = selectedFoldersKey;
      prevLastImportRef.current = isViewingLastImport;
      prevCollectionIdRef.current = activeCollectionId;
      prevCollectionReadyRef.current = !!activeCollection;
      setGridScrollTop(0);
      
      const isPendingSelectAll = useLibraryStore.getState().pendingSelectAll;
      if (isPendingSelectAll) {
        useLibraryStore.getState().setPendingSelectAll(false);
        setActiveImageIndex(0);
        return;
      }

      if (displayedImages.length > 0) {
        setActiveImageIndex(0);
        setSelectedPaths(new Set([displayedImages[0].path]));
      } else {
        setActiveImageIndex(0);
        setSelectedPaths(new Set());
      }
    }
  }, [activeFolderPath, selectedFoldersKey, isViewingLastImport, activeCollectionId, activeCollection, displayedImages, setActiveImageIndex, setSelectedPaths, setGridScrollTop]);

  // Safeguard: keep activeImageIndex and selection synchronized when displayedImages changes (e.g. filter change or deletes)
  useEffect(() => {
    if (displayedImages.length > 0) {
      if (activeImageIndex !== safeActiveIndex) {
        setActiveImageIndex(safeActiveIndex);
      }

      const currentAtIdx = displayedImages[safeActiveIndex];

      // Normalized set of selected paths to prevent casing mismatches
      const normSelectedPaths = new Set(Array.from(selectedPaths).map(p => normalizePath(p)));
      const isCurrentSelected = currentAtIdx && normSelectedPaths.has(normalizePath(currentAtIdx.path));

      if (!isCurrentSelected) {
        // 1. Falls das bisher ausgewählte Bild noch in displayedImages existiert (nur verschobener Index), folge ihm:
        const survivingIdx = normSelectedPaths.size > 0
          ? displayedImages.findIndex((img) => normSelectedPaths.has(normalizePath(img.path)))
          : -1;

        if (survivingIdx !== -1) {
          if (survivingIdx !== activeImageIndex) {
            setActiveImageIndex(survivingIdx);
          }
        } else if (
          activeImageIndex >= displayedImages.length ||
          viewMode === 'loupe' ||
          viewMode === 'fullscreen' ||
          selectedPaths.size > 0
        ) {
          // 2. Falls das ausgewählte Bild selbst gelöscht wurde (oder der Index out-of-bounds ist), wähle den Nachrücker am geclampten Index:
          const clampedIdx = Math.max(0, Math.min(activeImageIndex, displayedImages.length - 1));
          const fallbackImg = displayedImages[clampedIdx];
          if (fallbackImg) {
            setActiveImageIndex(clampedIdx);
            setSelectedPaths(new Set([fallbackImg.path]));
          }
        }
      }
    } else if (displayedImages.length === 0 && (viewMode === 'loupe' || viewMode === 'fullscreen')) {
      // Keine Bilder mehr in der aktuellen Ansicht -> zurück zu Grid
      setViewMode('grid');
      if (selectedPaths.size > 0) {
        setSelectedPaths(new Set());
        setActiveImageIndex(0);
      }
    }
  }, [displayedImages, activeImageIndex, safeActiveIndex, setActiveImageIndex, setSelectedPaths, viewMode, setViewMode, selectedPaths]);

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
  const stagedDeleteFolderPaths = useLibraryStore((s) => s.stagedDeleteFolderPaths);
  const totalRejectedCount = rejectedCount + stagedDeleteFolderPaths.size;

  const handleDeleteRejected = useCallback(async () => {
    const topStagedFolders = getTopLevelSelectedPaths(stagedDeleteFolderPaths);
    const stagedCount = topStagedFolders.length;

    if (rejectedCount === 0 && stagedCount === 0) return;

    // Check if archive root, staged folders, or rejected images reside on a network share / NAS
    const checkPaths = [
      rootPath,
      ...topStagedFolders,
      ...rejectedImages.slice(0, 10).map(i => i.path)
    ].filter(Boolean) as string[];

    const isNetwork = await invoke<boolean>('are_any_network_paths', { paths: checkPaths }).catch((err) => {
      console.error('Failed to check network path in delete rejected:', err);
      return false;
    });

    let confirmTitle = '';
    let confirmMessage = '';

    if (stagedCount > 0 && rejectedCount > 0) {
      confirmTitle = isNetwork
        ? t('delete.multiNasConfirmTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
        : t('delete.mixedConfirmTitle', {
            folderCount: stagedCount,
            photoCount: rejectedCount,
            defaultValue: `${stagedCount} Ordner und ${rejectedCount} Foto(s) in den Papierkorb verschieben?`
          });
      confirmMessage = isNetwork
        ? t('delete.mixedNasConfirmMessage', {
            folderCount: stagedCount,
            photoCount: rejectedCount,
            defaultValue: `Es sind ${stagedCount} Ordner und ${rejectedCount} verworfene Foto(s) zum Löschen vorgemerkt, die ganz oder teilweise auf einer Netzwerkfreigabe (NAS) liegen.\n\nDateien und Ordner auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nSie werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du sie jetzt wirklich unwiderruflich löschen?`
          })
        : t('delete.mixedLocalConfirmMessage', {
            folderCount: stagedCount,
            photoCount: rejectedCount,
            defaultValue: `Möchtest du ${stagedCount} vorgemerkte(n) Ordner und ${rejectedCount} verworfene(s) Foto(s) wirklich in den Papierkorb verschieben?`
          });
    } else if (stagedCount > 0) {
      confirmTitle = isNetwork
        ? t('folderDelete.multiNasTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
        : t('folderDelete.multiLocalTitle', {
            count: stagedCount,
            defaultValue: `${stagedCount} Ordner in den Papierkorb verschieben?`
          });
      confirmMessage = isNetwork
        ? t('folderDelete.multiNasMessage', {
            count: stagedCount,
            photoCount: 0,
            defaultValue: `Die ${stagedCount} ausgewählten Ordner liegen auf einer Netzwerkfreigabe (NAS).\n\nDateien und Ordner auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nSie werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du diese ${stagedCount} Ordner jetzt wirklich unwiderruflich löschen?`
          })
        : t('folderDelete.multiLocalMessage', {
            count: stagedCount,
            photoCount: 0,
            defaultValue: `Möchtest du die ${stagedCount} vorgemerkten Ordner und alle darin enthaltenen Dateien wirklich in den Papierkorb verschieben?`
          });
    } else {
      confirmTitle = isNetwork
        ? t('delete.nasConfirmTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
        : t('delete.confirmTitle', { defaultValue: 'In den Papierkorb verschieben' });
      confirmMessage = isNetwork
        ? t('delete.nasConfirmMessage', {
            count: rejectedCount,
            defaultValue: `Die ${rejectedCount} verworfenen Bilder liegen auf einer Netzwerkfreigabe (NAS).\n\nDateien auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nSie werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du diese ${rejectedCount} Bilder jetzt wirklich unwiderruflich löschen?`
          })
        : t('delete.confirmMessage', {
            count: rejectedCount,
            defaultValue: `Möchtest du ${rejectedCount} verworfene(s) Bild(er) in den Papierkorb verschieben?`
          });
    }

    const confirmed = await useDialogStore.getState().confirmDestructive({
      title: confirmTitle,
      message: confirmMessage,
      confirmLabel: isNetwork
        ? t('delete.nasOkLabel', { defaultValue: 'Unwiderruflich löschen' })
        : t('delete.okLabel', { defaultValue: 'In den Papierkorb' }),
      cancelLabel: t('delete.cancelLabel', { defaultValue: 'Abbrechen' })
    });

    if (confirmed) {
      try {
        const normStagedTargets = topStagedFolders.map(p => normalizeSlash(p).toLowerCase());
        const isUnderAnyStaged = (p: string) => {
          const norm = normalizeSlash(p).toLowerCase();
          return normStagedTargets.some(t => norm.startsWith(t + '/') || norm === t);
        };

        // Determine successor in displayedImages before deleting
        const toDeleteNormSet = new Set(rejectedImages.map(i => normalizePath(i.path)));
        const isDeletingPath = (p: string) => {
          const norm = normalizePath(p);
          return toDeleteNormSet.has(norm) || isUnderAnyStaged(p);
        };

        let nextCandidatePath: string | null = null;
        for (let i = activeImageIndex; i < displayedImages.length; i++) {
          if (!isDeletingPath(displayedImages[i].path)) {
            nextCandidatePath = displayedImages[i].path;
            break;
          }
        }
        if (!nextCandidatePath) {
          for (let i = activeImageIndex - 1; i >= 0; i--) {
            if (!isDeletingPath(displayedImages[i].path)) {
              nextCandidatePath = displayedImages[i].path;
              break;
            }
          }
        }

        // 1. Delete staged folders if any
        if (topStagedFolders.length > 0) {
          await invoke('delete_folders', {
            paths: topStagedFolders,
            toTrash: !isNetwork,
            archiveRoot: rootPath || null,
          });
          for (const fp of topStagedFolders) {
            useLibraryStore.getState().removeFolder(fp);
          }
          useLibraryStore.getState().clearStagedDeleteFolders();

          const currentImages = useLibraryStore.getState().images;
          const stagedFolderImages = currentImages.filter(i => isUnderAnyStaged(i.path)).map(i => i.path);
          if (stagedFolderImages.length > 0) {
            useLibraryStore.getState().removeImages(stagedFolderImages);
            useCollectionsStore.getState().pruneDeletedPaths(stagedFolderImages);
          }
        }

        // 2. Delete remaining rejected images outside deleted folders
        const remainingRejectedImages = rejectedImages.filter(img => !isUnderAnyStaged(img.path));
        let deletedPhotosCount = 0;

        if (remainingRejectedImages.length > 0) {
          const result = await invoke<{ deleted: string[]; failed: [string, string][] }>('delete_files', {
            paths: remainingRejectedImages.map(i => i.path),
            toTrash: !isNetwork,
            archiveRoot: rootPath || null,
          });

          deletedPhotosCount = result.deleted.length;
          useLibraryStore.getState().removeImages(result.deleted);
          useCollectionsStore.getState().pruneDeletedPaths(result.deleted);

          if (result.failed.length > 0) {
            const firstErr = result.failed[0][1];
            useToastStore.getState().showWarning(
              t('delete.partialFailed', {
                failed: result.failed.length,
                total: remainingRejectedImages.length,
                defaultValue: `${result.failed.length} von ${remainingRejectedImages.length} Datei(en) konnten nicht gelöscht werden: ${firstErr}`
              })
            );
          }
        }

        // Update selection to successor, or fallback to grid if no images remain
        const remainingImagesCount = displayedImages.filter(img => !toDeleteNormSet.has(normalizePath(img.path)) && !isUnderAnyStaged(img.path)).length;
        if (remainingImagesCount === 0) {
          setViewMode('grid');
          setSelectedPaths(new Set());
          setActiveImageIndex(0);
        } else if (nextCandidatePath) {
          setSelectedPaths(new Set([nextCandidatePath]));
        } else if (viewMode !== 'grid') {
          setViewMode('grid');
          setSelectedPaths(new Set());
          setActiveImageIndex(0);
        }

        // 3. Feedback Toast
        if (stagedCount > 0 && deletedPhotosCount > 0) {
          useToastStore.getState().showSuccess(
            isNetwork
              ? t('delete.mixedNasSuccessToast', {
                  folderCount: stagedCount,
                  photoCount: deletedPhotosCount,
                  defaultValue: `${stagedCount} Ordner und ${deletedPhotosCount} Bild(er) dauerhaft vom Netzwerklaufwerk gelöscht.`
                })
              : t('delete.mixedLocalSuccessToast', {
                  folderCount: stagedCount,
                  photoCount: deletedPhotosCount,
                  defaultValue: `${stagedCount} Ordner und ${deletedPhotosCount} Bild(er) in den Papierkorb verschoben.`
                })
          );
        } else if (stagedCount > 0) {
          useToastStore.getState().showSuccess(
            isNetwork
              ? t('folderDelete.multiNasSuccess', { count: stagedCount, defaultValue: `${stagedCount} Ordner dauerhaft vom Netzwerklaufwerk gelöscht.` })
              : t('folderDelete.multiLocalSuccess', { count: stagedCount, defaultValue: `${stagedCount} Ordner in den Papierkorb verschoben.` })
          );
        } else if (deletedPhotosCount > 0) {
          useToastStore.getState().showSuccess(
            isNetwork
              ? t('delete.nasSuccessToast', { count: deletedPhotosCount, defaultValue: `${deletedPhotosCount} Bild(er) dauerhaft vom Netzwerklaufwerk gelöscht.` })
              : t('delete.localSuccessToast', { count: deletedPhotosCount, defaultValue: `${deletedPhotosCount} Bild(er) in den Papierkorb verschoben.` })
          );
        }
      } catch (err: any) {
        console.error('Failed to delete rejected files/folders:', err);
        useToastStore.getState().showError(
          t('delete.failedError', { defaultValue: 'Löschen fehlgeschlagen: ' }) + (err?.message || err)
        );
      }
    }
  }, [rejectedCount, rejectedImages, stagedDeleteFolderPaths, images, rootPath, t]);

  const handleItemClick = useCallback((e: React.MouseEvent, clickedIndex: number, img: LibraryImage) => {
    const isMetaOrCtrl = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    if (isMetaOrCtrl) {
      const nextSelected = new Set(selectedPaths);
      const isCurrentlySelected = nextSelected.has(img.path);

      if (isCurrentlySelected) {
        // Deselect clicked item
        nextSelected.delete(img.path);
        setSelectedPaths(nextSelected);

        // If the active item was deselected, shift active index to nearest remaining selected photo
        if (clickedIndex === activeImageIndex) {
          if (nextSelected.size > 0) {
            let nearestIdx = -1;
            for (let dist = 1; dist < displayedImages.length; dist++) {
              const fwd = clickedIndex + dist;
              if (fwd < displayedImages.length && nextSelected.has(displayedImages[fwd].path)) {
                nearestIdx = fwd;
                break;
              }
              const bwd = clickedIndex - dist;
              if (bwd >= 0 && nextSelected.has(displayedImages[bwd].path)) {
                nearestIdx = bwd;
                break;
              }
            }
            if (nearestIdx !== -1) {
              setActiveImageIndex(nearestIdx);
            }
          }
        }
      } else {
        // Add clicked item to selection and set as primary active item
        nextSelected.add(img.path);
        setSelectedPaths(nextSelected);
        setActiveImageIndex(clickedIndex);
      }
    } else if (isShift) {
      // Range selection (anchor to clicked)
      const anchor = activeImageIndex >= 0 && activeImageIndex < displayedImages.length ? activeImageIndex : 0;
      selectRange(anchor, clickedIndex, displayedImages);
      setActiveImageIndex(clickedIndex);
    } else {
      // Single selection
      setSelectedPaths(new Set([img.path]));
      setActiveImageIndex(clickedIndex);
    }
  }, [activeImageIndex, displayedImages, selectedPaths, selectRange, setSelectedPaths, setActiveImageIndex]);

  const handleSortByExif = useCallback(async () => {
    if (!activeCollection) return;
    try {
      await sortCollectionByExif(activeCollection.id);
      useToastStore.getState().showSuccess(
        t('collections.sortedByExifSuccess', { defaultValue: 'Sammlung nach EXIF-Aufnahmedatum sortiert.' }),
        t('collections.sorted', { defaultValue: 'Sortiert' })
      );
    } catch (err) {
      console.error('Failed to sort collection by EXIF:', err);
      useToastStore.getState().showError(
        String(err),
        t('errors.sortFailed', { defaultValue: 'Sortierung fehlgeschlagen' })
      );
    }
  }, [activeCollection, sortCollectionByExif, t]);

  const handleRemoveFromCollection = useCallback(async (albumId: string, matchCount?: number, totalSelected?: number) => {
    const targetPaths = selectedPaths.size > 0
      ? Array.from(selectedPaths)
      : (activeImage ? [activeImage.path] : []);

    if (targetPaths.length === 0) return;

    try {
      await removeFromCollection(albumId, targetPaths);
      const targetAlbum = findAlbumById(collectionsTree, albumId);
      const albumName = targetAlbum?.name || 'Sammlung';

      const total = totalSelected ?? targetPaths.length;
      const count = matchCount ?? targetPaths.length;

      if (total > 1 && count < total) {
        useToastStore.getState().showSuccess(
          t('collections.removedPartialFromAlbum', {
            count,
            total,
            notIn: total - count,
            name: albumName,
            defaultValue: `${count} von ${total} ausgewählten Fotos aus „${albumName}“ entfernt (${total - count} Foto(s) nicht enthalten).`,
          })
        );
      } else {
        useToastStore.getState().showSuccess(
          t('collections.removedCountFromAlbum', {
            count,
            name: albumName,
            defaultValue: `${count} Foto(s) aus „${albumName}“ entfernt.`,
          })
        );
      }
    } catch (err) {
      console.error('Failed to remove from collection:', err);
      useToastStore.getState().showError(String(err));
    }
  }, [selectedPaths, activeImage, removeFromCollection, collectionsTree, t]);

  const handleRemoveFromAllCollections = useCallback(async (albumIds: string[]) => {
    const targetPaths = selectedPaths.size > 0
      ? Array.from(selectedPaths)
      : (activeImage ? [activeImage.path] : []);

    if (targetPaths.length === 0 || albumIds.length === 0) return;

    try {
      for (const id of albumIds) {
        await removeFromCollection(id, targetPaths);
      }
      useToastStore.getState().showSuccess(
        t('collections.removedFromAllCount', {
          count: targetPaths.length,
          albumCount: albumIds.length,
          defaultValue: `${targetPaths.length} Foto(s) aus allen ${albumIds.length} Sammlungen entfernt.`,
        })
      );
    } catch (err) {
      console.error('Failed to remove from all collections:', err);
      useToastStore.getState().showError(String(err));
    }
  }, [selectedPaths, activeImage, removeFromCollection, t]);

  const handleReorderInCollection = useCallback(async (sourcePath: string, targetPath: string, isAfter: boolean) => {
    if (!activeCollection) return;
    const normSource = normalizePath(sourcePath);
    const normTarget = normalizePath(targetPath);
    if (normSource === normTarget) return;

    const currentImages = [...activeCollection.images];
    const normSelected = new Set(Array.from(selectedPaths).map(p => normalizePath(p)));

    // Find moving items based on normalized paths, but keep original strings from activeCollection.images
    const movingNormalized = normSelected.has(normSource) && normSelected.size > 1
      ? normSelected
      : new Set([normSource]);

    if (movingNormalized.has(normTarget)) return;

    const movingItems = currentImages.filter(p => movingNormalized.has(normalizePath(p)));
    const remaining = currentImages.filter(p => !movingNormalized.has(normalizePath(p)));

    let insertIdx = remaining.findIndex(p => normalizePath(p) === normTarget);
    if (insertIdx === -1) {
      insertIdx = remaining.length;
    } else if (isAfter) {
      insertIdx += 1;
    }

    remaining.splice(insertIdx, 0, ...movingItems);
    await reorderImages(activeCollection.id, remaining);
  }, [activeCollection, selectedPaths, reorderImages]);

  const handleAddToCollection = useCallback(async (albumId: string) => {
    const targetPaths = selectedPaths.size > 0
      ? Array.from(selectedPaths)
      : (activeImage ? [activeImage.path] : []);

    if (targetPaths.length === 0) return;

    try {
      await addToCollection(albumId, targetPaths);
      const targetAlbum = findAlbumById(collectionsTree, albumId);
      const albumName = targetAlbum?.name || 'Sammlung';
      useToastStore.getState().showSuccess(
        t('collections.addedToCollection', {
          count: targetPaths.length,
          name: albumName,
          defaultValue: `${targetPaths.length} Foto(s) zu "${albumName}" hinzugefügt.`,
        })
      );
    } catch (err) {
      console.error('Failed to add to collection:', err);
      useToastStore.getState().showError(String(err));
    }
  }, [selectedPaths, activeImage, addToCollection, collectionsTree, t]);

  const handleCreateCollectionAndAdd = useCallback(async (name: string) => {
    const targetPaths = selectedPaths.size > 0
      ? Array.from(selectedPaths)
      : (activeImage ? [activeImage.path] : []);

    if (!name.trim()) return;

    try {
      await createCollection(name.trim(), null, false);
      const updatedTree = useCollectionsStore.getState().collectionsTree;
      const created = updatedTree.find(item => item.type === 'album' && item.name === name.trim());
      if (created && targetPaths.length > 0) {
        await addToCollection(created.id, targetPaths);
      }
      useToastStore.getState().showSuccess(
        t('collections.createdAndAdded', {
          count: targetPaths.length,
          name: name.trim(),
          defaultValue: `Sammlung "${name.trim()}" erstellt und ${targetPaths.length} Foto(s) hinzugefügt.`,
        })
      );
    } catch (err) {
      console.error('Failed to create collection and add:', err);
      useToastStore.getState().showError(String(err));
    }
  }, [selectedPaths, activeImage, createCollection, addToCollection, t]);

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
    activeImageIndex: safeActiveIndex,
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
      <div className={viewMode === 'fullscreen' ? 'hidden' : 'contents'}>
        <CullingToolbar
          activeImage={activeImage}
          displayedImages={displayedImages}
          availableTags={availableTags}
          colorCounts={colorCounts}
          ratingCounts={ratingCounts}
          rejectedCount={totalRejectedCount}
          handleCulling={handleCulling}
          handleSetColor={handleSetColor}
          handleRotate={handleRotate}
          handleDeleteRejected={handleDeleteRejected}
          toggleInspector={toggleInspector}
        />
      </div>

      {/* Active Collection Header Banner */}
      {activeCollection && viewMode !== 'fullscreen' && (
        <div className="bg-[#18181c] border-b border-app-border px-6 py-2 flex items-center justify-between z-20 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
              <FolderHeart className="w-4 h-4 text-accent" />
            </div>
            <div className="flex items-baseline gap-2 truncate">
              <h2 className="text-sm font-semibold text-txt-primary truncate">
                {activeCollection.name}
              </h2>
              <span className="text-xs text-txt-tertiary font-medium">
                {t('collections.photoCount', {
                  count: activeCollection.images.length,
                  defaultValue: `${activeCollection.images.length} Fotos`,
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSortByExif}
              title={t('collections.sortExifTooltip', { defaultValue: 'Reihenfolge nach EXIF-Aufnahmedatum (Älteste zuerst) sortieren' })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-app-panel hover:bg-app-hover border border-app-border text-txt-secondary hover:text-txt-primary transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <ArrowDownAZ className="w-3.5 h-3.5 text-accent" />
              <span>{t('collections.sortByExif', { defaultValue: 'Nach EXIF vorsortieren' })}</span>
            </button>

            <button
              onClick={() => openExportModal(activeCollection)}
              title={t('collections.exportTooltip', { defaultValue: 'Fotos aus dieser Sammlung exportieren (z. B. für Fotobuch oder als 1:1 Kopie)' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent hover:bg-accent/90 text-white transition-all cursor-pointer shadow-sm active:scale-98"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('collections.export', { defaultValue: 'Export...' })}</span>
            </button>

            <div className="w-px h-4 bg-app-border mx-1" />

            <button
              onClick={() => {
                selectCollection(null);
                useLibraryStore.getState().setActiveFolderPath(rootPath || null);
              }}
              title={t('collections.closeView', { defaultValue: 'Sammlung schließen' })}
              className="p-1.5 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative min-h-0 min-w-0 overflow-hidden z-0">
        {/* LibraryGrid: kept mounted at all times to preserve DOM layout and scroll state */}
        <div 
          className={`absolute inset-0 flex flex-col ${viewMode === 'grid' ? 'z-10 visible' : 'z-0 invisible pointer-events-none'}`}
        >
          <LibraryGrid
            displayedImages={displayedImages}
            activeImageIndex={safeActiveIndex}
            selectedPaths={selectedPaths}
            onItemClick={handleItemClick}
            onOpenLoupe={(idx) => {
              setActiveImageIndex(idx);
              setViewMode('loupe');
            }}
            onContextMenu={handleContextMenu}
            onClearSelection={() => setSelectedPaths(new Set())}
            viewMode={viewMode === 'grid' ? 'grid' : 'loupe'}
            isCollectionMode={!!activeCollection}
            onReorderImages={activeCollection ? handleReorderInCollection : undefined}
          />
        </div>

        {/* LoupeViewer: mounted on-demand when viewMode === 'loupe' */}
        {viewMode === 'loupe' && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <AppErrorBoundary fallbackTitle="Fehler in der Lupenansicht">
              <LoupeViewer
                activeImage={activeImage}
                activeImageIndex={safeActiveIndex}
                displayedImages={displayedImages}
                selectedPaths={selectedPaths}
                setActiveImageIndex={setActiveImageIndex}
                setSelectedPaths={setSelectedPaths}
                onItemClick={handleItemClick}
                onContextMenu={handleContextMenu}
              />
            </AppErrorBoundary>
          </div>
        )}

        {/* FullscreenViewer: mounted on-demand when viewMode === 'fullscreen' */}
        {viewMode === 'fullscreen' && (
          <div className="absolute inset-0 z-20 flex flex-col bg-black">
            <FullscreenViewer
              activeImage={activeImage}
              activeImageIndex={safeActiveIndex}
              displayedImages={displayedImages}
              selectedPaths={selectedPaths}
              setActiveImageIndex={setActiveImageIndex}
              setSelectedPaths={setSelectedPaths}
              handleCulling={handleCulling}
              handleSetColor={handleSetColor}
              handleRotate={handleRotate}
              onContextMenu={handleContextMenu}
            />
          </div>
        )}

        {/* Phase 2 & 3: Non-blocking Progressive Scan Banner */}
        <ArchiveScanBanner />
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedPaths.has(activeImage?.path || '') && selectedPaths.size > 1 ? selectedPaths.size : 1}
          targetPaths={selectedPaths.size > 0 ? Array.from(selectedPaths) : (activeImage ? [activeImage.path] : [])}
          currentRating={activeImage?.culling?.rating || 0}
          currentColor={activeImage?.culling?.color || null}
          onClose={() => setContextMenu(null)}
          onRotate={(dir) => handleRotate(dir)}
          onCulling={(flag, rating) => handleCulling(flag !== undefined ? flag : (activeImage?.culling.flag ?? null), rating ?? activeImage?.culling.rating ?? 0)}
          onSetColor={(color) => handleSetColor(color)}
          onOpenInRapidRaw={() => {
            if (activeImage) openInConfiguredRawDeveloper(activeImage.path);
          }}
          onShowInFinder={() => {
            if (activeImage) invoke('show_in_finder', { path: activeImage.path });
          }}
          onRemoveFromCollection={handleRemoveFromCollection}
          onRemoveFromAllCollections={handleRemoveFromAllCollections}
          onAddToCollection={handleAddToCollection}
          onCreateCollectionAndAdd={handleCreateCollectionAndAdd}
          zoomOptions={viewMode === 'loupe' ? {
            currentScale: loupeScale,
            onSetScale: (scale: number) => setLoupeScale(scale),
          } : undefined}
        />
      )}

      {/* Phase 1: Connecting Overlay (debounced >300ms, cancelable) */}
      <ArchiveConnectingOverlay />
    </div>
  );
}
