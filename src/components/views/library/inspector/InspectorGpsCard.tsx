import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  ChevronDown, ChevronRight, MapPin, ExternalLink, Pencil, 
  X, CheckCircle2, AlertTriangle, Info, Trash2, Check 
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LibraryImage, useLibraryStore } from "../../../../stores/libraryStore";
import { useSettingsStore } from "../../../../stores/settingsStore";
import { useToastStore } from "../../../../stores/toastStore";
import { parseCoordinates, formatDms, formatDd, ParseGpsResult } from "../../../../utils/geo";

interface InspectorGpsCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function InspectorGpsCard({
  activeImage,
  isCollapsed,
  onToggle,
}: InspectorGpsCardProps) {
  const { t } = useTranslation('library');
  const { selectedPaths, updateBatchGps } = useLibraryStore();
  const gpsMapProvider = useSettingsStore((s) => s.gpsMapProvider);

  const [isEditingGps, setIsEditingGps] = useState(false);
  const [gpsInputValue, setGpsInputValue] = useState('');

  const gpsParseResult: ParseGpsResult = useMemo(() => {
    if (!gpsInputValue.trim()) {
      return { success: false };
    }
    return parseCoordinates(gpsInputValue);
  }, [gpsInputValue]);

  useEffect(() => {
    setIsEditingGps(false);
    setGpsInputValue('');
  }, [activeImage.path]);

  const handleSaveGps = async () => {
    if (!gpsParseResult.success || !gpsParseResult.coords) return;
    const { latitude, longitude, altitude } = gpsParseResult.coords;

    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    updateBatchGps(pathsToUpdate, { latitude, longitude, altitude });
    setIsEditingGps(false);
    setGpsInputValue('');

    try {
      const res = await invoke<{ total: number; succeeded: number; failed: number }>('set_gps_batch', {
        paths: pathsToUpdate,
        latitude,
        longitude,
        altitude: altitude ?? null,
      });
      if (res && res.failed > 0) {
        useToastStore.getState().showWarning(
          t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
          t('inspector.gpsSaveFailed')
        );
      } else {
        useToastStore.getState().showSuccess(
          t('inspector.gpsAppliedToast', { count: pathsToUpdate.length }),
          t('inspector.location')
        );
      }
    } catch (err) {
      console.error('Failed to save GPS coordinates:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.gpsSaveFailed')
      );
    }
  };

  const handleClearGps = async () => {
    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    updateBatchGps(pathsToUpdate, { latitude: null, longitude: null, altitude: null });
    setIsEditingGps(false);
    setGpsInputValue('');

    try {
      const res = await invoke<{ total: number; succeeded: number; failed: number }>('set_gps_batch', {
        paths: pathsToUpdate,
        latitude: null,
        longitude: null,
        altitude: null,
      });
      if (res && res.failed > 0) {
        useToastStore.getState().showWarning(
          t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
          t('inspector.gpsSaveFailed')
        );
      } else {
        useToastStore.getState().showSuccess(
          t('inspector.gpsRemovedToast', { count: pathsToUpdate.length }),
          t('inspector.location')
        );
      }
    } catch (err) {
      console.error('Failed to clear GPS coordinates:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.gpsSaveFailed')
      );
    }
  };

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          )}
          <MapPin className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider group-hover:text-txt-secondary transition-colors">
            {t('inspector.location')}
          </h3>
        </div>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {activeImage.latitude != null && activeImage.longitude != null && !isEditingGps && (
            <button
              onClick={() => {
                const lat = activeImage.latitude!;
                const lon = activeImage.longitude!;
                const url = gpsMapProvider === 'osm'
                  ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
                  : `https://www.google.com/maps?q=${lat},${lon}`;
                openUrl(url).catch(console.error);
              }}
              className="flex items-center gap-1 text-[10px] text-accent hover:underline hover:text-accent/80 transition-colors mr-1"
              title={gpsMapProvider === 'osm' ? 'OpenStreetMap' : 'Google Maps'}
            >
              <span>{t('inspector.openInMaps')}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
          {!isEditingGps && (
            <button
              onClick={() => {
                if (isCollapsed) {
                  onToggle();
                }
                setIsEditingGps(true);
                if (activeImage.latitude != null && activeImage.longitude != null) {
                  setGpsInputValue(`${activeImage.latitude.toFixed(6)}, ${activeImage.longitude.toFixed(6)}`);
                } else {
                  setGpsInputValue('');
                }
              }}
              className="p-1 text-txt-tertiary hover:text-txt-primary hover:bg-app-hover rounded transition-colors"
              title={activeImage.latitude != null ? t('inspector.editGps') : t('inspector.addGps')}
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          {isEditingGps ? (
            <div className="space-y-2.5 pt-1">
              <div className="space-y-1">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    autoFocus
                    value={gpsInputValue}
                    onChange={(e) => setGpsInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && gpsParseResult.success) {
                        e.preventDefault();
                        handleSaveGps();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsEditingGps(false);
                        setGpsInputValue('');
                      }
                    }}
                    placeholder={t('inspector.gpsInputPlaceholder')}
                    className="w-full bg-app-deepest border border-app-border focus:border-accent rounded-lg px-2.5 py-1.5 text-xs text-txt-primary placeholder:text-txt-tertiary font-mono focus:outline-none transition-colors pr-7"
                  />
                  {gpsInputValue && (
                    <button
                      type="button"
                      onClick={() => setGpsInputValue('')}
                      className="absolute right-2 text-txt-tertiary hover:text-txt-primary p-0.5 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Live Parser Feedback */}
                {gpsInputValue.trim().length === 0 ? (
                  <p className="text-[10px] text-txt-tertiary px-0.5 leading-relaxed">
                    {t('inspector.gpsInputHint')}
                  </p>
                ) : gpsParseResult.success && gpsParseResult.coords ? (
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                      <span>{gpsParseResult.coords.formattedDms}</span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400/80 pl-5">
                      ({gpsParseResult.coords.formattedDd})
                    </div>
                  </div>
                ) : (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 flex items-start gap-1.5 text-[10px]">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{gpsParseResult.error || 'Ungültiges Format.'}</span>
                  </div>
                )}
              </div>

              {/* Batch notification if multiple photos selected */}
              {selectedPaths.size > 1 && (
                <div className="text-[10px] text-accent/90 bg-accent/10 border border-accent/20 rounded-md px-2 py-1 flex items-center gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  <span>{t('inspector.gpsBatchBadge', { count: selectedPaths.size })}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  {activeImage.latitude != null && (
                    <button
                      type="button"
                      onClick={handleClearGps}
                      className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
                      title={t('inspector.removeGps')}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('inspector.removeGps')}</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingGps(false);
                      setGpsInputValue('');
                    }}
                    className="px-2.5 py-1 text-[11px] text-txt-secondary hover:text-txt-primary hover:bg-app-hover rounded-md transition-colors"
                  >
                    {t('inspector.gpsCancel')}
                  </button>
                  <button
                    type="button"
                    disabled={!gpsParseResult.success}
                    onClick={handleSaveGps}
                    className="px-3 py-1 text-[11px] font-medium bg-accent hover:bg-accent-hover text-app-deepest disabled:opacity-40 disabled:cursor-not-allowed rounded-md shadow transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>{t('inspector.gpsApply')}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeImage.latitude != null && activeImage.longitude != null ? (
                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.coordinates')}</span>
                    <p className="text-txt-primary font-mono text-[11px] font-medium select-text">
                      {formatDms(activeImage.latitude, activeImage.longitude)}
                    </p>
                    <p className="text-txt-tertiary font-mono text-[10px] select-text">
                      {formatDd(activeImage.latitude, activeImage.longitude)}
                    </p>
                  </div>
                  {activeImage.altitude != null && (
                    <div className="pt-1 border-t border-app-border/40 flex justify-between items-center">
                      <span className="text-txt-tertiary text-[10px]">{t('inspector.altitude')}</span>
                      <span className="text-txt-primary font-mono font-medium text-[11px]">
                        {Math.round(activeImage.altitude)} m
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-txt-tertiary">
                  <span>{t('inspector.noGps')}</span>
                  <button
                    onClick={() => {
                      setIsEditingGps(true);
                      setGpsInputValue('');
                    }}
                    className="text-[10px] text-accent hover:underline hover:text-accent/80 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    <span>{t('inspector.addGps')}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
