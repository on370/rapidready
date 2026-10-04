import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Film, Info, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LibraryImage, useLibraryStore } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { ZoomableImage } from '../ZoomableImage';
import { FilmstripBar } from './FilmstripBar';
import { getRrImageUrl, isRawFilename, isVideoFilename } from '../../../../utils/image';

export interface LoupeViewerProps {
  activeImage: LibraryImage | undefined;
  activeImageIndex: number;
  displayedImages: LibraryImage[];
  selectedPaths: Set<string>;
  setActiveImageIndex: (index: number) => void;
  setSelectedPaths: (paths: Set<string>) => void;
  onItemClick: (e: React.MouseEvent, index: number, img: LibraryImage) => void;
  onContextMenu: (e: React.MouseEvent, path: string, index: number) => void;
}

export const LoupeViewer = React.memo(function LoupeViewer({
  activeImage,
  activeImageIndex,
  displayedImages,
  selectedPaths,
  setActiveImageIndex,
  setSelectedPaths,
  onItemClick,
  onContextMenu,
}: LoupeViewerProps) {
  const { t } = useTranslation('library');
  const showFilmstrip = useLibraryUIStore((s) => s.showFilmstrip);
  const setShowFilmstrip = useLibraryUIStore((s) => s.setShowFilmstrip);
  const loupeScale = useLibraryUIStore((s) => s.loupeScale);
  const scanState = useLibraryStore((s) => s.scanState);
  const isZoomed = loupeScale > 0;

  const [leftCount, setLeftCount] = useState<number>(0);
  const [rightCount, setRightCount] = useState<number>(0);

  const [debouncedActiveIndex, setDebouncedActiveIndex] = useState(activeImageIndex);
  const prevActiveIndexRef = useRef(activeImageIndex);
  const directionRef = useRef<'next' | 'prev'>('next');
  const warmupTokenRef = useRef<number>(0);

  // Listen for background warmup progress events from Rust
  useEffect(() => {
    const unlistenPromise = listen<{
      token: number;
      tag: string;
      current: number;
      total: number;
    }>('warmup-progress', (event) => {
      if (event.payload.token !== warmupTokenRef.current) return;
      if (event.payload.tag === 'loupe-left') {
        setLeftCount(event.payload.current);
      } else if (event.payload.tag === 'loupe-right') {
        setRightCount(event.payload.current);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Track flip direction (prev vs next) and preempt any active warmup on immediate movement
  useEffect(() => {
    if (activeImageIndex > prevActiveIndexRef.current) {
      directionRef.current = 'next';
    } else if (activeImageIndex < prevActiveIndexRef.current) {
      directionRef.current = 'prev';
    }
    prevActiveIndexRef.current = activeImageIndex;

    // Immediately preempt running warmup job in Rust and clear buffer counts
    warmupTokenRef.current = Date.now();
    invoke('cancel_warmup_cache').catch(() => {});
    setLeftCount(0);
    setRightCount(0);
  }, [activeImageIndex]);

  // Debounce preloading slightly (120ms) so rapid key repeat skips intermediate frames,
  // but normal human culling rhythm (~300-800ms) preloads immediately into RAM cache
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedActiveIndex(activeImageIndex);
    }, 120);
    return () => clearTimeout(timer);
  }, [activeImageIndex]);

  // Sprint 1: Directional RAM Viewport Caching in Loupe View
  // Proactively preloads +3 to +5 images (Scale 2 and Full-Res Embedded Preview) directly in Rust background thread
  useEffect(() => {
    // Absoluter Schutz: Niemals spekulatives Warmup während eines aktiven Scans!
    if (debouncedActiveIndex !== activeImageIndex || displayedImages.length === 0 || scanState === 'scanning' || scanState === 'connecting') return;

    const token = Date.now();
    warmupTokenRef.current = token;

    const isNext = directionRef.current === 'next';
    const leftPaths: string[] = [];
    const rightPaths: string[] = [];

    if (isNext) {
      // Look ahead +1 to +5 in forward direction
      for (let offset = 1; offset <= 5; offset++) {
        const idx = activeImageIndex + offset;
        if (idx < displayedImages.length) {
          rightPaths.push(displayedImages[idx].path);
        }
      }
      // Backward buffer of 1 image
      if (activeImageIndex > 0) {
        leftPaths.push(displayedImages[activeImageIndex - 1].path);
      }
    } else {
      // Look ahead -1 to -5 in backward direction
      for (let offset = 1; offset <= 5; offset++) {
        const idx = activeImageIndex - offset;
        if (idx >= 0) {
          leftPaths.push(displayedImages[idx].path);
        }
      }
      // Forward buffer of 1 image
      if (activeImageIndex < displayedImages.length - 1) {
        rightPaths.push(displayedImages[activeImageIndex + 1].path);
      }
    }

    if (leftPaths.length === 0 && rightPaths.length === 0) return;

    const primaryPaths = isNext ? rightPaths : leftPaths;

    // 1. Warm Scale 2 (720px preview) concurrently for both directions
    Promise.all([
      leftPaths.length > 0
        ? invoke('warm_thumbnail_cache', { paths: leftPaths, scale: 2, token, tag: 'loupe-left' })
        : Promise.resolve(0),
      rightPaths.length > 0
        ? invoke('warm_thumbnail_cache', { paths: rightPaths, scale: 2, token, tag: 'loupe-right' })
        : Promise.resolve(0),
    ])
      .then(() => {
        // 2. Warm Full-Res Preview (scale: 100) right after for primary direction
        if (warmupTokenRef.current === token && primaryPaths.length > 0) {
          return invoke('warm_thumbnail_cache', { paths: primaryPaths, scale: 100, token });
        }
      })
      .catch(() => {});

    return () => {
      warmupTokenRef.current = Date.now();
    };
  }, [debouncedActiveIndex, activeImageIndex, displayedImages, scanState]);

  // Lazy-load metadata for active image if needed
  useEffect(() => {
    if (!activeImage) return;
    if (activeImage.camera === undefined || activeImage.is_monochrome_preview === undefined) {
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
        latitude?: number | null;
        longitude?: number | null;
        altitude?: number | null;
      }>('get_image_metadata', { path: activeImage.path })
        .then((meta) => {
          if (isMounted && meta) {
            useLibraryStore.getState().updateImageMetadata(activeImage.path, {
              camera: meta.camera || null,
              lens: meta.lens || null,
              iso: meta.iso || null,
              aperture: meta.aperture || null,
              shutter: meta.shutter || null,
              date: meta.date || activeImage.date,
              is_raw: meta.is_raw ?? activeImage.is_raw,
              is_monochrome_sensor: meta.is_monochrome_sensor ?? false,
              is_monochrome_preview: meta.is_monochrome_preview ?? false,
              latitude: meta.latitude ?? null,
              longitude: meta.longitude ?? null,
              altitude: meta.altitude ?? null,
            });
          }
        })
        .catch(console.error);

      return () => {
        isMounted = false;
      };
    }
  }, [activeImage?.path]);

  const isVideo = activeImage ? (activeImage.is_video ?? isVideoFilename(activeImage.name)) : false;
  const isRaw = activeImage && !isVideo ? (activeImage.is_raw ?? isRawFilename(activeImage.name)) : false;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div 
        className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative"
        onContextMenu={(e) => {
          if (activeImage) {
            onContextMenu(e, activeImage.path, activeImageIndex);
          }
        }}
      >
        {activeImage ? (
          <>
            <ZoomableImage 
              src={getRrImageUrl(activeImage.path, true, activeImage.culling?.orientation)} 
              previewSrc={getRrImageUrl(activeImage.path, false, activeImage.culling?.orientation, 2)}
              alt={activeImage.name} 
              onContextMenu={(e) => {
                onContextMenu(e, activeImage.path, activeImageIndex);
              }}
            />

            {/* Video Poster Frame Indicator */}
            {isVideo && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white shadow-2xl">
                <Film className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-semibold tracking-wide text-white/95">Video · Poster Frame</span>
              </div>
            )}
          </>
        ) : null}
        {activeImage?.culling.flag === -1 && <div className="absolute inset-0 bg-danger/15 pointer-events-none z-20" />}

        {/* Directional RAM Cache Buffer Bubbles */}
        {leftCount > 0 && activeImageIndex > 0 && (
          <div 
            className="absolute bottom-3 left-6 z-30 pointer-events-none flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white/90 shadow-lg select-none transition-opacity duration-200"
            title={`${leftCount} ${leftCount === 1 ? 'Bild' : 'Bilder'} im RAM-Cache`}
          >
            <span className="text-[9px] text-accent">◀</span>
            <span>{leftCount}</span>
          </div>
        )}

        {rightCount > 0 && activeImageIndex < displayedImages.length - 1 && (
          <div 
            className="absolute bottom-3 z-30 pointer-events-none flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white/90 shadow-lg select-none transition-all duration-200"
            style={{ right: isZoomed ? '11.5rem' : '1.5rem' }}
            title={`${rightCount} ${rightCount === 1 ? 'Bild' : 'Bilder'} im RAM-Cache`}
          >
            <span>{rightCount}</span>
            <span className="text-[9px] text-accent">▶</span>
          </div>
        )}
      </div>

      {/* Filmstrip Bar */}
      {showFilmstrip && (
        <FilmstripBar
          displayedImages={displayedImages}
          activeImageIndex={activeImageIndex}
          selectedPaths={selectedPaths}
          onSelect={(idx, e) => {
            if (e) {
              onItemClick(e, idx, displayedImages[idx]);
            } else {
              setActiveImageIndex(idx);
              if (displayedImages[idx]) {
                setSelectedPaths(new Set([displayedImages[idx].path]));
              }
            }
          }}
          onContextMenu={(e, path, idx) => onContextMenu(e, path, idx)}
        />
      )}

      {/* Bottom Bar: Prev/Next Buttons + Info + Filmstrip Toggle */}
      <div 
        data-tour="library-loupe"
        className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <button 
            className="p-1.5 rounded-lg hover:bg-app-hover transition-colors text-txt-secondary hover:text-txt-primary cursor-pointer" 
            onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}
            title={t('filmstrip.prevTooltip')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            className="p-1.5 rounded-lg hover:bg-app-hover transition-colors text-txt-secondary hover:text-txt-primary cursor-pointer" 
            onClick={() => setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + 1))}
            title={t('filmstrip.nextTooltip')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-txt-secondary">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-txt-primary truncate max-w-[200px]" title={activeImage?.name}>
              {activeImage?.name}
            </span>
            {activeImage && (
              isRaw ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wide bg-white/10 text-white/90 border border-white/15">
                  RAW
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-black/40 text-txt-tertiary border border-white/5">
                  JPG
                </span>
              )
            )}
          </div>

          {/* Status Badges */}
          {isRaw && (
            <>
              {activeImage?.is_monochrome_sensor ? (
                <span 
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-white/10 border border-white/15 text-white/90 font-medium"
                  title={t('inspector.monoSensorTooltip', 'Hardware-Monochromsensor. Das RAW enthält native Schwarz-Weiß-Sensordaten ohne Farbfilter.')}
                >
                  <Camera className="w-3 h-3 text-white/80" />
                  <span>{t('inspector.monoSensor', 'Monochrom-Sensor')}</span>
                </span>
              ) : activeImage?.is_monochrome_preview ? (
                <span 
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold shadow-xs"
                  title={t('inspector.bwWarningTooltip', 'Die Kamera war auf einen Schwarz-Weiß-Bildstil eingestellt. Das Vorschaubild ist monochrom, die RAW-Datei enthält jedoch die vollen Farbinformationen des Sensors.')}
                >
                  <Info className="w-3 h-3 text-amber-400" />
                  <span>{t('inspector.bwWarningTitle', 'S/W-Vorschau (RAW ist Farbe)')}</span>
                </span>
              ) : null}
            </>
          )}

          <span className="text-txt-tertiary">·</span>
          <span>{displayedImages.length > 0 ? activeImageIndex + 1 : 0} / {displayedImages.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilmstrip(!showFilmstrip)}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer border ${
              showFilmstrip 
                ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25' 
                : 'bg-app-card border-app-border text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'
            }`}
            title={t('filmstrip.toggleTooltip')}
          >
            <Film className="w-3.5 h-3.5" />
            <span className="text-[11px]">{t('filmstrip.title')}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
