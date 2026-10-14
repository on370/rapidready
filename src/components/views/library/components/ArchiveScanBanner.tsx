import { useState, useEffect, useRef } from 'react';
import { Loader2, Pause, Play, X, RotateCw, Folder, Check, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '../../../../stores/libraryStore';
import { useThroughput } from '../../../../utils/throughput';

interface ArchiveScanBannerProps {
  onRestartScan?: () => void;
}

interface EtaStats {
  etaText: string | null;
  itemsPerSec: number;
  mbPerSec: number;
}

function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return '00:00 min';
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(mins)}:${pad(secs)} h`;
  }
  return `${pad(mins)}:${pad(secs)} min`;
}

function useSmoothedEta(
  done: number,
  total: number,
  totalKnown: boolean,
  bytes: number,
  isScanning: boolean,
  t: (key: string, options?: any) => string,
  activeScanId?: number
): EtaStats {
  const samplesRef = useRef<Array<{ time: number; done: number; bytes: number }>>([]);
  const prevScanIdRef = useRef<number | undefined>(activeScanId);
  const [etaInfo, setEtaInfo] = useState<EtaStats>({ etaText: null, itemsPerSec: 0, mbPerSec: 0 });

  useEffect(() => {
    if (prevScanIdRef.current !== activeScanId) {
      samplesRef.current = [];
      prevScanIdRef.current = activeScanId;
      setEtaInfo({ etaText: null, itemsPerSec: 0, mbPerSec: 0 });
    }
  }, [activeScanId]);

  useEffect(() => {
    if (!isScanning) {
      return;
    }

    const now = Date.now();
    const samples = samplesRef.current;
    samples.push({ time: now, done, bytes });

    // Keep samples within a rolling 8-second window for responsive yet smoothed estimation
    while (samples.length > 0 && now - samples[0].time > 8000) {
      samples.shift();
    }

    // Require at least 1.5 seconds of sample history for an accurate rate
    const oldest = samples[0];
    const durationSec = (now - oldest.time) / 1000;

    if (durationSec >= 1.5 && samples.length >= 2) {
      const deltaDone = Math.max(0, done - oldest.done);
      const deltaBytes = Math.max(0, bytes - oldest.bytes);

      if (deltaDone > 0) {
        const itemsPerSec = deltaDone / durationSec;
        const bytesPerSec = deltaBytes / durationSec;
        const mbPerSec = bytesPerSec / (1024 * 1024);

        let etaText: string | null = null;
        if (totalKnown && total > done) {
          const remainingItems = total - done;
          const etaSeconds = remainingItems / itemsPerSec;

          if (etaSeconds < 60) {
            etaText = t('loading.etaLessThanOneMin', 'weniger als 1 Min. verbleibend');
          } else if (etaSeconds < 3600) {
            const mins = Math.ceil(etaSeconds / 60);
            etaText = t('loading.etaMinutes', { count: mins, defaultValue: `ca. ${mins} Min. verbleibend` });
          } else {
            const hours = Math.floor(etaSeconds / 3600);
            const mins = Math.round((etaSeconds % 3600) / 60);
            etaText = mins > 0
              ? t('loading.etaHoursMinutes', { hours, mins, defaultValue: `ca. ${hours} Std. ${mins} Min. verbleibend` })
              : t('loading.etaHours', { hours, defaultValue: `ca. ${hours} Std. verbleibend` });
          }
        }

        setEtaInfo({ etaText, itemsPerSec, mbPerSec });
      }
    }
  }, [done, total, totalKnown, bytes, isScanning, t]);

  return etaInfo;
}

export function ArchiveScanBanner({ onRestartScan }: ArchiveScanBannerProps) {
  const { t } = useTranslation('library');
  const scanState = useLibraryStore((s) => s.scanState);
  const scanProgress = useLibraryStore((s) => s.scanProgress);
  const activeScanId = useLibraryStore((s) => s.activeScanId);
  const images = useLibraryStore((s) => s.images);
  const rootPath = useLibraryStore((s) => s.rootPath);
  const viewMode = useLibraryStore((s) => s.viewMode);
  const scanStartTime = useLibraryStore((s) => s.scanStartTime);
  const pauseScan = useLibraryStore((s) => s.pauseScan);
  const resumeScan = useLibraryStore((s) => s.resumeScan);
  const cancelScan = useLibraryStore((s) => s.cancelScan);
  const setScanState = useLibraryStore((s) => s.setScanState);
  const loadArchive = useLibraryStore((s) => s.loadArchive);
  const startThumbnailing = useLibraryStore((s) => s.startThumbnailing);
  const reconcileArchiveDelta = useLibraryStore((s) => s.reconcileArchiveDelta);

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (scanState === 'scanning') {
      const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [scanState]);

  const phase = scanProgress?.phase || 'discovering';
  const isThumbnailing = phase === 'thumbnailing';
  const isSyncing = phase === 'syncing';

  // During discovery (Phase 1), total files is UNKNOWN until the walker finishes
  const hasKnownTotal = Boolean(scanProgress?.total_files && scanProgress.total_files > 0);
  const totalPhotos = hasKnownTotal ? (scanProgress!.total_files as number) : 0;
  const donePhotos = (isThumbnailing || isSyncing)
    ? (scanProgress?.files_found ?? 0)
    : Math.max(scanProgress?.files_found ?? 0, images.length);
  const currentBytes = scanProgress?.total_bytes ?? 0;

  const throughput = useThroughput(currentBytes, scanState === 'scanning', activeScanId ?? undefined);

  const etaInfo = useSmoothedEta(
    donePhotos,
    totalPhotos,
    hasKnownTotal,
    currentBytes,
    scanState === 'scanning',
    t,
    activeScanId ?? undefined
  );

  // Only show banner if there are images in the grid and a scan is active, paused, stopped, or completed
  if (images.length === 0 || scanState === 'idle') return null;

  const formattedDone = donePhotos.toLocaleString();
  const formattedMax = totalPhotos.toLocaleString();
  const percent = hasKnownTotal && totalPhotos > 0 ? Math.min(100, Math.round((donePhotos / totalPhotos) * 100)) : null;
  const normalizedDir = (scanProgress?.current_dir || '').replace(/\\/g, '/');
  const shortDir = normalizedDir ? normalizedDir.split('/').filter(Boolean).slice(-2).join('/') : '';

  const photosUnit = t('loading.photosUnit', 'Bilder/s');
  const photosLabel = t('loading.photos', 'Fotos');

  const elapsedSec = scanStartTime ? Math.max(0, Math.floor((currentTime - scanStartTime) / 1000)) : 0;
  const elapsedText = formatDuration(elapsedSec);
  const avgItemsPerSec = elapsedSec > 1 && donePhotos > 0 ? donePhotos / elapsedSec : 0;

  const formattedDataVolume = currentBytes > 0
    ? currentBytes >= 1024 * 1024 * 1024
      ? `${(currentBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : `${(currentBytes / (1024 * 1024)).toFixed(0)} MB`
    : null;

  let badgeText = t('initialScan.badgeScan', '⚡ Initialer Scan');
  let tooltipText = t('initialScan.tooltipScan', 'RapidReady erfasst alle Bild- und Videodateien im Archivordner. Gefundene Fotos erscheinen sofort im Grid.');

  if (isThumbnailing) {
    badgeText = t('initialScan.badgeCache', '⚡ Cache-Aufbau');
    tooltipText = t('initialScan.tooltipCache', 'RapidReady erstellt den lokalen High-Speed-Cache auf deiner SSD. Zukünftige Starts und das Scrollen im Archiv funktionieren danach selbst bei schlafendem NAS verzögerungsfrei und flüssig.');
  } else if (isSyncing) {
    badgeText = t('initialScan.badgeSync', '⚡ Archiv-Sync');
    tooltipText = t('initialScan.tooltipSync', 'RapidReady gleicht Änderungen seit dem letzten Scan mit dem schnellen lokalen Cache ab: neu hinzugefügte, geänderte oder gelöschte Fotos werden aktualisiert.');
  }

  const handleRestart = onRestartScan || (() => {
    if (rootPath) {
      loadArchive(rootPath, true);
    }
  });

  const handleContinueStopped = () => {
    if (isThumbnailing) {
      startThumbnailing(rootPath || undefined);
    } else if (isSyncing) {
      reconcileArchiveDelta(rootPath || undefined, false);
    } else {
      handleRestart();
    }
  };

  const bottomClass = viewMode === 'loupe' ? 'bottom-28' : 'bottom-4';

  const floatingCard = (
    <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/help:opacity-100 group-hover/help:pointer-events-auto transition-all duration-150 z-50">
      <div className="bg-[#18181b]/95 backdrop-blur-md border border-white/15 shadow-2xl rounded-2xl p-3 w-80 text-txt-primary select-none flex flex-col gap-2 text-xs leading-relaxed">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <span className="flex items-center gap-1.5 font-semibold text-amber-300 text-[11px]">
            <span>{badgeText}</span>
          </span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
            scanState === 'scanning' ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20' : 'bg-amber-400/10 text-amber-300 border-amber-400/20'
          }`}>
            {scanState === 'scanning' ? t('loading.live', 'Live') : scanState === 'paused' ? t('loading.paused', 'Pausiert') : t('loading.stopped', 'Gestoppt')}
          </span>
        </div>

        {/* Speed & Throughput */}
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-baseline justify-between">
            <span className="text-txt-secondary">{t('loading.speed', 'Geschwindigkeit')}:</span>
            <div className="text-right font-mono">
              <span className="font-bold text-accent tabular-nums">
                {etaInfo.itemsPerSec > 0 ? `${Math.round(etaInfo.itemsPerSec)} ${photosUnit}` : throughput.formattedSpeed}
              </span>
              {throughput.formattedSpeed !== '0 MB/s' && (
                <span className="text-txt-tertiary text-[10px] ml-1.5 tabular-nums">
                  ({throughput.formattedSpeed} · {throughput.formattedBitrate})
                </span>
              )}
            </div>
          </div>

          {avgItemsPerSec > 0 && (
            <div className="flex items-baseline justify-between text-txt-tertiary text-[10px]">
              <span>{t('loading.avgSpeed', 'Durchschnitt')}:</span>
              <span className="font-mono tabular-nums text-txt-secondary">
                {avgItemsPerSec.toFixed(1)} {photosUnit}
              </span>
            </div>
          )}

          {throughput.formattedPeakSpeed !== '0 MB/s' && (
            <div className="flex items-baseline justify-between text-txt-tertiary text-[10px]">
              <span>{t('loading.peakSpeed', 'Spitzenwert (Peak)')}:</span>
              <span className="font-mono tabular-nums text-txt-secondary">
                {throughput.formattedPeakSpeed} ({throughput.formattedPeakBitrate})
              </span>
            </div>
          )}
        </div>

        {/* Progress & Duration */}
        <div className="flex flex-col gap-1 text-[11px] border-t border-white/10 pt-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-txt-secondary">{t('loading.progress', 'Fortschritt')}:</span>
            <span className="font-mono text-txt-primary tabular-nums">
              {hasKnownTotal
                ? `${formattedDone} / ${formattedMax} ${percent !== null ? `(${percent} %)` : ''}`
                : isSyncing
                ? t('loading.syncingCount', { count: formattedDone, defaultValue: `Prüfe Änderungen... ${formattedDone} Fotos geprüft` })
                : t('loading.discoveringProgress', { count: formattedDone, defaultValue: `${formattedDone} Fotos erfasst` })}
            </span>
          </div>

          <div className="flex items-baseline justify-between text-[10px]">
            <span className="text-txt-tertiary">{t('loading.elapsed', 'Laufzeit')}:</span>
            <span className="font-mono text-txt-secondary tabular-nums">{elapsedText}</span>
          </div>

          {hasKnownTotal && etaInfo.etaText && (
            <div className="flex items-baseline justify-between text-[10px]">
              <span className="text-txt-tertiary">{t('loading.remaining', 'Verbleibend')}:</span>
              <span className="font-medium text-amber-300 tabular-nums">{etaInfo.etaText}</span>
            </div>
          )}

          {formattedDataVolume && (
            <div className="flex items-baseline justify-between text-[10px]">
              <span className="text-txt-tertiary">{t('loading.dataVolume', 'Datenvolumen')}:</span>
              <span className="font-mono text-txt-secondary tabular-nums">{formattedDataVolume}</span>
            </div>
          )}
        </div>

        {/* Explanation Footer */}
        <div className="border-t border-white/10 pt-1.5 text-txt-tertiary text-[10px] leading-tight">
          {tooltipText}
        </div>
      </div>
      <div className="w-2 h-2 bg-[#18181b] border-b border-r border-white/15 rotate-45 mx-auto -mt-1" />
    </div>
  );

  return (
    <div className={`absolute ${bottomClass} left-4 right-4 z-40 flex flex-col items-center gap-1.5 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150`}>
      <div className="pointer-events-auto flex items-center h-10 w-[820px] max-w-[calc(100vw-2rem)] px-3.5 rounded-2xl bg-[#18181b]/95 backdrop-blur-md border border-white/10 shadow-2xl text-xs select-none">
        {scanState === 'scanning' && (
          <>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <Loader2 className={`w-3.5 h-3.5 ${isThumbnailing ? 'text-amber-400' : 'text-accent'} animate-spin flex-shrink-0`} />

              {/* Dynamic Phase Pill & Stats Hover Trigger */}
              <div className="relative group/help flex items-center gap-1.5 cursor-help flex-shrink-0">
                <div className="bg-amber-400/10 text-amber-300 border border-amber-400/25 rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 whitespace-nowrap shadow-sm hover:border-amber-400/50 transition-colors">
                  <span>{badgeText}</span>
                </div>

                <span className="flex items-center text-amber-300/80 hover:text-amber-200 transition-colors">
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>

                {/* Floating Rich Speed & Performance Card */}
                {floatingCard}
              </div>

              {isThumbnailing ? (
                <>
                  {/* Phase 2: x / MAX Fotos Counter & % */}
                  <div className="flex items-baseline gap-1.5 min-w-0 flex-shrink-0">
                    <span className="font-medium text-txt-primary tabular-nums whitespace-nowrap">
                      {formattedDone} / {formattedMax} {photosLabel}
                    </span>
                    {percent !== null && (
                      <span className="text-[11px] font-mono text-amber-300/80 tabular-nums whitespace-nowrap">
                        ({percent} %)
                      </span>
                    )}
                  </div>

                  {/* ETA */}
                  {etaInfo.etaText && (
                    <div className="hidden sm:flex items-center border-l border-white/10 pl-2.5 ml-0.5 flex-shrink-0 text-[11px]">
                      <span className="text-amber-300/90 font-medium whitespace-nowrap">{etaInfo.etaText}</span>
                    </div>
                  )}

                  {/* Current Processed Folder / File */}
                  {shortDir && (
                    <div className="flex items-center gap-1.5 text-txt-tertiary min-w-0 flex-1 truncate border-l border-white/10 pl-2.5 ml-0.5" title={scanProgress?.current_dir || ''}>
                      <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-60 text-accent/80" />
                      <span className="truncate font-mono text-[10px]">{shortDir}</span>
                    </div>
                  )}
                </>
              ) : isSyncing ? (
                <>
                  {/* Sync Mode */}
                  <span className="font-medium text-txt-primary tabular-nums whitespace-nowrap flex-shrink-0">
                    {t('loading.syncingCount', { count: formattedDone, defaultValue: `Prüfe Änderungen... ${formattedDone} Fotos geprüft` })}
                  </span>

                  {/* Current Checked Folder */}
                  {shortDir && (
                    <div className="flex items-center gap-1.5 text-txt-tertiary min-w-0 flex-1 truncate border-l border-white/10 pl-2.5 ml-0.5" title={scanProgress?.current_dir || ''}>
                      <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-60 text-accent/80" />
                      <span className="truncate font-mono text-[10px]">{shortDir}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Phase 1: Dateiscan */}
                  <span className="font-medium text-txt-primary tabular-nums whitespace-nowrap flex-shrink-0">
                    {t('loading.discoveringCount', { count: formattedDone, defaultValue: `Dateiscan... ${formattedDone} Fotos erfasst` })}
                  </span>

                  {/* Current Scanned Folder */}
                  {shortDir && (
                    <div className="flex items-center gap-1.5 text-txt-tertiary min-w-0 flex-1 truncate border-l border-white/10 pl-2.5 ml-0.5" title={scanProgress?.current_dir || ''}>
                      <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-60 text-accent/80" />
                      <span className="truncate font-mono text-[10px]">{shortDir}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-white/10 pl-2.5">
              <button
                onClick={pauseScan}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
                title={isThumbnailing ? t('loading.pauseCacheTooltip', 'Cache-Aufbau vorübergehend anhalten') : t('loading.pauseTooltip', 'Scan vorübergehend anhalten')}
              >
                <Pause className="w-3 h-3 flex-shrink-0" />
                <span>{t('loading.pause', 'Pausieren')}</span>
              </button>
              <button
                onClick={cancelScan}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-white/5 hover:bg-danger/20 hover:text-danger text-txt-secondary transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
                title={isThumbnailing ? t('loading.cancelCacheTooltip', 'Cache-Aufbau abbrechen') : t('loading.cancelTooltip', 'Scan abbrechen')}
              >
                <X className="w-3 h-3 flex-shrink-0" />
                <span>{t('loading.cancel', 'Abbrechen')}</span>
              </button>
            </div>
          </>
        )}

        {scanState === 'paused' && (
          <>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <Pause className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <div className="bg-amber-400/10 text-amber-300 border border-amber-400/25 rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 whitespace-nowrap shadow-sm">
                <span>{t('loading.paused', 'Pausiert')}</span>
              </div>
              <span className="font-medium text-amber-300 tabular-nums whitespace-nowrap">
                {isThumbnailing
                  ? `${formattedDone} / ${formattedMax} ${photosLabel} (${percent ?? 0} %)`
                  : isSyncing
                  ? t('loading.syncingCount', { count: formattedDone, defaultValue: `${formattedDone} Fotos geprüft` })
                  : t('loading.discoveringPaused', { count: formattedDone, defaultValue: `Dateiscan pausiert (${formattedDone} Fotos)` })}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-white/10 pl-2.5">
              <button
                onClick={resumeScan}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent font-medium transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
                title={t('loading.resumeTooltip', 'Scan an dieser Stelle fortsetzen')}
              >
                <Play className="w-3 h-3 fill-accent flex-shrink-0" />
                <span>{t('loading.resume', 'Fortsetzen')}</span>
              </button>
              <button
                onClick={cancelScan}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-txt-tertiary hover:text-txt-secondary transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-3 h-3 flex-shrink-0" />
                <span>{t('loading.end', 'Beenden')}</span>
              </button>
            </div>
          </>
        )}

        {scanState === 'stopped' && (
          <>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <span className="w-2 h-2 rounded-full bg-amber-400/80 flex-shrink-0 ml-0.5" />
              <span className="text-txt-secondary flex-shrink-0 whitespace-nowrap">
                {isThumbnailing && totalPhotos > 0
                  ? t('loading.stoppedThumbnailCount', {
                      done: formattedDone,
                      total: formattedMax,
                      defaultValue: `Cache-Aufbau bei ${formattedDone} / ${formattedMax} Fotos gestoppt`,
                    })
                  : isSyncing
                  ? t('loading.stoppedSyncCount', {
                      count: formattedDone,
                      defaultValue: `Sync bei ${formattedDone} Fotos gestoppt`,
                    })
                  : t('loading.stoppedCount', {
                      count: formattedDone,
                      defaultValue: `Scan bei ${formattedDone} Fotos gestoppt`,
                    })}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-white/10 pl-2.5">
              <button
                onClick={handleContinueStopped}
                className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent font-medium transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap shadow-sm"
              >
                <RotateCw className="w-3 h-3 flex-shrink-0" />
                <span>
                  {isThumbnailing
                    ? t('loading.continueThumbnailing', 'Cache-Aufbau fortsetzen')
                    : isSyncing
                    ? t('scanMenu.syncArchive', 'Gesamtes Archiv synchronisieren')
                    : t('loading.continueRest', 'Restliche Fotos laden')}
                </span>
              </button>

              <button
                onClick={() => setScanState('idle')}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
                title={t('loading.dismiss', 'Ausblenden')}
              >
                <X className="w-3.5 h-3.5 flex-shrink-0" />
              </button>
            </div>
          </>
        )}

        {scanState === 'completed' && (
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="font-medium text-emerald-300 flex-shrink-0 whitespace-nowrap">
              {isSyncing
                ? t('loading.syncedCompleted', 'Archiv synchronisiert')
                : t('loading.completedCount', {
                    count: formattedMax,
                    defaultValue: `${formattedMax} Fotos indexiert`,
                  })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
