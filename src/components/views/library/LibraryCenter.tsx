import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLibraryStore, LibraryImage, CullingState } from "../../../stores/libraryStore";
import { ContextMenu } from "./ContextMenu";
import { ArchiveConnectingOverlay } from "./components/ArchiveConnectingOverlay";
import { ArchiveScanBanner } from "./components/ArchiveScanBanner";
import { invoke } from "@tauri-apps/api/core";
import { normalizePath } from "../../../utils/image";

import { CullingToolbar } from "./components/CullingToolbar";
import { LibraryGrid } from "./components/LibraryGrid";
import { LoupeViewer } from "./components/LoupeViewer";
import { useLibraryShortcuts } from "./hooks/useLibraryShortcuts";

import { useLibraryUIStore } from "../../../stores/libraryUIStore";
import { useToastStore } from "../../../stores/toastStore";
import { useDialogStore } from "../../../stores/dialogStore";
import { useCollectionsStore, findAlbumById } from "../../../stores/collectionsStore";
import { FolderHeart, Download, ArrowDownAZ, X } from "lucide-react";

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
    selectedPaths, setSelectedPaths, selectRange, selectAll,
    activeFolderPath, selectedFolderPaths, filterMode,
    selectedRatingFilter,
    selectedColorFilter,
    selectedTagFilter,
    lastImportPaths, isViewingLastImport, rootPath,
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

  const scopedImages = React.useMemo(() => {
    // When viewing an active collection, display collection images in their exact manual order!
    if (activeCollectionId) {
      if (!activeCollection) {
        // Collection selected but tree is still loading or album not found:
        // NEVER fall through to showing all library images! Return empty array while loading.
        return [];
      }
      const imgMap = new Map<string, LibraryImage>();
      for (const img of images) {
        imgMap.set(normalizePath(img.path), img);
      }
      const list: LibraryImage[] = [];
      for (const path of activeCollection.images) {
        const norm = normalizePath(path);
        const existing = imgMap.get(norm);
        if (existing) {
          list.push(existing);
        }
      }
      return list;
    }

    let list: LibraryImage[];
    if (isViewingLastImport) {
      list = images.filter(img => normLastImport.has(normalizePath(img.path)));
    } else if (
      selectedFolderPaths && 
      selectedFolderPaths.size > 0 && 
      !(selectedFolderPaths.size === 1 && normRoot && selectedFolderPaths.has(normRoot))
    ) {
      list = images.filter((img) => {
        const p = normalizePath(img.path);
        const lastSlash = p.lastIndexOf('/');
        const dir = lastSlash > 0 ? p.substring(0, lastSlash) : p;
        return selectedFolderPaths.has(dir);
      });
    } else if (normActiveFolder && normActiveFolder !== normRoot) {
      list = images.filter((img) => {
        const p = normalizePath(img.path);
        return p.startsWith(normActiveFolder + '/') || p === normActiveFolder;
      });
    } else {
      list = images;
    }

    // Always guarantee alphabetical sorting by path so order is 100% deterministic!
    return list.slice().sort((a, b) => a.path.localeCompare(b.path));
  }, [activeCollectionId, activeCollection, images, isViewingLastImport, normLastImport, selectedFolderPaths, normActiveFolder, normRoot]);

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

  const activeImage = useMemo(() => {
    if (selectedPaths.size === 0) return undefined;
    const candidate = displayedImages[activeImageIndex];
    if (candidate && selectedPaths.has(candidate.path)) {
      return candidate;
    }
    const found = displayedImages.find(img => selectedPaths.has(img.path));
    if (found) return found;
    return images.find(img => selectedPaths.has(img.path));
  }, [selectedPaths, displayedImages, activeImageIndex, images]);

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

  const handleDeleteRejected = useCallback(async () => {
    if (rejectedCount === 0) return;

    // Check if archive root or rejected images reside on a network share / NAS
    const checkPaths = [rootPath, ...rejectedImages.slice(0, 10).map(i => i.path)].filter(Boolean) as string[];
    const isNetwork = await invoke<boolean>('are_any_network_paths', { paths: checkPaths }).catch((err) => {
      console.error('Failed to check network path in delete rejected:', err);
      return false;
    });

    const confirmed = await useDialogStore.getState().confirmDestructive({
      title: isNetwork
        ? t('delete.nasConfirmTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
        : t('delete.confirmTitle', { defaultValue: 'In den Papierkorb verschieben' }),
      message: isNetwork
        ? t('delete.nasConfirmMessage', {
            count: rejectedCount,
            defaultValue: `Die ${rejectedCount} verworfenen Bilder liegen auf einer Netzwerkfreigabe (NAS).\n\nDateien auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nSie werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du diese ${rejectedCount} Bilder jetzt wirklich unwiderruflich löschen?`
          })
        : t('delete.confirmMessage', {
            count: rejectedCount,
            defaultValue: `Möchtest du ${rejectedCount} verworfene(s) Bild(er) in den Papierkorb verschieben?`
          }),
      confirmLabel: isNetwork
        ? t('delete.nasOkLabel', { defaultValue: 'Unwiderruflich löschen' })
        : t('delete.okLabel', { defaultValue: 'In den Papierkorb' }),
      cancelLabel: t('delete.cancelLabel', { defaultValue: 'Abbrechen' })
    });

    if (confirmed) {
      try {
        const result = await invoke<{ deleted: string[]; failed: [string, string][] }>('delete_files', {
          paths: rejectedImages.map(i => i.path),
          toTrash: !isNetwork,
          archiveRoot: rootPath || null,
        });

        if (result.deleted.length > 0) {
          const rejectedPathSet = new Set(result.deleted);
          const remaining = images.filter(i => !rejectedPathSet.has(i.path));
          useLibraryStore.getState().setImages(remaining);
          useCollectionsStore.getState().pruneDeletedPaths(result.deleted);
        }

        if (result.failed.length > 0) {
          const firstErr = result.failed[0][1];
          useToastStore.getState().showWarning(
            t('delete.partialFailed', {
              failed: result.failed.length,
              total: rejectedCount,
              defaultValue: `${result.failed.length} von ${rejectedCount} Datei(en) konnten nicht gelöscht werden: ${firstErr}`
            })
          );
        } else {
          useToastStore.getState().showSuccess(
            isNetwork
              ? t('delete.nasSuccessToast', { count: result.deleted.length, defaultValue: `${result.deleted.length} Bild(er) dauerhaft vom Netzwerklaufwerk gelöscht.` })
              : t('delete.localSuccessToast', { count: result.deleted.length, defaultValue: `${result.deleted.length} Bild(er) in den Papierkorb verschoben.` })
          );
        }
      } catch (err: any) {
        console.error('Failed to delete rejected files:', err);
        useToastStore.getState().showError(
          t('delete.failedError', { defaultValue: 'Löschen fehlgeschlagen: ' }) + (err?.message || err)
        );
      }
    }
  }, [rejectedCount, rejectedImages, images, rootPath, t]);

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

      {/* Active Collection Header Banner */}
      {activeCollection && (
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
            activeImageIndex={activeImageIndex}
            selectedPaths={selectedPaths}
            onItemClick={handleItemClick}
            onOpenLoupe={(idx) => {
              setActiveImageIndex(idx);
              setViewMode('loupe');
            }}
            onContextMenu={handleContextMenu}
            onClearSelection={() => setSelectedPaths(new Set())}
            viewMode={viewMode}
            isCollectionMode={!!activeCollection}
            onReorderImages={activeCollection ? handleReorderInCollection : undefined}
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
          targetPaths={selectedPaths.size > 0 ? Array.from(selectedPaths) : (activeImage ? [activeImage.path] : [])}
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

      {/* Phase 2 & 3: Non-blocking Progressive Scan Banner */}
      <ArchiveScanBanner />
    </div>
  );
}
