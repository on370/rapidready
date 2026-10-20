import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, ScanEye, Check, Play, Camera, Info } from "lucide-react";
import { LibraryImage } from "../../../../stores/libraryStore";
import { useLibraryUIStore } from "../../../../stores/libraryUIStore";
import { getRrImageUrl } from "../../../../utils/image";
import { FocusPeakingOverlay } from "../components/FocusPeakingOverlay";

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
  const { focusPeakingEnabled, toggleFocusPeaking } = useLibraryUIStore();
  const inspectorImageRef = useRef<HTMLImageElement | null>(null);
  const inspectorContainerRef = useRef<HTMLDivElement | null>(null);
  const [inspectorPreviewSrc, setInspectorPreviewSrc] = useState<string>('');

  // Progressive preview loading: instant thumbnail + background fullres
  useEffect(() => {
    const currentPath = activeImage.path;
    const thumbUrl = getRrImageUrl(currentPath, false, activeImage.culling?.orientation, 1, activeImage.size, activeImage.mtime);
    const targetFullresUrl = getRrImageUrl(currentPath, true, activeImage.culling?.orientation, undefined, activeImage.size, activeImage.mtime);

    setInspectorPreviewSrc(thumbUrl);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = targetFullresUrl;
    img.onload = () => {
      setInspectorPreviewSrc(prev => (prev === thumbUrl ? targetFullresUrl : prev));
    };
  }, [activeImage.path, activeImage.culling?.orientation, activeImage.size, activeImage.mtime]);

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
        <div className="flex items-center gap-2">
          {!isCollapsed && (
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
              title={t('toolbar.focusPeakingTooltip', 'Focus Peaking (F)')}
            >
              <ScanEye className="w-3.5 h-3.5" />
            </button>
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
            <img 
              ref={inspectorImageRef}
              src={inspectorPreviewSrc || getRrImageUrl(activeImage.path, false, activeImage.culling?.orientation, undefined, activeImage.size, activeImage.mtime)} 
              alt={activeImage.name} 
              crossOrigin="anonymous"
              className="w-full h-full object-contain" 
            />
            <FocusPeakingOverlay 
              imageRef={inspectorImageRef}
              containerRef={inspectorContainerRef}
              triggerUpdate={inspectorPreviewSrc}
            />
            {activeImage.culling.flag === -1 && (
              <div className="absolute inset-0 bg-danger/25 pointer-events-none z-10" />
            )}
            <div className="absolute top-2 right-2 flex gap-1.5 z-20">
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
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm border border-white/15 shadow-sm px-2 py-0.5 rounded text-[11px] font-mono text-white z-20">
              {isVideo ? (
                <span className="text-accent font-semibold flex items-center gap-1">
                  <Play className="w-2.5 h-2.5 fill-accent" />
                  {extension}
                </span>
              ) : (
                <span className={isRaw ? "text-accent font-semibold" : "text-white/95 font-semibold"}>{extension}</span>
              )}
              <span className="text-white/40">·</span>
              <span>{(activeImage.size / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
          </div>

          {/* Video Media Container Badge */}
          {isVideo && (
            <div 
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-accent/10 border border-accent/30 text-xs shadow-sm"
            >
              <Play className="w-4 h-4 text-accent fill-accent flex-shrink-0" />
              <div>
                <span className="font-semibold text-accent text-[11px] block">{t('inspector.videoMedia', 'Videodatei (Container)')}</span>
                <span className="text-[10px] text-txt-secondary block leading-snug">{t('inspector.videoMediaDesc', 'Native Vorschau-Keyframe')}</span>
              </div>
            </div>
          )}

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
                  <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
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
        </>
      )}
    </div>
  );
}
