import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, Play, Pause, Repeat, Blend, Maximize, Minimize, 
  X, Film, Timer, Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openPath } from '@tauri-apps/plugin-opener';
import { LibraryImage, useLibraryStore, CullingState } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { getRrImageUrl, isVideoFilename, isRawFilename } from '../../../../utils/image';

export interface FullscreenViewerProps {
  activeImage: LibraryImage | undefined;
  activeImageIndex: number;
  displayedImages: LibraryImage[];
  selectedPaths: Set<string>;
  setActiveImageIndex: (index: number) => void;
  setSelectedPaths: (paths: Set<string>) => void;
  handleCulling?: (flag: number | null, rating: number) => void;
  handleSetColor?: (color: string | null) => void;
  handleRotate?: (direction: 'cw' | 'ccw') => void;
  onContextMenu?: (e: React.MouseEvent, path: string, index: number) => void;
}

export const FullscreenViewer = React.memo(function FullscreenViewer({
  activeImage,
  activeImageIndex,
  displayedImages,
  selectedPaths: _selectedPaths,
  setActiveImageIndex,
  setSelectedPaths,
  onContextMenu,
}: FullscreenViewerProps) {
  const { t } = useTranslation('library');
  const scanState = useLibraryStore((s) => s.scanState);

  const isSlideshowPlaying = useLibraryUIStore((s) => s.isSlideshowPlaying);
  const setIsSlideshowPlaying = useLibraryUIStore((s) => s.setIsSlideshowPlaying);
  const toggleSlideshowPlaying = useLibraryUIStore((s) => s.toggleSlideshowPlaying);
  const slideshowIntervalSec = useLibraryUIStore((s) => s.slideshowIntervalSec);
  const setSlideshowIntervalSec = useLibraryUIStore((s) => s.setSlideshowIntervalSec);
  const slideshowLoop = useLibraryUIStore((s) => s.slideshowLoop);
  const toggleSlideshowLoop = useLibraryUIStore((s) => s.toggleSlideshowLoop);
  const slideshowCrossfade = useLibraryUIStore((s) => s.slideshowCrossfade);
  const toggleSlideshowCrossfade = useLibraryUIStore((s) => s.toggleSlideshowCrossfade);
  const loupeScale = useLibraryUIStore((s) => s.loupeScale);
  const isZoomed = loupeScale > 0;
  const exitFullscreen = useLibraryUIStore((s) => s.exitFullscreen);

  const currentImage = displayedImages[activeImageIndex] || activeImage;
  const isRawFile = currentImage
    ? (currentImage.is_raw ?? isRawFilename(currentImage.name))
    : false;
  const isVideo = currentImage
    ? (currentImage.is_video ?? isVideoFilename(currentImage.name)) || ['wmv', 'flv', 'mkv', 'webm'].includes(currentImage.name.split('.').pop()?.toLowerCase() || '')
    : false;
  const extension = (currentImage?.name.split('.').pop() || 'VIDEO').toUpperCase();

  // OS Fullscreen State
  const [isOsFullscreen, setIsOsFullscreen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const win = getCurrentWindow();
    win.isFullscreen().then((fs) => {
      if (mounted) setIsOsFullscreen(fs);
    }).catch(() => {});

    let unlistenResized: (() => void) | undefined;
    win.onResized(() => {
      win.isFullscreen().then((fs) => {
        if (mounted) setIsOsFullscreen(fs);
      }).catch(() => {});
    }).then((unlisten) => {
      unlistenResized = unlisten;
    }).catch(() => {});

    const handleResize = () => {
      win.isFullscreen().then((fs) => {
        if (mounted) setIsOsFullscreen(fs);
      }).catch(() => {});
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mounted = false;
      if (unlistenResized) unlistenResized();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const toggleOsFullscreen = async () => {
    try {
      const win = getCurrentWindow();
      const cur = await win.isFullscreen();
      const target = !cur;
      setIsOsFullscreen(target);
      await win.setFullscreen(target);
      setTimeout(async () => {
        try {
          const actual = await win.isFullscreen();
          setIsOsFullscreen(actual);
        } catch (_) {}
      }, 300);
    } catch (err) {
      console.error('Failed to toggle OS fullscreen:', err);
      try {
        const actual = await getCurrentWindow().isFullscreen();
        setIsOsFullscreen(actual);
      } catch (_) {}
    }
  };

  // Two-Stage Progressive Loading & 2-Layer Crossfade
  const previewSrc = currentImage
    ? getRrImageUrl(currentImage.path, false, currentImage.culling?.orientation, 2, currentImage.size, currentImage.mtime)
    : '';
  const fullresSrc = currentImage
    ? getRrImageUrl(currentImage.path, true, currentImage.culling?.orientation, undefined, currentImage.size, currentImage.mtime)
    : '';

  const initialSrc = (!isRawFile && fullresSrc) ? fullresSrc : previewSrc;

  const [displaySrc, setDisplaySrc] = useState(initialSrc);
  const [prevDisplaySrc, setPrevDisplaySrc] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const mainImgRef = useRef<HTMLImageElement>(null);

  const prevImagePathRef = useRef<string | undefined>(currentImage?.path);
  const lastCommittedSrcRef = useRef<string | null>(initialSrc || null);
  const crossfadeTimeoutRef = useRef<number | null>(null);
  const lastNavTimeRef = useRef<number>(0);

  // Update lastCommittedSrcRef whenever displaySrc is non-empty
  useEffect(() => {
    if (displaySrc) {
      lastCommittedSrcRef.current = displaySrc;
    }
  }, [displaySrc]);

  // Synchronously handle path changes during render so no stale image URL is ever rendered under the new key
  if (currentImage?.path !== prevImagePathRef.current) {
    prevImagePathRef.current = currentImage?.path;
    const initialNextSrc = (!isRawFile && fullresSrc) ? fullresSrc : previewSrc;

    const now = Date.now();
    const isRapidSkim = (now - lastNavTimeRef.current) < 180;
    lastNavTimeRef.current = now;

    if (slideshowCrossfade && !isRapidSkim && lastCommittedSrcRef.current) {
      setPrevDisplaySrc(lastCommittedSrcRef.current);
    } else {
      setPrevDisplaySrc(null);
    }
    setDisplaySrc(initialNextSrc);
  }

  // Clear outgoing backdrop layer after ~380ms (CSS animation is 350ms)
  useEffect(() => {
    if (prevDisplaySrc) {
      if (crossfadeTimeoutRef.current !== null) {
        window.clearTimeout(crossfadeTimeoutRef.current);
      }
      crossfadeTimeoutRef.current = window.setTimeout(() => {
        setPrevDisplaySrc(null);
        crossfadeTimeoutRef.current = null;
      }, 380);
    }
    return () => {
      if (crossfadeTimeoutRef.current !== null) {
        window.clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
    };
  }, [prevDisplaySrc]);

  useEffect(() => {
    let canceled = false;
    setLoadFailed(false);

    if (!fullresSrc) {
      return;
    }

    const img = new Image();
    img.src = fullresSrc;

    if (img.complete && img.naturalWidth > 0) {
      setDisplaySrc(fullresSrc);
      lastCommittedSrcRef.current = fullresSrc;
    } else {
      img.onload = () => {
        if (!canceled) {
          setDisplaySrc(fullresSrc);
          lastCommittedSrcRef.current = fullresSrc;
          setLoadFailed(false);
        }
      };
      img.onerror = () => {
        if (!canceled) {
          if (!previewSrc || (mainImgRef.current?.complete && mainImgRef.current?.naturalWidth === 0)) {
            setLoadFailed(true);
          }
        }
      };
    }

    return () => {
      canceled = true;
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
  }, [fullresSrc, previewSrc]);

  useEffect(() => {
    if (mainImgRef.current?.complete && mainImgRef.current?.naturalWidth === 0) {
      setLoadFailed(true);
    }
  }, [displaySrc]);

  // L1 RAM Viewport Preloading (scale 2 & full-res)
  const [debouncedIndex, setDebouncedIndex] = useState(activeImageIndex);
  const warmupTokenRef = useRef(0);
  const directionRef = useRef<'next' | 'prev'>('next');
  const prevIndexRef = useRef(activeImageIndex);

  useEffect(() => {
    if (activeImageIndex > prevIndexRef.current) {
      directionRef.current = 'next';
    } else if (activeImageIndex < prevIndexRef.current) {
      directionRef.current = 'prev';
    }
    prevIndexRef.current = activeImageIndex;

    warmupTokenRef.current = Date.now();
    invoke('cancel_warmup_cache').catch(() => {});
  }, [activeImageIndex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedIndex(activeImageIndex);
    }, 100);
    return () => clearTimeout(timer);
  }, [activeImageIndex]);

  useEffect(() => {
    // Scan Protection: Never warm thumbnail cache during an active scan!
    if (
      debouncedIndex !== activeImageIndex || 
      displayedImages.length === 0 || 
      scanState === 'scanning' || 
      scanState === 'connecting'
    ) {
      return;
    }

    const token = Date.now();
    warmupTokenRef.current = token;

    const isForward = isSlideshowPlaying || directionRef.current === 'next';
    const warmPaths: string[] = [];

    if (isForward) {
      for (let offset = 1; offset <= 5; offset++) {
        let idx = activeImageIndex + offset;
        if (idx >= displayedImages.length && (isSlideshowPlaying ? slideshowLoop : false)) {
          idx = idx % displayedImages.length;
        }
        if (idx < displayedImages.length && idx !== activeImageIndex && displayedImages[idx]) {
          warmPaths.push(displayedImages[idx].path);
        }
      }
      if (activeImageIndex > 0 && displayedImages[activeImageIndex - 1]) {
        warmPaths.push(displayedImages[activeImageIndex - 1].path);
      }
    } else {
      for (let offset = 1; offset <= 5; offset++) {
        const idx = activeImageIndex - offset;
        if (idx >= 0 && displayedImages[idx]) {
          warmPaths.push(displayedImages[idx].path);
        }
      }
      if (activeImageIndex < displayedImages.length - 1 && displayedImages[activeImageIndex + 1]) {
        warmPaths.push(displayedImages[activeImageIndex + 1].path);
      }
    }

    if (warmPaths.length === 0) return;

    invoke('warm_thumbnail_cache', { paths: warmPaths, scale: 2, token })
      .then(() => {
        if (warmupTokenRef.current === token && warmPaths.length > 0) {
          const nextFullresPaths = warmPaths.slice(0, 2);
          return invoke('warm_thumbnail_cache', { paths: nextFullresPaths, scale: 100, token });
        }
      })
      .catch(() => {});

    // Pre-decode next images in WebKit cache for instant 60fps crossfading
    if (warmPaths.length > 0) {
      const preloadList = warmPaths.slice(0, 2);
      for (const p of preloadList) {
        const item = displayedImages.find(img => img.path === p);
        if (item) {
          const isItemRaw = item.is_raw ?? isRawFilename(item.name);
          const pSrc = getRrImageUrl(item.path, false, item.culling?.orientation, 2, item.size, item.mtime);
          const fSrc = getRrImageUrl(item.path, true, item.culling?.orientation, undefined, item.size, item.mtime);
          const targetUrl = (!isItemRaw && fSrc) ? fSrc : pSrc;
          if (targetUrl) {
            const preImg = new Image();
            preImg.src = targetUrl;
          }
        }
      }
    }

    return () => {
      warmupTokenRef.current = Date.now();
    };
  }, [debouncedIndex, activeImageIndex, displayedImages, scanState, isSlideshowPlaying, slideshowLoop]);

  // Slideshow Timer Logic
  useEffect(() => {
    if (!isSlideshowPlaying || displayedImages.length <= 1) return;

    const intervalMs = (slideshowIntervalSec || 3) * 1000;
    const timer = setTimeout(() => {
      if (activeImageIndex < displayedImages.length - 1) {
        const nextIdx = activeImageIndex + 1;
        setActiveImageIndex(nextIdx);
        if (displayedImages[nextIdx]) {
          setSelectedPaths(new Set([displayedImages[nextIdx].path]));
        }
      } else {
        if (slideshowLoop) {
          setActiveImageIndex(0);
          if (displayedImages[0]) {
            setSelectedPaths(new Set([displayedImages[0].path]));
          }
        } else {
          setIsSlideshowPlaying(false);
        }
      }
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [
    isSlideshowPlaying, activeImageIndex, displayedImages, slideshowIntervalSec, 
    slideshowLoop, setActiveImageIndex, setSelectedPaths, setIsSlideshowPlaying
  ]);

  const handleNext = useCallback(() => {
    if (activeImageIndex < displayedImages.length - 1) {
      const nextIdx = activeImageIndex + 1;
      setActiveImageIndex(nextIdx);
      if (displayedImages[nextIdx]) setSelectedPaths(new Set([displayedImages[nextIdx].path]));
    } else if (slideshowLoop) {
      setActiveImageIndex(0);
      if (displayedImages[0]) setSelectedPaths(new Set([displayedImages[0].path]));
    }
  }, [activeImageIndex, displayedImages, slideshowLoop, setActiveImageIndex, setSelectedPaths]);

  const handlePrev = useCallback(() => {
    if (activeImageIndex > 0) {
      const prevIdx = activeImageIndex - 1;
      setActiveImageIndex(prevIdx);
      if (displayedImages[prevIdx]) setSelectedPaths(new Set([displayedImages[prevIdx].path]));
    } else if (slideshowLoop) {
      const lastIdx = displayedImages.length - 1;
      setActiveImageIndex(lastIdx);
      if (displayedImages[lastIdx]) setSelectedPaths(new Set([displayedImages[lastIdx].path]));
    }
  }, [activeImageIndex, displayedImages, slideshowLoop, setActiveImageIndex, setSelectedPaths]);

  // Culling Feedback Badge (1.2s glassmorphism toast)
  const prevCullingRef = useRef<CullingState | null>(null);
  const prevCullingImagePathRef = useRef<string | null>(null);
  const [feedbackBadge, setFeedbackBadge] = useState<{
    text: string;
    icon?: React.ReactNode;
    colorClass?: string;
  } | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentImage) return;

    const prevPath = prevCullingImagePathRef.current;
    const prevCulling = prevCullingRef.current;

    prevCullingImagePathRef.current = currentImage.path;
    prevCullingRef.current = { ...currentImage.culling };

    // Only fire if user modified culling on the SAME image
    if (prevPath === currentImage.path && prevCulling) {
      let badge: { text: string; icon?: React.ReactNode; colorClass?: string } | null = null;

      if (currentImage.culling.flag !== prevCulling.flag) {
        if (currentImage.culling.flag === 1) {
          badge = {
            text: t('fullscreen.pickFeedback', 'Pick (P)'),
            icon: <Check className="w-4 h-4 text-emerald-400" />,
            colorClass: 'border-emerald-500/40 text-emerald-300 bg-emerald-950/75',
          };
        } else if (currentImage.culling.flag === -1) {
          badge = {
            text: t('fullscreen.rejectFeedback', 'Verworfen (X)'),
            icon: <X className="w-4 h-4 text-red-400" />,
            colorClass: 'border-red-500/40 text-red-300 bg-red-950/75',
          };
        } else {
          badge = {
            text: t('fullscreen.unflagFeedback', 'Neutral (U)'),
            colorClass: 'border-white/20 text-white/90 bg-black/80',
          };
        }
      } else if (currentImage.culling.rating !== prevCulling.rating) {
        const r = currentImage.culling.rating;
        if (r > 0) {
          const stars = '★'.repeat(r) + '☆'.repeat(5 - r);
          badge = {
            text: stars,
            colorClass: 'border-amber-500/40 text-amber-300 bg-black/80 font-mono text-sm tracking-wider',
          };
        } else {
          badge = {
            text: t('fullscreen.noRatingFeedback', 'Keine Sterne (0)'),
            colorClass: 'border-white/20 text-white/80 bg-black/80',
          };
        }
      } else if (currentImage.culling.color !== prevCulling.color) {
        const c = currentImage.culling.color;
        if (c) {
          const colorMap: Record<string, { label: string; dot: string }> = {
            red: { label: 'Rot (6)', dot: 'bg-red-500' },
            yellow: { label: 'Gelb (7)', dot: 'bg-yellow-400' },
            green: { label: 'Grün (8)', dot: 'bg-emerald-500' },
            blue: { label: 'Blau (9)', dot: 'bg-blue-500' },
          };
          const cfg = colorMap[c] || { label: c, dot: 'bg-white' };
          badge = {
            text: cfg.label,
            icon: <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />,
            colorClass: 'border-white/20 text-white bg-black/80',
          };
        } else {
          badge = {
            text: t('fullscreen.noColorFeedback', 'Keine Farbkennzeichnung'),
            colorClass: 'border-white/20 text-white/70 bg-black/80',
          };
        }
      }

      if (badge) {
        setFeedbackBadge(badge);
        if (feedbackTimerRef.current !== null) {
          window.clearTimeout(feedbackTimerRef.current);
        }
        feedbackTimerRef.current = window.setTimeout(() => {
          setFeedbackBadge(null);
        }, 1200);
      }
    }
  }, [currentImage, t]);

  // Floating HUD Auto-Hide & Mouse Inactivity Logic (2.5s)
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const [isIntervalOpen, setIsIntervalOpen] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const resetHideTimer = useCallback(() => {
    setIsHudVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      if (!isHoveringControls && !isIntervalOpen) {
        setIsHudVisible(false);
      }
    }, 2500);
  }, [isHoveringControls, isIntervalOpen]);

  useEffect(() => {
    resetHideTimer();
    const handleActivity = () => {
      resetHideTimer();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('wheel', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHideTimer]);

  const intervalMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isIntervalOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (intervalMenuRef.current && !intervalMenuRef.current.contains(e.target as Node)) {
        setIsIntervalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isIntervalOpen]);

  return (
    <div 
      className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none bg-black ${
        !isHudVisible ? 'cursor-none' : 'cursor-default'
      }`}
      onContextMenu={(e) => {
        if (currentImage && onContextMenu) {
          onContextMenu(e, currentImage.path, activeImageIndex);
        }
      }}
    >
      {/* Active Photo / Main Viewport */}
      {currentImage && (
        <>
          {loadFailed && isVideo ? (
            <div className="flex flex-col items-center justify-center p-8 max-w-md text-center bg-black/60 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl z-20">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Film className="w-8 h-8 text-txt-tertiary" />
              </div>
              <div className="text-sm font-semibold text-txt-primary mb-1 truncate max-w-full">
                {currentImage.name}
              </div>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-txt-secondary mb-3">
                {extension}
              </div>
              <div className="text-xs font-medium text-txt-primary mb-1">
                {t('inspector.videoPreviewUnavailable', 'Keine Vorschau für dieses Videoformat')}
              </div>
              <div className="text-[11px] text-txt-tertiary leading-relaxed mb-4">
                {t('inspector.videoPreviewUnavailableHint', 'Das Betriebssystem kann dieses Format nicht dekodieren. Die Datei bleibt unverändert.')}
              </div>
              <button
                onClick={() => {
                  openPath(currentImage.path).catch(() => {
                    invoke('show_in_finder', { path: currentImage.path });
                  });
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <Film className="w-3.5 h-3.5" />
                <span>{t('inspector.openExternalPlayer', 'Im externen Player öffnen')}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Outgoing Image Backdrop Layer for smooth crossfade */}
              {prevDisplaySrc && !isZoomed && (
                <img
                  key={prevDisplaySrc}
                  src={prevDisplaySrc}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none animate-crossfade-out z-0"
                />
              )}

              <img
                key={currentImage.path}
                ref={mainImgRef}
                src={displaySrc}
                alt={currentImage.name}
                className={`w-full h-full object-contain select-none pointer-events-none relative z-10 ${
                  prevDisplaySrc && !isZoomed ? 'animate-crossfade-in' : ''
                }`}
                onError={() => {
                  if (isVideo) setLoadFailed(true);
                }}
              />
            </>
          )}

          {/* Video Poster Frame Indicator */}
          {isVideo && !loadFailed && (
            <div className="absolute top-6 left-6 z-30 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white shadow-xl">
              <Film className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-semibold tracking-wide text-white/95">
                {t('inspector.videoPosterFrame', 'Video · Poster Frame')}
              </span>
            </div>
          )}

          {/* Rejected Overlay Tint */}
          {currentImage.culling?.flag === -1 && (
            <div className="absolute inset-0 bg-red-900/15 pointer-events-none z-10" />
          )}
        </>
      )}

      {/* Culling Toast Badge (Top Center) */}
      {feedbackBadge && (
        <div 
          className={`absolute top-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
            feedbackBadge.colorClass || 'border-white/20 bg-black/80 text-white'
          }`}
        >
          {feedbackBadge.icon}
          <span className="text-xs font-semibold">{feedbackBadge.text}</span>
        </div>
      )}

      {/* Close Button [ X ] (Top Right) */}
      <button
        onClick={() => exitFullscreen()}
        title={t('fullscreen.exit', 'Vollbild verlassen (Esc / F)')}
        className={`absolute top-5 right-5 z-40 bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/15 rounded-full p-2.5 text-white/80 hover:text-white shadow-xl cursor-pointer transition-all active:scale-95 ${
          isHudVisible ? 'opacity-100 pointer-events-auto duration-150' : 'opacity-0 pointer-events-none duration-300'
        }`}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Floating HUD Control Deck (Bottom Center) */}
      <div
        onMouseEnter={() => {
          setIsHoveringControls(true);
          setIsHudVisible(true);
        }}
        onMouseLeave={() => {
          setIsHoveringControls(false);
          resetHideTimer();
        }}
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-black/75 backdrop-blur-md border border-white/15 rounded-full px-5 py-2 shadow-2xl flex items-center gap-3 text-xs text-white select-none transition-all ${
          isHudVisible ? 'opacity-100 pointer-events-auto duration-150' : 'opacity-0 pointer-events-none duration-300'
        }`}
      >
        {/* 1. Counter & Filename */}
        <div className="flex items-center gap-2 font-mono text-white/80 text-xs">
          <span className="font-semibold text-white">
            {displayedImages.length > 0 ? activeImageIndex + 1 : 0}
          </span>
          <span className="text-white/40">/</span>
          <span>{displayedImages.length}</span>
          {currentImage && (
            <span 
              className="hidden sm:inline-block max-w-[130px] truncate text-[11px] text-white/50 pl-1 border-l border-white/15"
              title={currentImage.name}
            >
              {currentImage.name}
            </span>
          )}
        </div>

        {/* 2. Divider */}
        <div className="w-px h-4 bg-white/15" />

        {/* 3. Previous Image */}
        <button
          onClick={handlePrev}
          title={t('fullscreen.prev', 'Vorheriges Foto (← / K)')}
          disabled={!slideshowLoop && activeImageIndex === 0}
          className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* 4. Play / Pause Button */}
        <button
          onClick={toggleSlideshowPlaying}
          title={
            isSlideshowPlaying 
              ? t('fullscreen.pause', 'Diashow anhalten (Leertaste)')
              : t('fullscreen.play', 'Diashow starten (Leertaste)')
          }
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md ${
            isSlideshowPlaying 
              ? 'bg-accent text-white hover:bg-accent/90 shadow-accent/20' 
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          {isSlideshowPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current translate-x-0.5" />
          )}
        </button>

        {/* 5. Next Image */}
        <button
          onClick={handleNext}
          title={t('fullscreen.next', 'Nächstes Foto (→ / J)')}
          disabled={!slideshowLoop && activeImageIndex === displayedImages.length - 1}
          className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* 6. Divider */}
        <div className="w-px h-4 bg-white/15" />

        {/* 7. Interval Selector Pulldown */}
        <div className="relative" ref={intervalMenuRef}>
          <button
            onClick={() => setIsIntervalOpen(!isIntervalOpen)}
            title={t('fullscreen.interval', 'Intervall')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
              isIntervalOpen ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Timer className="w-3.5 h-3.5 text-white/80" />
            <span>{slideshowIntervalSec}s</span>
          </button>

          {isIntervalOpen && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 min-w-[70px] z-50 animate-in fade-in zoom-in-95 duration-150">
              {([2, 3, 5, 10] as const).map((sec) => (
                <button
                  key={sec}
                  onClick={() => {
                    setSlideshowIntervalSec(sec);
                    setIsIntervalOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-center transition-all cursor-pointer ${
                    slideshowIntervalSec === sec
                      ? 'bg-accent text-white font-semibold shadow-xs'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 8. Loop Toggle */}
        <button
          onClick={toggleSlideshowLoop}
          title={slideshowLoop ? t('fullscreen.loopActive', 'Endlosschleife aktiv') : t('fullscreen.loopInactive', 'Endlosschleife inaktiv')}
          className={`p-1.5 rounded-md transition-all cursor-pointer ${
            slideshowLoop 
              ? 'text-accent bg-accent/20' 
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" />
        </button>

        {/* 9. Crossfade Toggle */}
        <button
          onClick={toggleSlideshowCrossfade}
          title={
            slideshowCrossfade 
              ? t('fullscreen.crossfadeActive', 'Weiche Überblendung aktiv') 
              : t('fullscreen.crossfadeInactive', 'Weiche Überblendung inaktiv')
          }
          aria-label={t('fullscreen.crossfadeToggle', 'Weiche Überblendung (an/aus)')}
          className={`p-1.5 rounded-md transition-all cursor-pointer ${
            slideshowCrossfade 
              ? 'text-accent bg-accent/20' 
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
        >
          <Blend className="w-3.5 h-3.5" />
        </button>

        {/* 10. OS Fullscreen Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleOsFullscreen();
          }}
          title={
            isOsFullscreen 
              ? t('fullscreen.exitOsFullscreen', 'Betriebssystem-Vollbild beenden')
              : t('fullscreen.osFullscreen', 'Betriebssystem-Vollbild einschalten')
          }
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          {isOsFullscreen ? (
            <Minimize className="w-3.5 h-3.5" />
          ) : (
            <Maximize className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});
