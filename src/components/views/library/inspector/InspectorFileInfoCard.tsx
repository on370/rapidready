import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  ChevronDown, ChevronRight, Pencil, RotateCcw, 
  Check, Info, FolderSync, Clock, Calendar 
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { LibraryImage, useLibraryStore } from "../../../../stores/libraryStore";
import { useCollectionsStore } from "../../../../stores/collectionsStore";
import { useToastStore } from "../../../../stores/toastStore";
import { formatDimensions, formatDisplayDate, areDatesDifferent } from "../../../../utils/formatMetadata";

interface InspectorFileInfoCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
  extension: string;
  isRaw: boolean;
}

export function InspectorFileInfoCard({
  activeImage,
  isCollapsed,
  onToggle,
  extension,
  isRaw,
}: InspectorFileInfoCardProps) {
  const { t } = useTranslation('library');
  const { 
    images, selectedPaths, rootPath, 
    updateImageMetadata, removeImages, addDiscoveredFolders, reconcileArchiveDelta 
  } = useLibraryStore();

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateMode, setDateMode] = useState<'set' | 'shift'>('set');
  const [dateInput, setDateInput] = useState('');
  
  // Time shift inputs
  const [shiftDirection, setShiftDirection] = useState<'+' | '-'>('+');
  const [shiftHours, setShiftHours] = useState(0);
  const [shiftMinutes, setShiftMinutes] = useState(0);
  const [shiftSeconds, setShiftSeconds] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [isRelocating, setIsRelocating] = useState(false);

  // Reset editor when active image changes
  useEffect(() => {
    setIsEditingDate(false);
  }, [activeImage.path]);

  // Compute all target paths (including selection & stack members)
  const allTargetPaths = useMemo(() => {
    const basePaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    const result = new Set<string>();
    for (const p of basePaths) {
      result.add(p);
      const img = images.find(i => i.path === p);
      if (img?.stackMembers) {
        for (const m of img.stackMembers) {
          result.add(m.path);
        }
      }
    }
    return Array.from(result);
  }, [selectedPaths, activeImage, images]);

  const isManualDate = Boolean(activeImage.date_override || (activeImage.time_shift_seconds != null && activeImage.time_shift_seconds !== 0));

  const startEditingDate = () => {
    setDateMode('set');
    setDateInput(activeImage.date_override || activeImage.date || '');
    if (activeImage.time_shift_seconds) {
      const absShift = Math.abs(activeImage.time_shift_seconds);
      setShiftDirection(activeImage.time_shift_seconds < 0 ? '-' : '+');
      setShiftHours(Math.floor(absShift / 3600));
      setShiftMinutes(Math.floor((absShift % 3600) / 60));
      setShiftSeconds(absShift % 60);
    } else {
      setShiftDirection('+');
      setShiftHours(0);
      setShiftMinutes(0);
      setShiftSeconds(0);
    }
    setIsEditingDate(true);
  };

  const handleSaveDate = async () => {
    setIsSaving(true);
    try {
      let dateOverrideParam: string | null = null;
      let timeShiftParam: number | null = null;

      if (dateMode === 'set') {
        dateOverrideParam = dateInput.trim() || null;
      } else {
        const totalSec = (shiftDirection === '-' ? -1 : 1) * (
          (Number(shiftHours) || 0) * 3600 + 
          (Number(shiftMinutes) || 0) * 60 + 
          (Number(shiftSeconds) || 0)
        );
        timeShiftParam = totalSec !== 0 ? totalSec : null;
      }

      await invoke('set_date_override_batch', {
        paths: allTargetPaths,
        dateOverride: dateOverrideParam,
        timeShiftSeconds: timeShiftParam,
        resetOverride: false,
      });

      // Fetch fresh metadata for active image to update store accurately
      const freshMeta = await invoke<Partial<LibraryImage>>('get_image_metadata', { path: activeImage.path }).catch(() => null);

      for (const p of allTargetPaths) {
        if (p === activeImage.path && freshMeta) {
          updateImageMetadata(p, {
            date: freshMeta.date || activeImage.date,
            original_date: freshMeta.original_date ?? activeImage.original_date,
            date_override: freshMeta.date_override ?? null,
            time_shift_seconds: freshMeta.time_shift_seconds ?? null,
          });
        } else {
          updateImageMetadata(p, {
            date_override: dateOverrideParam,
            time_shift_seconds: timeShiftParam,
          });
        }
      }

      useToastStore.getState().showSuccess(
        t('inspector.dateSavedToast', { count: allTargetPaths.length }),
        t('inspector.dateCaptured', 'Aufnahme')
      );
      setIsEditingDate(false);
    } catch (err) {
      console.error('Failed to save date override:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.dateSaveFailed', 'Fehler beim Speichern des Aufnahmedatums')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDate = async () => {
    setIsSaving(true);
    try {
      await invoke('set_date_override_batch', {
        paths: allTargetPaths,
        dateOverride: null,
        timeShiftSeconds: null,
        resetOverride: true,
      });

      const freshMeta = await invoke<Partial<LibraryImage>>('get_image_metadata', { path: activeImage.path }).catch(() => null);

      for (const p of allTargetPaths) {
        if (p === activeImage.path && freshMeta) {
          updateImageMetadata(p, {
            date: freshMeta.date || activeImage.original_date || activeImage.date,
            original_date: freshMeta.original_date ?? activeImage.original_date,
            date_override: null,
            time_shift_seconds: null,
          });
        } else {
          updateImageMetadata(p, {
            date_override: null,
            time_shift_seconds: null,
          });
        }
      }

      useToastStore.getState().showSuccess(
        t('inspector.dateResetToast', 'Aufnahmedatum auf Original zurückgesetzt.'),
        t('inspector.dateCaptured', 'Aufnahme')
      );
      setIsEditingDate(false);
    } catch (err) {
      console.error('Failed to reset date override:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.dateSaveFailed', 'Fehler beim Speichern des Aufnahmedatums')
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Mismatch detection: Folder date (YYYY-MM) vs effective capture date (YYYY-MM)
  const folderMismatch = useMemo(() => {
    if (!rootPath || !activeImage.date || !activeImage.path) return false;
    const normPath = activeImage.path.replace(/\\/g, '/');
    const normRoot = rootPath.replace(/\\/g, '/');
    if (!normPath.startsWith(normRoot)) return false;

    const relPath = normPath.slice(normRoot.length).replace(/^\/+/, '');
    const segments = relPath.split('/').slice(0, -1);
    
    let folderYM: string | null = null;
    for (const seg of segments) {
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(seg) || /^\d{4}-\d{2}$/.test(seg)) {
        folderYM = seg.substring(0, 7);
        break;
      }
    }
    if (!folderYM) return false;

    const normalizedDate = activeImage.date.replace(/^(\d{4}):(\d{2})/, '$1-$2');
    const effectiveYM = normalizedDate.substring(0, 7);
    if (!/^\d{4}-\d{2}$/.test(effectiveYM)) return false;

    return folderYM !== effectiveYM;
  }, [rootPath, activeImage.date, activeImage.path]);

  const handleRelocate = async () => {
    if (!rootPath) return;
    setIsRelocating(true);
    try {
      const res = await invoke<{
        moved: [string, string][];
        new_dirs: string[];
        failed: [string, string][];
      }>('relocate_images_by_date', {
        paths: allTargetPaths,
        archiveRoot: rootPath,
      });

      if (res && res.moved.length > 0) {
        const oldPaths = res.moved.map(([oldP]) => oldP);
        removeImages(oldPaths);
        if (res.new_dirs && res.new_dirs.length > 0) {
          addDiscoveredFolders(res.new_dirs);
        }
        useCollectionsStore.getState().loadCollections();
        reconcileArchiveDelta(rootPath, true);

        useToastStore.getState().showSuccess(
          t('inspector.relocateSuccess', { count: res.moved.length }),
          t('inspector.relocateTitle', 'Archiv-Umzug')
        );
      }

      if (res && res.failed.length > 0) {
        useToastStore.getState().showWarning(
          t('errors.batchSaveFailed', { failed: res.failed.length, total: allTargetPaths.length }),
          t('inspector.relocateFailed', 'Fehler beim Verschieben')
        );
      }
    } catch (err) {
      console.error('Failed to relocate images:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.relocateFailed', 'Fehler beim Verschieben')
      );
    } finally {
      setIsRelocating(false);
    }
  };

  const dimensionsInfo = useMemo(() => {
    return formatDimensions(activeImage.width, activeImage.height, activeImage.culling?.orientation);
  }, [activeImage.width, activeImage.height, activeImage.culling?.orientation]);

  const formattedCaptureDate = useMemo(() => formatDisplayDate(activeImage.date), [activeImage.date]);
  const captureDateTitle = useMemo(() => {
    if (!formattedCaptureDate) return '—';
    if (activeImage.subsec_time) {
      return `${formattedCaptureDate}.${activeImage.subsec_time}`;
    }
    return formattedCaptureDate;
  }, [formattedCaptureDate, activeImage.subsec_time]);
  const formattedModifiedDate = useMemo(() => formatDisplayDate(activeImage.date_modified), [activeImage.date_modified]);
  const hasDifferentModifiedDate = useMemo(() => {
    return areDatesDifferent(activeImage.date, activeImage.date_modified);
  }, [activeImage.date, activeImage.date_modified]);

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2">
      <div 
        onClick={onToggle}
        className={`flex items-center justify-between cursor-pointer select-none group ${!isCollapsed ? 'border-b border-app-border/50 pb-1.5' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-txt-primary truncate mr-2" title={activeImage.name}>{activeImage.name}</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex-shrink-0 ${isRaw ? 'bg-accent/15 text-accent' : 'bg-app-panel text-txt-secondary'}`}>
          {extension}
        </span>
      </div>
      
      {!isCollapsed && (
        <>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.dimensions', 'Dimensionen')}</span>
              <p className="text-txt-primary font-medium truncate" title={dimensionsInfo?.fullSummary || '—'}>
                {dimensionsInfo ? (
                  <>
                    {dimensionsInfo.dimensions}{' '}
                    <span className="text-txt-tertiary font-normal text-[10px]">· {dimensionsInfo.megapixels}</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.size')}</span>
              <p className="text-txt-primary font-medium">{(activeImage.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>

            {/* Date Captured with Pencil icon and Manual badge */}
            <div className={hasDifferentModifiedDate ? "min-w-0" : "min-w-0 col-span-2"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.dateCaptured', 'Aufnahme')}</span>
                  {isManualDate && (
                    <span 
                      className="bg-accent/15 text-accent border border-accent/30 text-[9px] px-1 rounded cursor-help font-mono"
                      title={activeImage.original_date ? `${t('inspector.originalDate', 'Original')}: ${activeImage.original_date}` : t('inspector.manual', 'Manuell')}
                    >
                      {t('inspector.manual', 'Manuell')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditingDate) {
                      setIsEditingDate(false);
                    } else {
                      startEditingDate();
                    }
                  }}
                  className={`p-0.5 rounded transition-colors cursor-pointer ${
                    isEditingDate
                      ? 'text-accent bg-accent/10'
                      : 'text-txt-tertiary hover:text-txt-primary hover:bg-app-hover'
                  }`}
                  title={t('inspector.editDate', 'Aufnahmedatum bearbeiten')}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>

              {!isEditingDate && (
                <p className="text-txt-primary font-medium truncate select-text" title={captureDateTitle}>
                  {formattedCaptureDate || '—'}
                </p>
              )}
            </div>

            {hasDifferentModifiedDate && (
              <div className="min-w-0">
                <span className="text-txt-tertiary block text-[10px]">{t('inspector.dateModified', 'Geändert')}</span>
                <p className="text-txt-primary font-medium truncate text-amber-300/90 select-text" title={formattedModifiedDate || '—'}>
                  {formattedModifiedDate || '—'}
                </p>
              </div>
            )}
          </div>

          {/* Inline Date Editor */}
          {isEditingDate && (
            <div className="p-2.5 bg-app-panel/60 border border-app-border rounded-lg space-y-2 mt-1">
              {/* Mode switch pills */}
              <div className="flex items-center gap-1 p-0.5 bg-app-card border border-app-border/80 rounded-md">
                <button
                  type="button"
                  onClick={() => setDateMode('set')}
                  className={`flex-1 flex items-center justify-center gap-1 py-0.5 text-[10px] rounded font-medium transition-colors cursor-pointer ${
                    dateMode === 'set'
                      ? 'bg-accent text-app-deepest shadow-sm'
                      : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>{t('inspector.modeSetDate', 'Datum setzen (Scan)')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode('shift')}
                  className={`flex-1 flex items-center justify-center gap-1 py-0.5 text-[10px] rounded font-medium transition-colors cursor-pointer ${
                    dateMode === 'shift'
                      ? 'bg-accent text-app-deepest shadow-sm'
                      : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>{t('inspector.modeTimeShift', 'Zeitversatz (±)')}</span>
                </button>
              </div>

              {/* Mode 1: Set Date */}
              {dateMode === 'set' && (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    placeholder={t('inspector.dateInputPlaceholder', 'YYYY-MM-DD HH:MM:SS (oder YYYY-MM / YYYY)')}
                    className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] font-mono placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Mode 2: Time Shift */}
              {dateMode === 'shift' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    {/* Direction Toggle */}
                    <button
                      type="button"
                      onClick={() => setShiftDirection(prev => prev === '+' ? '-' : '+')}
                      className={`w-7 py-1 text-center font-mono font-bold text-xs rounded border cursor-pointer transition-colors ${
                        shiftDirection === '+' 
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                          : 'bg-red-500/15 border-red-500/30 text-red-400'
                      }`}
                    >
                      {shiftDirection}
                    </button>

                    {/* Hours */}
                    <div className="flex-1 min-w-0">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="999"
                          value={shiftHours}
                          onChange={(e) => setShiftHours(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-1.5 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] font-mono text-center focus:outline-none focus:border-accent"
                        />
                        <span className="absolute right-1 top-1 text-[9px] text-txt-tertiary pointer-events-none">h</span>
                      </div>
                    </div>

                    {/* Minutes */}
                    <div className="flex-1 min-w-0">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={shiftMinutes}
                          onChange={(e) => setShiftMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-full px-1.5 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] font-mono text-center focus:outline-none focus:border-accent"
                        />
                        <span className="absolute right-1 top-1 text-[9px] text-txt-tertiary pointer-events-none">m</span>
                      </div>
                    </div>

                    {/* Seconds */}
                    <div className="flex-1 min-w-0">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={shiftSeconds}
                          onChange={(e) => setShiftSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-full px-1.5 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] font-mono text-center focus:outline-none focus:border-accent"
                        />
                        <span className="absolute right-1 top-1 text-[9px] text-txt-tertiary pointer-events-none">s</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Batch count indicator */}
              {allTargetPaths.length > 1 && (
                <div className="text-[10px] text-accent/90 bg-accent/10 border border-accent/20 rounded-md px-2 py-0.5 flex items-center gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  <span>{t('inspector.dateBatchBadge', { count: allTargetPaths.length })}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-1 border-t border-app-border/40">
                <div>
                  {isManualDate && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleResetDate}
                      className="flex items-center gap-1 text-[10px] text-txt-secondary hover:text-red-400 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                      title={t('inspector.resetToOriginal', 'Auf Original zurücksetzen')}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t('inspector.resetToOriginal', 'Zurücksetzen')}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsEditingDate(false)}
                    className="px-2 py-0.5 text-[10px] text-txt-secondary hover:text-txt-primary hover:bg-app-hover rounded transition-colors cursor-pointer"
                  >
                    {t('common.cancel', 'Abbrechen')}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveDate}
                    className="px-2.5 py-0.5 text-[10px] font-medium bg-accent hover:bg-accent-hover text-app-deepest disabled:opacity-40 rounded shadow transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>{t('common.save', 'Speichern')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Folder Mismatch & 1-Click Relocate Button */}
          {folderMismatch && !isEditingDate && (
            <div className="pt-1.5 border-t border-app-border/40">
              <button
                type="button"
                disabled={isRelocating}
                onClick={handleRelocate}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-[11px] font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title={t('inspector.relocateTooltip', 'Verschiebt die ausgewählte(n) Datei(en) in den passenden Datums-Ordner des Archivs')}
              >
                <FolderSync className={`w-3.5 h-3.5 flex-shrink-0 ${isRelocating ? 'animate-spin' : ''}`} />
                <span className="truncate">{t('inspector.relocateToDateFolder', 'In passenden Datums-Ordner verschieben')}</span>
              </button>
            </div>
          )}

          <div className="pt-1 border-t border-app-border/40">
            <span className="text-txt-tertiary block text-[10px]">{t('inspector.path')}</span>
            <p className="text-txt-secondary font-mono text-[10px] truncate select-text" title={activeImage.path}>
              {activeImage.path}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
