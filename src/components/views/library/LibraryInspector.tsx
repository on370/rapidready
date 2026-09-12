import { useEffect, useMemo, useState, useRef } from "react";
import { 
  X, MousePointerClick, Star, Check, RotateCw, RotateCcw, Tag, CircleSlash,
  AlertTriangle, Camera
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "../../../stores/libraryStore";
import { invoke } from "@tauri-apps/api/core";
import { getRrImageUrl, normalizePath } from "../../../utils/image";
import { COLOR_PALETTE } from "../../../constants/culling";
import { useToastStore } from "../../../stores/toastStore";

interface LibraryInspectorProps {
  close: () => void;
}

export function LibraryInspector({ close }: LibraryInspectorProps) {
  const { t } = useTranslation('library');
  const { 
    images, activeImageIndex, 
    updateCullingState, updateBatchCullingState, updateImageCullings, selectedPaths,
    updateImageMetadata, activeFolderPath, 
    lastImportPaths, isViewingLastImport, rootPath 
  } = useLibraryStore();

  const [tagInput, setTagInput] = useState('');
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const tagInputContainerRef = useRef<HTMLDivElement>(null);

  // Close tag suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagInputContainerRef.current && !tagInputContainerRef.current.contains(e.target as Node)) {
        setIsSuggestOpen(false);
      }
    };
    if (isSuggestOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSuggestOpen]);

  const normLastImport = useMemo(() => {
    return new Set(lastImportPaths.map(p => normalizePath(p)));
  }, [lastImportPaths]);

  const normActiveFolder = useMemo(() => {
    return activeFolderPath ? normalizePath(activeFolderPath) : null;
  }, [activeFolderPath]);

  const normRoot = useMemo(() => {
    return rootPath ? normalizePath(rootPath) : null;
  }, [rootPath]);

  const scopedImages = isViewingLastImport
    ? images.filter(img => normLastImport.has(normalizePath(img.path)))
    : normActiveFolder && normActiveFolder !== normRoot
      ? images.filter(img => {
          const p = normalizePath(img.path);
          return p.startsWith(normActiveFolder + '/') || p === normActiveFolder;
        })
      : images;

  const activeImage = scopedImages[activeImageIndex];

  // Lazy-load detailed EXIF metadata when an image is selected
  useEffect(() => {
    if (!activeImage) return;
    if (activeImage.camera === undefined || activeImage.camera === null) {
      let isMounted = true;
      invoke<{
        date: string | null;
        camera: string | null;
        lens: string | null;
        iso: string | null;
        aperture: string | null;
        shutter: string | null;
        is_raw?: boolean;
        is_monochrome_sensor?: boolean;
        is_monochrome_preview?: boolean;
      }>('get_image_metadata', { path: activeImage.path })
        .then(meta => {
          if (isMounted && meta) {
            updateImageMetadata(activeImage.path, {
              camera: meta.camera || null,
              lens: meta.lens || null,
              iso: meta.iso || null,
              aperture: meta.aperture || null,
              shutter: meta.shutter || null,
              date: meta.date || activeImage.date,
              is_raw: meta.is_raw ?? activeImage.is_raw,
              is_monochrome_sensor: meta.is_monochrome_sensor ?? false,
              is_monochrome_preview: meta.is_monochrome_preview ?? false,
            });
          }
        })
        .catch(console.error);

      return () => { isMounted = false; };
    }
  }, [activeImage?.path, updateImageMetadata]);

  const handleCulling = (flag: number | null, rating: number) => {
    if (!activeImage) return;
    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (pathsToUpdate.length > 1) {
      updateBatchCullingState(pathsToUpdate, { flag, rating });
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', { 
        paths: pathsToUpdate, 
        flag: flag === null ? 0 : flag, 
        rating, 
        color: null 
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
    }
  };

  const handleSetColor = (color: string | null) => {
    if (!activeImage) return;
    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (pathsToUpdate.length > 1) {
      updateBatchCullingState(pathsToUpdate, { color });
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: pathsToUpdate,
        color: color || 'none',
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
      if (globalIndex !== -1) updateCullingState(globalIndex, { color });
      invoke('set_culling_state', { 
        path: activeImage.path, 
        flag: activeImage.culling.flag, 
        rating: activeImage.culling.rating, 
        color,
        tags: activeImage.culling.tags,
      }).catch((err) => {
        console.error('Failed to set color:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    }
  };

  const allFolderTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of scopedImages) {
      for (const t of img.culling.tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [scopedImages]);

  const suggestions = useMemo(() => {
    if (!activeImage) return [];
    const lowerInput = tagInput.trim().toLowerCase();
    const assignedSet = new Set(activeImage.culling.tags.map(t => t.toLowerCase()));
    
    return allFolderTags.filter(item => {
      if (assignedSet.has(item.name.toLowerCase())) return false;
      if (lowerInput) {
        return item.name.toLowerCase().includes(lowerInput);
      }
      return true;
    });
  }, [allFolderTags, activeImage, tagInput]);

  const handleAddSpecificTag = (tagToAdd: string) => {
    if (!activeImage) return;
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    if (activeImage.culling.tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      setIsSuggestOpen(false);
      return;
    }
    const newTags = [...activeImage.culling.tags, trimmed];

    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (pathsToUpdate.length > 1) {
      for (const p of pathsToUpdate) {
        const img = images.find(i => i.path === p);
        if (img && !img.culling.tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
          const updated = [...img.culling.tags, trimmed];
          const idx = images.findIndex(i => i.path === p);
          if (idx !== -1) updateCullingState(idx, { tags: updated });
        }
      }
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: pathsToUpdate,
        addTag: trimmed,
      }).then((res) => {
        if (res && res.failed > 0) {
          useToastStore.getState().showWarning(
            t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
            t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
          );
        }
      }).catch((err) => {
        console.error('Failed to add tag batch:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { tags: newTags });
      invoke('set_culling_state', { 
        path: activeImage.path, 
        flag: activeImage.culling.flag, 
        rating: activeImage.culling.rating, 
        color: activeImage.culling.color,
        tags: newTags,
      }).catch((err) => {
        console.error('Failed to add tag:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    }
    setTagInput('');
    setIsSuggestOpen(false);
    setHighlightedIndex(-1);
  };

  const handleAddTag = () => {
    if (isSuggestOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      handleAddSpecificTag(suggestions[highlightedIndex].name);
    } else {
      handleAddSpecificTag(tagInput);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isSuggestOpen) {
        setIsSuggestOpen(true);
        setHighlightedIndex(0);
      } else if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isSuggestOpen && suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setIsSuggestOpen(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeImage) return;
    const newTags = activeImage.culling.tags.filter(t => t !== tagToRemove);

    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (pathsToUpdate.length > 1) {
      for (const p of pathsToUpdate) {
        const img = images.find(i => i.path === p);
        if (img && img.culling.tags.includes(tagToRemove)) {
          const updated = img.culling.tags.filter(t => t !== tagToRemove);
          const idx = images.findIndex(i => i.path === p);
          if (idx !== -1) updateCullingState(idx, { tags: updated });
        }
      }
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: pathsToUpdate,
        removeTag: tagToRemove,
      }).then((res) => {
        if (res && res.failed > 0) {
          useToastStore.getState().showWarning(
            t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
            t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
          );
        }
      }).catch((err) => {
        console.error('Failed to remove tag batch:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { tags: newTags });
      invoke('set_culling_state', { 
        path: activeImage.path, 
        flag: activeImage.culling.flag, 
        rating: activeImage.culling.rating, 
        color: activeImage.culling.color,
        tags: newTags,
      }).catch((err) => {
        console.error('Failed to remove tag:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    }
  };

  const handleRotate = async (direction: 'cw' | 'ccw') => {
    if (!activeImage) return;
    const pathsToRotate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    try {
      const res = await invoke<Array<{ path: string; culling: any }>>('rotate_images', {
        paths: pathsToRotate,
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
  };

  const extension = activeImage?.name.split('.').pop()?.toUpperCase() || '';
  const isRaw = activeImage?.is_raw ?? ['CR2', 'CR3', 'ARW', 'NEF', 'DNG', 'ORF', 'RAF', 'RW2', 'PEF', '3FR'].includes(extension);

  return (
    <div className="w-full h-full flex-shrink-0 bg-app-panel flex flex-col min-h-0 overflow-hidden">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
          {t('inspector.title')}
        </h2>
        <button className="p-1 rounded hover:bg-app-hover transition-colors cursor-pointer" onClick={close}>
          <X className="w-3.5 h-3.5 text-txt-tertiary" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!activeImage ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-3">
              <MousePointerClick className="w-6 h-6 text-txt-tertiary" />
            </div>
            <p className="text-sm font-semibold text-txt-primary">{t('inspector.noSelection')}</p>
            <p className="text-xs text-txt-tertiary mt-1 max-w-[200px]">{t('inspector.noSelectionDesc')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Live Thumbnail Preview */}
            <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border border-app-border bg-app-deepest group">
              <img 
                src={getRrImageUrl(activeImage.path, false, activeImage.culling?.orientation)} 
                alt={activeImage.name} 
                className="w-full h-full object-contain" 
              />
              <div className="absolute top-2 right-2 flex gap-1.5">
                {activeImage.culling.flag === 1 && (
                  <span className="w-5 h-5 rounded-full bg-success flex items-center justify-center shadow">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
                {activeImage.culling.flag === -1 && (
                  <span className="w-5 h-5 rounded-full bg-danger flex items-center justify-center text-xs font-bold text-white shadow">
                    X
                  </span>
                )}
              </div>
              <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[11px] font-mono text-white">
                <span className={isRaw ? "text-accent font-semibold" : "text-txt-secondary"}>{extension}</span>
                <span className="text-white/40">·</span>
                <span>{(activeImage.size / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            </div>

            {/* RAW & Monochrome Sensor/Preview Status Notification */}
            {isRaw && (
              <>
                {activeImage.is_monochrome_sensor ? (
                  <div 
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-txt-secondary text-xs"
                    title={t('inspector.monoSensorTooltip', 'Hardware-Monochromsensor. Das RAW enthält native Schwarz-Weiß-Sensordaten ohne Farbfilter.')}
                  >
                    <Camera className="w-4 h-4 text-white/80 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-white/90 text-[11px] block">{t('inspector.monoSensor', 'Monochrom-Sensor')}</span>
                      <span className="text-[10px] text-txt-tertiary block">{t('inspector.monoSensorDesc', 'Hardware-Sensor ohne Bayer-Matrix (echtes S/W)')}</span>
                    </div>
                  </div>
                ) : activeImage.is_monochrome_preview ? (
                  <div 
                    className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shadow-sm"
                    title={t('inspector.bwWarningTooltip', 'Die Kamera war auf einen Schwarz-Weiß-Bildstil eingestellt. Das Vorschaubild ist monochrom, die RAW-Datei enthält jedoch die vollen Farbinformationen des Sensors.')}
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-300 text-[11px] block">{t('inspector.bwWarningTitle', 'S/W-Vorschau (RAW ist Farbe)')}</span>
                      <span className="text-[10px] text-amber-400/80 block mt-0.5 leading-snug">
                        {t('inspector.bwWarningSubtitle', 'Kamerastil ist Schwarz-Weiß. Die RAW-Datei enthält alle Farbinformationen!')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-app-card/60 border border-app-border/40 text-txt-tertiary text-[10px]"
                    title={t('inspector.inCameraPreviewTooltip', 'Eingebettete Kamera-Vorschau (Farbe & Belichtung können vom RAW-Entwickler abweichen).')}
                  >
                    <span>{t('inspector.previewRendering', 'Vorschau: In-Camera JPEG')}</span>
                    <span className="text-white/40 font-mono">JPG Preview</span>
                  </div>
                )}
              </>
            )}

            {/* Interactive Culling Card */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
              <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('inspector.culling')}</h3>
              
              {/* Flag Row */}
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handleCulling(1, activeImage.culling.rating)} 
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all border cursor-pointer ${activeImage.culling.flag === 1 ? 'bg-success text-white border-success' : 'border-app-border hover:bg-success/15 text-txt-secondary'}`}
                  title={t('inspector.pick')}
                >
                  <Check className="w-3 h-3" />
                  <span>{t('inspector.pickBtn', 'Pick')}</span>
                  <kbd className="text-[9px] opacity-70 font-mono">P</kbd>
                </button>

                <button 
                  onClick={() => handleCulling(null, activeImage.culling.rating)} 
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-all border cursor-pointer ${activeImage.culling.flag === null ? 'bg-app-hover text-txt-primary border-app-border' : 'border-app-border hover:bg-app-hover text-txt-tertiary'}`}
                  title={t('inspector.unflag')}
                >
                  <span>{t('inspector.unflagBtn', 'Unflag')}</span>
                  <kbd className="text-[9px] opacity-70 font-mono">U</kbd>
                </button>

                <button 
                  onClick={() => handleCulling(-1, activeImage.culling.rating)} 
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all border cursor-pointer ${activeImage.culling.flag === -1 ? 'bg-danger text-white border-danger' : 'border-app-border hover:bg-danger/15 text-txt-secondary'}`}
                  title={t('inspector.reject')}
                >
                  <span>{t('inspector.rejectBtn', 'Reject')}</span>
                  <kbd className="text-[9px] opacity-70 font-mono">X</kbd>
                </button>
              </div>

              {/* Stars Row */}
              <div className="flex items-center justify-center gap-2 pt-1 border-t border-app-border/50">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button 
                    key={star}
                    onClick={() => handleCulling(activeImage.culling.flag, activeImage.culling.rating === star ? 0 : star)}
                    className="p-1 hover:scale-115 transition-transform cursor-pointer"
                    title={`${star} ★`}
                  >
                    <Star className={`w-4 h-4 ${activeImage.culling.rating >= star ? 'text-warning fill-warning' : 'text-txt-tertiary hover:text-warning/50'}`} />
                  </button>
                ))}
              </div>

              {/* Color Labels Row */}
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-app-border/50">
                {COLOR_PALETTE.map((c) => {
                  const isSelected = activeImage.culling.color === c.id;
                  return (
                    <button 
                      key={c.id}
                      onClick={() => handleSetColor(isSelected ? null : c.id)}
                      className={`w-5 h-5 rounded-full ${c.bg} flex items-center justify-center hover:scale-115 transition-all cursor-pointer relative ${
                        isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-app-card shadow-sm' : 'opacity-70 hover:opacity-100'
                      }`}
                      title={`${t(`colors.${c.id}`)}${c.shortcut ? ` (${c.shortcut})` : ''}`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white drop-shadow" />}
                    </button>
                  );
                })}
                {activeImage.culling.color && (
                  <button
                    onClick={() => handleSetColor(null)}
                    className="w-5 h-5 rounded-full bg-app-panel border border-app-border hover:bg-app-hover flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:scale-115 transition-all cursor-pointer ml-1"
                    title={t('colors.none')}
                  >
                    <CircleSlash className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Rotate Row */}
              <div className="flex items-center justify-between pt-2 border-t border-app-border/50 px-1">
                <span className="text-[11px] text-txt-tertiary font-medium">{t('toolbar.rotateLabel')}</span>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleRotate('ccw')}
                    className="p-1.5 rounded-md hover:bg-app-hover text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
                    title={t('toolbar.rotateCcwTooltip')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => handleRotate('cw')}
                    className="p-1.5 rounded-md hover:bg-app-hover text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
                    title={t('toolbar.rotateCwTooltip')}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tags / Schlagwörter Card */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-txt-tertiary" />
                  <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider">
                    {t('inspector.tags')}
                  </h3>
                </div>
                {activeImage.culling.tags.length > 0 && (
                  <span className="text-[10px] text-txt-tertiary font-mono bg-app-panel px-1.5 py-0.2 rounded border border-app-border">
                    {activeImage.culling.tags.length}
                  </span>
                )}
              </div>

              {/* Tag Pills */}
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {activeImage.culling.tags.length === 0 ? (
                  <span className="text-xs text-txt-tertiary italic py-0.5">
                    {t('inspector.noTags')}
                  </span>
                ) : (
                  activeImage.culling.tags.map((tag) => (
                    <span 
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-app-panel border border-app-border text-xs text-txt-primary hover:border-accent/40 transition-colors"
                    >
                      <span>{tag}</span>
                      <button 
                        onClick={() => handleRemoveTag(tag)}
                        className="text-txt-tertiary hover:text-danger rounded transition-colors cursor-pointer p-0.5"
                        title={t('inspector.removeTagTooltip', { tag })}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Tag Input with Autocomplete */}
              <div className="relative" ref={tagInputContainerRef}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setIsSuggestOpen(true);
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => {
                    setIsSuggestOpen(true);
                    setHighlightedIndex(-1);
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder={t('inspector.addTag')}
                  className="w-full bg-app-panel border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:border-accent transition-colors pr-7"
                />
                {tagInput.trim().length > 0 && (
                  <button
                    onClick={() => handleAddSpecificTag(tagInput)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-accent text-white text-[10px] font-semibold rounded hover:bg-accent/80 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                )}

                {/* Autocomplete Suggestions Dropdown */}
                {isSuggestOpen && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-[#161619]/95 backdrop-blur-md border border-app-border rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary border-b border-app-border/40 mb-0.5">
                      {t('inspector.suggestions')}
                    </div>
                    {suggestions.map((item, idx) => {
                      const isHighlighted = highlightedIndex === idx;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddSpecificTag(item.name);
                          }}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-left ${
                            isHighlighted ? 'bg-accent text-white' : 'text-txt-primary hover:bg-app-hover'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Tag className={`w-3 h-3 ${isHighlighted ? 'text-white' : 'text-txt-tertiary'}`} />
                            <span className="font-medium truncate">{item.name}</span>
                          </div>
                          <span className={`text-[10px] font-mono ml-2 ${isHighlighted ? 'text-white/80' : 'text-txt-tertiary'}`}>
                            {item.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* File Info */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-app-border/50 pb-1.5">
                <span className="text-xs font-semibold text-txt-primary truncate mr-2" title={activeImage.name}>{activeImage.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${isRaw ? 'bg-accent/15 text-accent' : 'bg-app-panel text-txt-secondary'}`}>
                  {extension}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.size')}</span>
                  <p className="text-txt-primary font-medium">{(activeImage.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.date')}</span>
                  <p className="text-txt-primary font-medium truncate" title={activeImage.date || '—'}>
                    {activeImage.date ? activeImage.date.replace('T', ' ').substring(0, 19) : '—'}
                  </p>
                </div>
              </div>
              <div className="pt-1 border-t border-app-border/40">
                <span className="text-txt-tertiary block text-[10px]">{t('inspector.path')}</span>
                <p className="text-txt-secondary font-mono text-[10px] truncate" title={activeImage.path}>
                  {activeImage.path}
                </p>
              </div>
            </div>

            {/* Camera & Exposure Info */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
              <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('inspector.camera')}</h3>
              <div className="space-y-2 text-[11px]">
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.body')}</span>
                  <p className="text-txt-primary font-medium truncate" title={activeImage.camera || '—'}>
                    {activeImage.camera || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.lens')}</span>
                  <p className="text-txt-primary font-medium truncate" title={activeImage.lens || '—'}>
                    {activeImage.lens || '—'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-app-border/40">
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.iso')}</span>
                    <p className="text-txt-primary font-mono font-medium">{activeImage.iso ? `ISO ${activeImage.iso}` : '—'}</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.aperture')}</span>
                    <p className="text-txt-primary font-mono font-medium">{activeImage.aperture || '—'}</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.shutter')}</span>
                    <p className="text-txt-primary font-mono font-medium">{activeImage.shutter || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

