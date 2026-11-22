import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, ScanEye, Check, Camera, Info, Film, BarChart2, ExternalLink } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { LibraryImage } from "../../../../stores/libraryStore";
import { useLibraryUIStore } from "../../../../stores/libraryUIStore";
import { getRrImageUrl } from "../../../../utils/image";
import { FocusPeakingOverlay } from "../components/FocusPeakingOverlay";
import { InspectorHistogram } from "../components/InspectorHistogram";

interface InspectorPreviewCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
  extension: string;
  isVideo: boolean;
  isRaw: boolean;
}

export function InspectorPreviewCard({
  activeImage,
  isCollapsed,
  onToggle,
  extension,
  isVideo,
  isRaw,
}: InspectorPreviewCardProps) {
  const { t } = useTranslation('library');
  const { 
    focusPeakingEnabled, 
    toggleFocusPeaking, 
    inspectorHistogramMode, 
    cycleInspectorHistogramMode 
  } = useLibraryUIStore();
  const inspectorImageRef = useRef<HTMLImageElement | null>(null);
  const inspectorContainerRef = useRef<HTMLDivElement | null>(null);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
  const [imageLoadTick, setImageLoadTick] = useState(0);

  const previewUrl = getRrImageUrl(
    activeImage.path,
    false,
    activeImage.culling?.orientation,
    1,
    activeImage.size,
    activeImage.mtime
  );

  useEffect(() => {
    setLoadFailed(false);
  }, [activeImage.path]);

  const triggerUpdate = `${previewUrl}|${imageLoadTick}`;

  return (
    <div className="space-y-2">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between cursor-pointer select-none group px-0.5"
      >
        <div className="flex items-center gap-1.5">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          )}
          <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider group-hover:text-txt-secondary transition-colors">
            {t('inspector.preview', 'Vorschau')}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {!isCollapsed && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFocusPeaking();
                }}
                className={`p-1 rounded transition-all cursor-pointer ${
                  focusPeakingEnabled 
                    ? 'bg-accent/20 text-accent ring-1 ring-accent/40' 
                    : 'text-txt-tertiary hover:text-txt-secondary hover:bg-app-hover'
                }`}
                title={t('toolbar.focusPeakingTooltip', 'Focus Peaking (Shift+F)')}
              >
                <ScanEye className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleInspectorHistogramMode();
                }}
                className={`p-1 rounded transition-all cursor-pointer ${
                  inspectorHistogramMode !== 'off'
                    ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                    : 'text-txt-tertiary hover:text-txt-secondary hover:bg-app-hover'
                }`}
                title={t('inspector.histogramTooltip', 'Histogramm umschalten: Aus / Overlay / Vollbild (H)')}
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {isCollapsed && (
            <span className="text-[10px] text-txt-tertiary font-mono">
              {extension} · {(activeImage.size / (1024 * 1024)).toFixed(1)} MB
            </span>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div 
            ref={inspectorContainerRef}
            className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border border-app-border bg-app-deepest group"
          >
            {loadFailed && (isVideo || activeImage.is_video) ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-3 gap-1.5 select-none">
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-txt-tertiary shadow-sm">
                  <Film className="w-4 h-4 text-txt-secondary" />
                </div>
                <div className="flex items-center justify-center gap-1.5 max-w-[92%]">
                  <span className="font-mono text-[11px] text-txt-primary truncate" title={activeImage.name}>
                    {activeImage.name}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-white/10 text-white/90 border border-white/15 shrink-0">
                    {extension.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 max-w-[92%]">
                  <p className="text-[11px] font-semibold text-txt-primary leading-tight">
                    {t('inspector.videoPreviewUnavailable', 'Keine Vorschau für dieses Videoformat')}
                  </p>
                  <p className="text-[10px] text-txt-secondary leading-snug">
                    {t('inspector.videoPreviewUnavailableHint', 'Das Betriebssystem kann dieses Format nicht dekodieren. Die Datei bleibt unverändert.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await openPath(activeImage.path);
                    } catch {
                      await invoke('show_in_finder', { path: activeImage.path });
                    }
                  }}
                  className="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white/90 hover:text-white text-[11px] font-medium border border-white/15 shadow-xs transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3 text-accent" />
                  <span>{t('inspector.openExternalPlayer', 'Im externen Player öffnen')}</span>
                </button>
              </div>
            ) : (
              <>
                <img 
                  key={activeImage.path}
                  ref={inspectorImageRef}
                  src={previewUrl} 
                  alt={activeImage.name} 
                  crossOrigin="anonymous"
                  onLoad={() => {
                    setLoadFailed(false);
                    setImageLoadTick((n) => n + 1);
                  }}
                  onError={() => setLoadFailed(true)}
                  className={`absolute inset-0 w-full h-full object-contain ${inspectorHistogramMode === 'full' ? 'opacity-0 pointer-events-none' : ''}`} 
                />
                {inspectorHistogramMode !== 'full' && (
                  <FocusPeakingOverlay 
                    imageRef={inspectorImageRef}
                    containerRef={inspectorContainerRef}
                    triggerUpdate={triggerUpdate}
                  />
                )}
                {inspectorHistogramMode === 'overlay' && (
                  <InspectorHistogram
                    imageRef={inspectorImageRef}
                    triggerUpdate={triggerUpdate}
                    mode="overlay"
                    hasFlag={activeImage.culling.flag === 1 || activeImage.culling.flag === -1}
                  />
                )}
                {inspectorHistogramMode === 'full' && (
                  <InspectorHistogram
                    imageRef={inspectorImageRef}
                    triggerUpdate={triggerUpdate}
                    mode="full"
                  />
                )}
              </>
            )}
            {inspectorHistogramMode !== 'full' && activeImage.culling.flag === -1 && (
              <div className="absolute inset-0 bg-danger/25 pointer-events-none z-10" />
            )}
            {inspectorHistogramMode !== 'full' && (
              <div className="absolute top-2 right-2 flex gap-1.5 z-30">
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
            )}
            {inspectorHistogramMode !== 'full' && !(loadFailed && (isVideo || activeImage.is_video)) && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm border border-white/15 shadow-sm px-2 py-0.5 rounded text-[11px] font-mono text-white z-20">
                {isVideo ? (
                  <span className="text-accent font-semibold flex items-center gap-1">
                    <Film className="w-2.5 h-2.5" />
                    {extension}
                  </span>
                ) : (
                  <span className={isRaw ? "text-accent font-semibold" : "text-white/95 font-semibold"}>{extension}</span>
                )}
                <span className="text-white/40">·</span>
                <span>{(activeImage.size / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            )}
            {inspectorHistogramMode !== 'full' && !(loadFailed && (isVideo || activeImage.is_video)) && (
              <>
                {isRaw && activeImage.is_monochrome_sensor ? (
                  <div
                    className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm shadow-sm flex items-center gap-1 select-none bg-black/80 border border-white/15 text-white/85"
                    title={t('inspector.monoSensorTooltip', 'Hardware-Monochromsensor. Das RAW enthält native Schwarz-Weiß-Sensordaten ohne Farbfilter.')}
                  >
                    <Camera className="w-2.5 h-2.5 text-white/80 shrink-0" />
                    <span>{t('inspector.badgeMonoSensor')}</span>
                  </div>
                ) : isRaw && activeImage.is_monochrome_preview ? (
                  <div
                    className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm shadow-sm flex items-center gap-1 select-none bg-amber-950/85 border border-amber-500/40 text-amber-300"
                    title={t('inspector.bwWarningTooltip', 'Die Kamera war auf einen Schwarz-Weiß-Bildstil eingestellt. Das Vorschaubild ist monochrom, die RAW-Datei enthält jedoch die vollen Farbinformationen des Sensors.')}
                  >
                    <Info className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                    <span>{t('inspector.badgeBwPreview')}</span>
                  </div>
                ) : isRaw ? (
                  <div
                    className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm shadow-sm flex items-center gap-1 select-none bg-black/80 border border-white/15 text-white/75"
                    title={t('inspector.inCameraPreviewTooltip', 'Eingebettete Kamera-Vorschau (Farbe & Belichtung können vom RAW-Entwickler abweichen).')}
                  >
                    <span>{t('inspector.badgeJpgPreview')}</span>
                  </div>
                ) : isVideo ? (
                  <div
                    className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm shadow-sm flex items-center gap-1 select-none bg-black/80 border border-accent/30 text-accent"
                    title={t('inspector.videoMediaDesc', 'Native Vorschau-Keyframe')}
                  >
                    <span>{t('inspector.badgeVideoKeyframe')}</span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
