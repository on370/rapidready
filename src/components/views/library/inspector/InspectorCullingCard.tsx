import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Check, Star, CircleSlash, RotateCcw, RotateCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { LibraryImage, useLibraryStore } from "../../../../stores/libraryStore";
import { COLOR_PALETTE } from "../../../../constants/culling";
import { useToastStore } from "../../../../stores/toastStore";

interface InspectorCullingCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function InspectorCullingCard({
  activeImage,
  isCollapsed,
  onToggle,
}: InspectorCullingCardProps) {
  const { t } = useTranslation('library');
  const { 
    images, selectedPaths, 
    updateCullingState, updateBatchCullingState, updateImageCullings 
  } = useLibraryStore();

  const handleCulling = (flag: number | null, rating: number) => {
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

  const handleRotate = async (direction: 'cw' | 'ccw') => {
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

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-1.5">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          )}
          <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider group-hover:text-txt-secondary transition-colors">
            {t('inspector.culling')}
          </h3>
        </div>

        {isCollapsed && (
          <div className="flex items-center gap-1.5">
            {activeImage.culling.flag === 1 && (
              <span className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </span>
            )}
            {activeImage.culling.flag === -1 && (
              <span className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-[10px] font-bold text-white">
                X
              </span>
            )}
            {activeImage.culling.rating > 0 && (
              <span className="text-[10px] text-warning flex items-center gap-0.5 font-medium">
                <Star className="w-3 h-3 fill-warning text-warning" />
                {activeImage.culling.rating}
              </span>
            )}
            {activeImage.culling.color && (
              <span className={`w-2.5 h-2.5 rounded-full ${COLOR_PALETTE.find(c => c.id === activeImage.culling.color)?.bg || 'bg-accent'}`} />
            )}
          </div>
        )}
      </div>
      
      {!isCollapsed && (
        <>
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
        </>
      )}
    </div>
  );
}
