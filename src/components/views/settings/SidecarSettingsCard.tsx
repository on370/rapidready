import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  FileCode2, 
  Check, 
  RefreshCw, 
  Pause, 
  Play, 
  X, 
  ShieldCheck, 
  Info
} from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useLibraryStore } from "../../../stores/libraryStore";
import { useToastStore } from "../../../stores/toastStore";

interface SidecarSyncProgress {
  processed: number;
  total: number;
  synced_count: number;
  current_file: string;
  is_paused: boolean;
  is_cancelled: boolean;
  is_complete: boolean;
}

export function SidecarSettingsCard() {
  const { t } = useTranslation('settings');
  const { sidecarMode, setSidecarMode } = useSettingsStore();
  const images = useLibraryStore((s) => s.images);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SidecarSyncProgress | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<SidecarSyncProgress>("sidecar_sync_progress", (event) => {
      setSyncProgress(event.payload);
      if (event.payload.is_complete || event.payload.is_cancelled) {
        setIsSyncing(false);
      }
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleStartSync = async () => {
    if (images.length === 0 || isSyncing) return;
    setIsSyncing(true);
    setSyncProgress({
      processed: 0,
      total: images.length,
      synced_count: 0,
      current_file: "",
      is_paused: false,
      is_cancelled: false,
      is_complete: false,
    });

    const paths = images.map((img) => img.path);

    try {
      const result = await invoke<SidecarSyncProgress>("sync_archive_sidecars", {
        paths,
        mode: sidecarMode,
      });

      if (result.is_complete && !result.is_cancelled) {
        useToastStore.getState().showSuccess(
          t('sidecar.syncCompletedDesc', {
            synced: result.synced_count,
            total: result.total,
            defaultValue: `Abgleich abgeschlossen: ${result.synced_count} Sidecars aktualisiert (${result.total} Fotos geprüft).`,
          }),
          t('sidecar.syncCompletedTitle', { defaultValue: 'Sidecar-Abgleich fertig' })
        );
      } else if (result.is_cancelled) {
        useToastStore.getState().showWarning(
          t('sidecar.syncCancelledDesc', {
            synced: result.synced_count,
            defaultValue: `Abgleich abgebrochen. ${result.synced_count} Sidecars wurden bis zum Abbruch synchronisiert.`,
          }),
          t('sidecar.syncCancelledTitle', { defaultValue: 'Abgleich abgebrochen' })
        );
      }
    } catch (err: any) {
      console.error("Sidecar sync failed:", err);
      useToastStore.getState().showError(
        String(err),
        t('sidecar.syncErrorTitle', { defaultValue: 'Fehler beim Sidecar-Abgleich' })
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePause = () => {
    invoke("pause_sidecar_sync").catch(console.error);
    setSyncProgress((prev) => prev ? { ...prev, is_paused: true } : null);
  };

  const handleResume = () => {
    invoke("resume_sidecar_sync").catch(console.error);
    setSyncProgress((prev) => prev ? { ...prev, is_paused: false } : null);
  };

  const handleCancel = () => {
    invoke("cancel_sidecar_sync").catch(console.error);
    setIsSyncing(false);
  };

  const percent = syncProgress && syncProgress.total > 0
    ? Math.min(100, Math.round((syncProgress.processed / syncProgress.total) * 100))
    : 0;

  return (
    <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-txt-secondary" />
          <div>
            <h3 className="text-sm font-semibold text-txt-primary">
              {t('sidecar.title', 'Sidecar-Format & RAW-Entwickler-Synchronisation (.rrdata / .xmp)')}
            </h3>
            <p className="text-xs text-txt-secondary mt-0.5">
              {t('sidecar.subtitle', 'Speicherformat für Bewertungen, Farblabels, Orientierungen und GPS-Metadaten')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 3-Way Mode Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Mode 1: RapidRAW .rrdata */}
          <div
            onClick={() => setSidecarMode('rrdata')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              sidecarMode === 'rrdata'
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-app-border bg-app-deepest/50 hover:bg-app-hover'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-txt-primary flex items-center gap-1.5 font-mono">
                  RapidRAW (.rrdata)
                </span>
                {sidecarMode === 'rrdata' && (
                  <span className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                {t(
                  'sidecar.modeRrdataDesc',
                  'Standard. Schreibt blitzschnell native .rrdata JSON-Dateien. Liest .xmp automatisch als Fallback, falls nur eine XMP existiert.'
                )}
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-app-border/40 text-[10px] text-txt-tertiary font-mono">
              Write: .rrdata • Read: .rrdata ➔ .xmp
            </div>
          </div>

          {/* Mode 2: Dual-Sync */}
          <div
            onClick={() => setSidecarMode('dual')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              sidecarMode === 'dual'
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-app-border bg-app-deepest/50 hover:bg-app-hover'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-txt-primary flex items-center gap-1.5 font-mono">
                  Dual-Sync (.rrdata + .xmp)
                </span>
                {sidecarMode === 'dual' && (
                  <span className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                {t(
                  'sidecar.modeDualDesc',
                  'Hybrid. Schreibt Änderungen synchron in beide Sidecars. Perfekt für den nahtlosen Wechsel zwischen RapidRAW und Lightroom / darktable.'
                )}
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-app-border/40 text-[10px] text-txt-tertiary font-mono">
              Write: Both (.rrdata + .xmp)
            </div>
          </div>

          {/* Mode 3: Standard XMP */}
          <div
            onClick={() => setSidecarMode('xmp')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              sidecarMode === 'xmp'
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-app-border bg-app-deepest/50 hover:bg-app-hover'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-txt-primary flex items-center gap-1.5 font-mono">
                  Standard XMP (.xmp)
                </span>
                {sidecarMode === 'xmp' && (
                  <span className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                {t(
                  'sidecar.modeXmpDesc',
                  'Adobe Standard. Schreibt direkt in .xmp (und aktualisiert vorhandene .rrdata). Liest .rrdata als Fallback.'
                )}
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-app-border/40 text-[10px] text-txt-tertiary font-mono">
              Write: .xmp • Read: .xmp ➔ .rrdata
            </div>
          </div>
        </div>

        {/* Explanatory Info Box: Non-Destructive Guarantee & SSoT */}
        <div className="p-3.5 bg-app-deepest/40 border border-app-border rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-txt-primary">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{t('sidecar.guaranteeTitle', 'Non-Destructive & Single Source of Truth (SSoT)')}</span>
          </div>
          <p className="text-txt-secondary leading-relaxed text-[11px]">
            {t(
              'sidecar.guaranteeDesc',
              'Bestehende Entwicklungseinstellungen (z.B. crs:* Entwicklungsparameter aus Adobe Lightroom oder Entwicklungsverlauf aus darktable sowie RapidRAW-Anpassungen) werden niemals überschrieben. Falls für ein Foto beide Sidecar-Dateien (.rrdata und .xmp) existieren, gilt immer die Datei mit dem neuesten Dateimodifikationsdatum (mtime) als verbindliche Quelle der Wahrheit.'
            )}
          </p>
        </div>

        {/* NAS-Safe Archive Sync Action Block */}
        <div className="pt-2 border-t border-app-border/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-txt-primary">
                {t('sidecar.syncSectionTitle', 'Sidecars im aktiven Archiv synchronisieren')}
              </h4>
              <p className="text-[11px] text-txt-tertiary mt-0.5">
                {t(
                  'sidecar.syncSectionSubtitle',
                  'Gleicht vorhandene Sidecars im geladenen Ordner an den gewählten Modus an.'
                )}
              </p>
            </div>

            <button
              disabled={images.length === 0 || isSyncing}
              onClick={handleStartSync}
              className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {t('sidecar.syncButton', 'Bestehende Sidecars jetzt abgleichen (.rrdata ↔ .xmp)')}
              </span>
            </button>
          </div>

          {/* NAS / Large Archive Notice Box */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5 text-[11px] text-amber-300">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {t(
                'sidecar.nasNotice',
                'Hinweis für große Archive & NAS: Bei Archiven mit 20.000+ Fotos auf einem Netzlaufwerk (NAS/SMB) kann der Abgleich einige Minuten dauern. Es werden nur Bilder mit vorhandenen Bewertungen/Sidecars abgeglichen. Der Vorgang kann jederzeit pausiert, fortgesetzt oder abgebrochen werden.'
              )}
            </p>
          </div>

          {/* Live Progress Bar with Pause, Resume & Cancel */}
          {syncProgress && (
            <div className="p-3.5 bg-app-deepest/60 border border-app-border rounded-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-txt-primary">
                    {syncProgress.is_complete
                      ? t('sidecar.syncDone', 'Abgleich abgeschlossen')
                      : syncProgress.is_paused
                      ? t('sidecar.syncPaused', 'Pausiert')
                      : t('sidecar.syncRunning', 'Synchronisiere...')}
                  </span>
                  <span className="text-[11px] text-txt-tertiary">
                    ({syncProgress.processed} / {syncProgress.total} Fotos geprüft • {syncProgress.synced_count} Sidecars aktualisiert)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isSyncing && !syncProgress.is_paused && (
                    <button
                      onClick={handlePause}
                      className="px-2 py-1 rounded bg-app-panel hover:bg-app-hover border border-app-border text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1 cursor-pointer"
                    >
                      <Pause className="w-3 h-3" />
                      <span>{t('sidecar.pause', 'Pause')}</span>
                    </button>
                  )}

                  {isSyncing && syncProgress.is_paused && (
                    <button
                      onClick={handleResume}
                      className="px-2 py-1 rounded bg-accent/20 hover:bg-accent/30 border border-accent/40 text-xs text-accent flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <Play className="w-3 h-3" />
                      <span>{t('sidecar.resume', 'Fortsetzen')}</span>
                    </button>
                  )}

                  {isSyncing && (
                    <button
                      onClick={handleCancel}
                      className="px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 border border-danger/30 text-xs text-danger flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <X className="w-3 h-3" />
                      <span>{t('sidecar.cancel', 'Abbrechen')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-app-border/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    syncProgress.is_paused ? 'bg-amber-400' : 'bg-accent'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>

              {syncProgress.current_file && isSyncing && (
                <div className="text-[10px] text-txt-tertiary font-mono truncate">
                  {syncProgress.current_file}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
