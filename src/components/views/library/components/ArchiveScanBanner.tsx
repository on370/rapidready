import { Loader2, Pause, Play, X, RotateCw, Folder, Check, Zap, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '../../../../stores/libraryStore';
import { useThroughput, ThroughputStats } from '../../../../utils/throughput';

interface ScanStatsCardProps {
  label: string;
  labelClassName?: string;
  sizeMb: string | null;
  throughput: ThroughputStats;
  scanState: string;
  formattedCount: string;
}

function ScanStatsCard({
  label,
  labelClassName = "font-medium text-txt-primary flex-shrink-0 whitespace-nowrap",
  sizeMb,
  throughput,
  scanState,
  formattedCount,
}: ScanStatsCardProps) {
  const { t } = useTranslation('library');

  return (
    <div className="relative group/speed flex items-center gap-1.5 cursor-help min-w-0">
      <span className={`${labelClassName} transition-colors group-hover/speed:text-white`}>
        {label}
      </span>

      {sizeMb && (
        <span className="text-txt-tertiary font-mono text-[11px] tabular-nums flex-shrink-0 group-hover/speed:text-accent transition-colors underline decoration-dotted decoration-white/25 underline-offset-2">
          ({sizeMb} MB)
        </span>
      )}

      <span className="flex items-center text-txt-tertiary/70 group-hover/speed:text-accent transition-colors">
        <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
      </span>

      {/* Rich Glassmorphism Floating Speed Card on Hover (no native delayed title) */}
      <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/speed:opacity-100 group-hover/speed:pointer-events-auto transition-all duration-150 z-50">
        <div className="bg-[#18181b]/95 backdrop-blur-md border border-white/15 shadow-2xl rounded-xl p-2.5 w-60 text-txt-primary select-none flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold border-b border-white/10 pb-1.5 text-txt-secondary">
            <span className="flex items-center gap-1.5 text-accent">
              <Zap className="w-3.5 h-3.5 text-accent" />
              {t('loading.transferSpeedTitle', 'Übertragungsrate')}
            </span>
            <span className="text-[10px] font-mono text-txt-tertiary">
              {scanState === 'scanning' ? t('loading.live', 'Live') : scanState === 'paused' ? t('loading.paused', 'Pausiert') : t('loading.done', 'Fertig')}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-0.5">
            <span className="text-xs text-txt-secondary">{t('loading.speed', 'Geschwindigkeit')}:</span>
            <div className="text-right">
              <span className="font-mono font-bold text-accent text-xs tabular-nums">{throughput.formattedSpeed}</span>
              <span className="font-mono text-[10px] text-txt-tertiary ml-1.5 tabular-nums">({throughput.formattedBitrate})</span>
            </div>
          </div>

          {throughput.peakBytesPerSecond > 0 && (
            <div className="flex items-baseline justify-between text-[11px] text-txt-tertiary pt-0.5 border-t border-white/5">
              <span>{t('loading.peakSpeed', 'Spitzenwert')}:</span>
              <div className="text-right font-mono text-[10px] tabular-nums text-txt-secondary">
                <span>{throughput.formattedPeakSpeed}</span>
                <span className="text-txt-tertiary ml-1">({throughput.formattedPeakBitrate})</span>
              </div>
            </div>
          )}

          <div className="flex items-baseline justify-between text-[10px] text-txt-tertiary pt-0.5 border-t border-white/5">
            <span>{t('loading.dataVolume', 'Datenvolumen')}:</span>
            <span className="font-mono tabular-nums">{sizeMb ? `${sizeMb} MB` : ''} ({formattedCount} Fotos)</span>
          </div>
        </div>
        {/* Tooltip triangle beak */}
        <div className="w-2 h-2 bg-[#18181b] border-b border-r border-white/15 rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

interface ArchiveScanBannerProps {
  onRestartScan?: () => void;
}

export function ArchiveScanBanner({ onRestartScan }: ArchiveScanBannerProps) {
  const { t } = useTranslation('library');
  const scanState = useLibraryStore((s) => s.scanState);
  const scanProgress = useLibraryStore((s) => s.scanProgress);
  const activeScanId = useLibraryStore((s) => s.activeScanId);
  const images = useLibraryStore((s) => s.images);
  const rootPath = useLibraryStore((s) => s.rootPath);
  const viewMode = useLibraryStore((s) => s.viewMode);
  const pauseScan = useLibraryStore((s) => s.pauseScan);
  const resumeScan = useLibraryStore((s) => s.resumeScan);
  const cancelScan = useLibraryStore((s) => s.cancelScan);
  const setScanState = useLibraryStore((s) => s.setScanState);
  const loadArchive = useLibraryStore((s) => s.loadArchive);

  const throughput = useThroughput(
    scanProgress?.total_bytes ?? 0,
    scanState === 'scanning',
    activeScanId ?? undefined
  );

  // Only show banner if there are images in the grid and a scan is active, paused, stopped, or completed
  if (images.length === 0 || scanState === 'idle') return null;

  const filesCount = scanProgress?.files_found ?? images.length;
  const formattedCount = filesCount.toLocaleString();
  const sizeMb = scanProgress?.total_bytes ? (scanProgress.total_bytes / (1024 * 1024)).toFixed(1) : null;
  const currentDir = scanProgress?.current_dir || '';
  const shortDir = currentDir ? currentDir.split('/').slice(-2).join('/') : '';

  const handleRestart = onRestartScan || (() => {
    if (rootPath) {
      loadArchive(rootPath, true);
    }
  });

  const bottomClass = viewMode === 'loupe' ? 'bottom-28' : 'bottom-4';

  return (
    <div className={`absolute ${bottomClass} left-4 right-4 z-40 flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150`}>
      <div className="pointer-events-auto flex items-center h-10 w-[640px] max-w-full px-3.5 rounded-2xl bg-[#18181b]/95 backdrop-blur-md border border-white/10 shadow-2xl text-xs select-none">
        {scanState === 'scanning' && (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />
              <ScanStatsCard
                label={t('loading.scanningCount', { count: formattedCount, defaultValue: `Indexiere... ${formattedCount} Fotos` })}
                labelClassName="font-medium text-txt-primary flex-shrink-0 whitespace-nowrap"
                sizeMb={sizeMb}
                throughput={throughput}
                scanState={scanState}
                formattedCount={formattedCount}
              />
              {shortDir && (
                <div className="hidden sm:flex items-center gap-1 text-txt-tertiary min-w-0 flex-1 truncate border-l border-white/10 pl-2.5 ml-1" title={currentDir}>
                  <Folder className="w-3 h-3 flex-shrink-0 opacity-60" />
                  <span className="truncate font-mono text-[10px]">{shortDir}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-white/10 pl-2.5">
              <button
                onClick={pauseScan}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
                title={t('loading.pauseTooltip', 'Scan vorübergehend anhalten')}
              >
                <Pause className="w-3 h-3 flex-shrink-0" />
                <span>{t('loading.pause', 'Pausieren')}</span>
              </button>
              <button
                onClick={cancelScan}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-white/5 hover:bg-danger/20 hover:text-danger text-txt-secondary transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
                title={t('loading.cancelTooltip', 'Scan abbrechen')}
              >
                <X className="w-3 h-3 flex-shrink-0" />
                <span>{t('loading.cancel', 'Abbrechen')}</span>
              </button>
            </div>
          </>
        )}

        {scanState === 'paused' && (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <Pause className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <ScanStatsCard
                label={t('loading.pausedCount', { count: formattedCount, defaultValue: `Indexierung pausiert (${formattedCount} Fotos)` })}
                labelClassName="font-medium text-amber-300 flex-shrink-0 whitespace-nowrap"
                sizeMb={sizeMb}
                throughput={throughput}
                scanState={scanState}
                formattedCount={formattedCount}
              />
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
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <span className="w-2 h-2 rounded-full bg-amber-400/80 flex-shrink-0 ml-0.5" />
              <span className="text-txt-secondary flex-shrink-0 whitespace-nowrap">
                {t('loading.stoppedCount', { count: formattedCount, defaultValue: `Scan bei ${formattedCount} Fotos gestoppt` })}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-white/10 pl-2.5">
              <button
                onClick={handleRestart}
                className="h-7 flex items-center gap-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-accent transition-colors cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap"
              >
                <RotateCw className="w-3 h-3 flex-shrink-0" />
                <span>{t('loading.continueRest', 'Restliche Fotos laden')}</span>
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
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <ScanStatsCard
              label={t('loading.completedCount', { count: formattedCount, defaultValue: `${formattedCount} Fotos indexiert` })}
              labelClassName="font-medium text-emerald-300 flex-shrink-0 whitespace-nowrap"
              sizeMb={sizeMb}
              throughput={throughput}
              scanState={scanState}
              formattedCount={formattedCount}
            />
          </div>
        )}
      </div>
    </div>
  );
}
