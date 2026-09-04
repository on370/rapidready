import React, { useEffect, useCallback, useState, useRef } from "react";
import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, ChevronLeft, ChevronRight, Check, Rocket, FolderOpen, Film, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";
import { ZoomableImage } from "./ZoomableImage";
import { HelpPopover } from "../../ui/HelpPopover";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";

const loadedThumbnailCache = new Set<string>();

const GridThumbnailItem = React.memo(function GridThumbnailItem({
  img,
  isSelected,
  isScrolling,
  onSelect,
  onOpen,
}: {
  img: LibraryImage;
  isSelected: boolean;
  isScrolling: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const isLoaded = loadedThumbnailCache.has(img.path);
  const [shouldLoad, setShouldLoad] = useState(isLoaded || !isScrolling);

  useEffect(() => {
    if (shouldLoad) return;
    if (isScrolling) return;

    // When user pauses scrubbing for 150ms, load visible thumbnails
    const timer = setTimeout(() => {
      setShouldLoad(true);
    }, 150);

    return () => clearTimeout(timer);
  }, [isScrolling, shouldLoad]);

  return (
    <div 
      className={`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden bg-app-card group transition-colors ${
        isSelected ? 'border-accent ring-2 ring-accent' : 'border-app-border hover:border-app-border-hover'
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      {shouldLoad ? (
        <img 
          src={`rr-image://localhost${img.path}`} 
          className="w-full h-full object-cover" 
          loading="lazy" 
          alt={img.name} 
          onLoad={() => loadedThumbnailCache.add(img.path)}
        />
      ) : (
        <div className="w-full h-full bg-[#161619] flex items-center justify-center">
          <div className="w-6 h-6 rounded-md bg-white/[0.03]" />
        </div>
      )}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {img.culling.flag === 1 && <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center shadow"><Check className="w-3 h-3 text-white" /></div>}
        {img.culling.flag === -1 && <div className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-[10px] font-bold text-white shadow">X</div>}
      </div>
      {img.culling.rating > 0 && (
        <div className="absolute bottom-1 left-1 flex">
          {Array.from({length: img.culling.rating}).map((_, i) => <Star key={i} className="w-3 h-3 text-warning fill-warning" />)}
        </div>
      )}
      {img.culling.flag === -1 && <div className="absolute inset-0 bg-danger/20 pointer-events-none" />}
    </div>
  );
});

const FilmstripThumbnailItem = React.memo(function FilmstripThumbnailItem({
  img,
  isActive,
  onSelect,
}: {
  img: LibraryImage;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [loaded, setLoaded] = useState(loadedThumbnailCache.has(img.path));

  return (
    <div
      onClick={onSelect}
      className={`w-24 h-16 aspect-[3/2] rounded-lg border relative overflow-hidden flex-shrink-0 cursor-pointer transition-all duration-150 group bg-app-card ${
        isActive 
          ? 'border-accent ring-2 ring-accent shadow-md shadow-accent/20 opacity-100' 
          : 'border-app-border hover:border-app-border-hover opacity-75 hover:opacity-100'
      }`}
    >
      <img 
        src={`rr-image://localhost${img.path}`} 
        className={`w-full h-full object-cover pointer-events-none transition-opacity duration-150 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`} 
        alt={img.name} 
        onLoad={() => {
          loadedThumbnailCache.add(img.path);
          setLoaded(true);
        }}
      />
      {!loaded && (
        <div className="absolute inset-0 bg-[#161619] flex items-center justify-center pointer-events-none">
          <div className="w-5 h-5 rounded bg-white/[0.04] animate-pulse" />
        </div>
      )}
      <div className="absolute top-1 right-1 flex gap-0.5 pointer-events-none">
        {img.culling.flag === 1 && (
          <div className="w-3.5 h-3.5 rounded-full bg-success flex items-center justify-center shadow">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {img.culling.flag === -1 && (
          <div className="w-3.5 h-3.5 rounded-full bg-danger flex items-center justify-center text-[8px] font-bold text-white shadow">
            X
          </div>
        )}
      </div>
      {img.culling.rating > 0 && (
        <div className="absolute bottom-0.5 left-1 flex items-center gap-0.5 bg-black/60 px-1 py-0.2 rounded text-[9px] text-warning pointer-events-none font-bold">
          <Star className="w-2.5 h-2.5 fill-warning text-warning" />
          <span>{img.culling.rating}</span>
        </div>
      )}
      {img.culling.flag === -1 && (
        <div className="absolute inset-0 bg-danger/25 pointer-events-none" />
      )}
    </div>
  );
});

interface FilmstripBarProps {
  displayedImages: LibraryImage[];
  activeImageIndex: number;
  onSelect: (index: number) => void;
}

const FilmstripBar = React.memo(function FilmstripBar({
  displayedImages,
  activeImageIndex,
  onSelect,
}: FilmstripBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ITEM_SLOT = 104; // 96px width + 8px gap
  const paddingX = 32; // 16px left + 16px right
  const availWidth = Math.max(100, containerWidth - paddingX);
  
  // Calculate how many thumbnails fit in the container
  const maxFit = Math.max(1, Math.floor((availWidth + 8) / ITEM_SLOT));
  // Prefer an odd number of visible items so active thumbnail is centered
  const visibleCount = Math.min(displayedImages.length, maxFit % 2 === 0 ? Math.max(1, maxFit - 1) : maxFit);
  const half = Math.floor(visibleCount / 2);

  // Compute start and end indices so activeImageIndex is centered whenever possible
  let startIndex = Math.max(0, activeImageIndex - half);
  let endIndex = startIndex + visibleCount;
  if (endIndex > displayedImages.length) {
    endIndex = displayedImages.length;
    startIndex = Math.max(0, endIndex - visibleCount);
  }

  const visibleImages = displayedImages.slice(startIndex, endIndex);

  // Translate mouse wheel / trackpad scrolling to step between photos
  const wheelAccumulator = useRef(0);
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAccumulator.current += delta;
    if (wheelAccumulator.current > 35) {
      wheelAccumulator.current = 0;
      if (activeImageIndex < displayedImages.length - 1) {
        onSelect(activeImageIndex + 1);
      }
    } else if (wheelAccumulator.current < -35) {
      wheelAccumulator.current = 0;
      if (activeImageIndex > 0) {
        onSelect(activeImageIndex - 1);
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      onWheel={handleWheel}
      className="h-20 bg-app-card/60 border-t border-app-border overflow-hidden select-none py-2 px-4 flex items-center justify-center relative"
    >
      <div className="flex items-center justify-center gap-2">
        {visibleImages.map((img, localIdx) => {
          const itemIndex = startIndex + localIdx;
          return (
            <FilmstripThumbnailItem
              key={img.path}
              img={img}
              isActive={activeImageIndex === itemIndex}
              onSelect={() => onSelect(itemIndex)}
            />
          );
        })}
      </div>
    </div>
  );
});

interface LibraryCenterProps {
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  toggleInspector: () => void;
}

export function LibraryCenter({ viewMode, setViewMode, toggleInspector }: LibraryCenterProps) {
  const { t } = useTranslation('library');
  const { 
    images, activeImageIndex, setActiveImageIndex, autoAdvance, 
    updateCullingState, activeFolderPath, filterMode, setFilterMode,
    lastImportPaths, isViewingLastImport, isLoading,
    gridThumbnailSize, setGridThumbnailSize, loupeScale, setLoupeScale
  } = useLibraryStore();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showActionIcons, setShowActionIcons] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Measure toolbar container width directly (not screen width!)
  useEffect(() => {
    if (!toolbarRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Show icons when toolbar has at least 630px (compact, natural gap to Delete button)
        setShowActionIcons(entry.contentRect.width >= 630);
      }
    });
    observer.observe(toolbarRef.current);
    return () => observer.disconnect();
  }, []);

  const [debouncedActiveIndex, setDebouncedActiveIndex] = useState(activeImageIndex);

  // Debounce preloading so rapid key-navigation doesn't hammer QuickLook with full-res requests
  useEffect(() => {
    if (viewMode !== 'loupe') return;
    const timer = setTimeout(() => {
      setDebouncedActiveIndex(activeImageIndex);
    }, 400);
    return () => clearTimeout(timer);
  }, [activeImageIndex, viewMode]);

  const scopedImages = isViewingLastImport
    ? images.filter(img => lastImportPaths.includes(img.path))
    : activeFolderPath 
      ? images.filter(img => img.path.startsWith(activeFolderPath)) 
      : images;

  const displayedImages = scopedImages.filter(img => {
    if (filterMode === 'picks') return img.culling.flag === 1;
    if (filterMode === 'rejected') return img.culling.flag === -1;
    if (filterMode.startsWith('rated')) {
      const minStars = parseInt(filterMode.replace('rated', '')) || 1;
      return img.culling.rating >= minStars;
    }
    return true; // 'all'
  });
  const activeImage = displayedImages[activeImageIndex];

  // Dynamic Grid Math: responsive column count & precise row height
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode]);

  // Available width inside padding (p-6 = 24px left + 24px right = 48px)
  const paddingX = 48;
  const gap = 12; // gap-3 = 12px
  const targetWidth = gridThumbnailSize;
  const availableWidth = Math.max(100, containerWidth - paddingX);

  // Responsive number of columns based on container width
  const numColumns = Math.max(1, Math.floor((availableWidth + gap) / (targetWidth + gap)));
  const totalGaps = (numColumns - 1) * gap;
  const itemWidth = (availableWidth - totalGaps) / numColumns;
  const itemHeight = itemWidth * (2 / 3); // 3:2 aspect ratio

  const rowCount = Math.ceil(displayedImages.length / numColumns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => gridContainerRef.current,
    estimateSize: () => itemHeight,
    gap,
    overscan: 2,
    isScrollingResetDelay: 100,
  });

  // Re-measure virtualizer whenever container width, columns or itemHeight change
  useEffect(() => {
    rowVirtualizer.measure();
  }, [itemHeight, numColumns]);


  // Auto-scroll active thumbnail in grid into view
  useEffect(() => {
    if (viewMode === 'grid' && displayedImages.length > 0 && activeImageIndex >= 0) {
      const activeRow = Math.floor(activeImageIndex / numColumns);
      rowVirtualizer.scrollToIndex(activeRow, { align: 'auto', behavior: 'auto' });
    }
  }, [activeImageIndex, viewMode, numColumns, displayedImages.length]);

  const handleCulling = useCallback((flag: number | null, rating: number) => {
    if (!activeImage) return;
    
    // Update local state instantly
    const globalIndex = images.findIndex(img => img.path === activeImage.path);
    if (globalIndex !== -1) updateCullingState(globalIndex, { flag, rating });
    
    // Persist to sidecar
    invoke('set_culling_state', { 
      path: activeImage.path,
      flag,
      rating,
      color: activeImage.culling.color
    }).catch(console.error);

    // Auto-advance if enabled and a flag was set
    if (autoAdvance && flag !== null && activeImageIndex < displayedImages.length - 1) {
      setActiveImageIndex(activeImageIndex + 1);
    }
  }, [activeImage, activeImageIndex, displayedImages.length, autoAdvance, images, updateCullingState, setActiveImageIndex]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if an input/textarea is focused
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      
      // Shortcut: Cmd + Shift + F -> Reveal in Finder
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (activeImage) {
          invoke('show_in_finder', { path: activeImage.path });
        }
        return;
      }

      // Shortcut: R -> Open in RapidRAW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (activeImage) {
          invoke('open_in_rapidraw', { path: activeImage.path });
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'j') {
        setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        setActiveImageIndex(Math.max(0, activeImageIndex - 1));
      } else if (e.key === 'ArrowDown') {
        const step = viewMode === 'grid' ? numColumns : 1;
        setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + step));
      } else if (e.key === 'ArrowUp') {
        const step = viewMode === 'grid' ? numColumns : 1;
        setActiveImageIndex(Math.max(0, activeImageIndex - step));
      } else {
        switch (e.key) {
          case 'p':
          case 'P':
            handleCulling(1, activeImage?.culling.rating || 0);
            break;
          case 'x':
          case 'X':
            handleCulling(-1, activeImage?.culling.rating || 0);
            break;
          case 'u':
          case 'U':
            handleCulling(null, activeImage?.culling.rating || 0);
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
            handleCulling(activeImage?.culling.flag || null, parseInt(e.key));
            break;
          case 'e':
          case 'E':
          case 'Enter':
            setViewMode('loupe');
            e.preventDefault();
            break;
          case 'g':
          case 'G':
          case 'Escape':
            setViewMode('grid');
            e.preventDefault();
            break;
          case ' ':
            e.preventDefault();
            if (e.shiftKey) {
               if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
            } else {
               if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImage, activeImageIndex, displayedImages.length, handleCulling, viewMode, setViewMode, numColumns]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-txt-primary truncate max-w-[400px]">
            {isViewingLastImport ? t('header.lastImport') : activeFolderPath ? activeFolderPath.split('/').pop() : t('header.allImages')}
          </h2>
          <p className="text-xs text-txt-tertiary mt-0.5">{displayedImages.length} {t('previewFiles', 'files')} · {(displayedImages.reduce((acc, img) => acc + img.size, 0) / (1024*1024)).toFixed(1)} MB</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Auto-Advance (UI setting - placed left) */}
          <button 
            onClick={() => useLibraryStore.getState().setAutoAdvance(!autoAdvance)} 
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${autoAdvance ? 'bg-warning/15 border-warning/30 text-warning hover:bg-warning/25' : 'bg-app-card border-app-border text-txt-tertiary hover:text-txt-secondary hover:border-app-border-hover'}`}
            title="Auto-Advance nach Bewertung umschalten"
          >
            <Zap className={`w-3.5 h-3.5 ${autoAdvance ? 'fill-warning text-warning' : 'text-txt-tertiary'}`} />
            <span className="hidden sm:inline">Auto-Advance</span>
          </button>

          <div className="w-px h-5 bg-app-border mx-0.5"></div>

          {/* Dual-Mode Zoom Slider (Grid Thumbnail Zoom / Loupe Image Zoom) */}
          <div 
            className="flex items-center gap-1.5 bg-app-card border border-app-border rounded-lg px-2 py-1 h-[30px]"
            title={
              viewMode === 'grid' 
                ? `Thumbnail-Größe: ${gridThumbnailSize}px` 
                : loupeScale <= 0 
                  ? 'Zoom: Einpassen (Fit)' 
                  : `Zoom: ${Math.round(loupeScale * 100)}%`
            }
          >
            <button 
              onClick={() => {
                if (viewMode === 'grid') {
                  setGridThumbnailSize(Math.max(120, gridThumbnailSize - 20));
                } else {
                  if (loupeScale <= 1) {
                    setLoupeScale(0);
                  } else {
                    setLoupeScale(Math.max(1, Math.round((loupeScale - 0.25) * 100) / 100));
                  }
                }
              }}
              className="text-txt-tertiary hover:text-txt-secondary transition-colors cursor-pointer p-0.5 rounded"
              title={viewMode === 'grid' ? 'Kleinere Thumbnails' : 'Verkleinern'}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <input 
              type="range"
              min={viewMode === 'grid' ? 120 : 0}
              max={viewMode === 'grid' ? 400 : 5}
              step={viewMode === 'grid' ? 10 : 0.1}
              value={viewMode === 'grid' ? gridThumbnailSize : loupeScale}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (viewMode === 'grid') {
                  setGridThumbnailSize(val);
                } else {
                  setLoupeScale(val < 0.5 ? 0 : val);
                }
              }}
              className="zoom-slider w-16 sm:w-20 md:w-24 cursor-pointer"
            />

            <button 
              onClick={() => {
                if (viewMode === 'grid') {
                  setGridThumbnailSize(Math.min(400, gridThumbnailSize + 20));
                } else {
                  if (loupeScale <= 0) {
                    setLoupeScale(1);
                  } else {
                    setLoupeScale(Math.min(5, Math.round((loupeScale + 0.25) * 100) / 100));
                  }
                }
              }}
              className="text-txt-tertiary hover:text-txt-secondary transition-colors cursor-pointer p-0.5 rounded"
              title={viewMode === 'grid' ? 'Größere Thumbnails' : 'Vergrößern'}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-px h-5 bg-app-border mx-0.5"></div>

          {/* View mode toggle: Grid / Loupe */}
          <div className="flex items-center bg-app-card border border-app-border rounded-lg p-0.5">
            <button 
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ${viewMode === 'grid' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:text-txt-secondary'}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t('toolbar.viewGrid')}</span>
            </button>
            <button 
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ${viewMode === 'loupe' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:text-txt-secondary'}`}
              onClick={() => setViewMode('loupe')}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>{t('toolbar.viewLoupe')}</span>
            </button>
          </div>
          <div className="w-px h-5 bg-app-border mx-1"></div>
          <HelpPopover viewMode={viewMode} />
          <button className="p-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer" onClick={toggleInspector} title={t('toolbar.toggleInspector')}>
            <PanelRight className="w-4 h-4 text-txt-secondary" />
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel/60 flex-shrink-0 text-xs">
        <span className="text-txt-tertiary font-medium">Filters:</span>
        <div className="flex items-center gap-1 text-[11px]">
          <button onClick={() => setFilterMode('all')} className={`filter-pill px-2 py-1 rounded-md font-medium ${filterMode === 'all' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:bg-app-hover'}`}>All</button>
          <button onClick={() => setFilterMode('picks')} className={`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 ${filterMode === 'picks' ? 'bg-success/15 text-success' : 'text-txt-tertiary hover:bg-app-hover'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>Picks
          </button>
          <button onClick={() => setFilterMode('rejected')} className={`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 ${filterMode === 'rejected' ? 'bg-danger/15 text-danger' : 'text-txt-tertiary hover:bg-app-hover'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>Rejected
          </button>
        </div>
        <div className="w-px h-4 bg-app-border"></div>
        <div className="flex items-center gap-1 text-[11px]">
          {[1,2,3,4,5].map(stars => (
            <button key={stars} onClick={() => setFilterMode('rated'+stars)} className={`filter-pill px-2 py-1 rounded-md font-medium ${filterMode === 'rated'+stars ? 'bg-warning/15 text-warning' : 'text-txt-tertiary hover:bg-app-hover'}`}>≥{stars}★</button>
          ))}
        </div>
      </div>

      {/* CULLING TOOLBAR */}
      <div ref={toolbarRef} className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-[#111114] flex-shrink-0 overflow-hidden whitespace-nowrap">
        {/* Flag Buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => handleCulling(-1, activeImage?.culling.rating || 0)} className={`w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 ${activeImage?.culling.flag === -1 ? 'bg-danger text-white' : 'text-txt-tertiary'}`}>X</button>
          <button onClick={() => handleCulling(null, activeImage?.culling.rating || 0)} className={`w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover ${activeImage?.culling.flag === null ? 'bg-app-hover text-white' : 'text-txt-tertiary'}`}>U</button>
          <button onClick={() => handleCulling(1, activeImage?.culling.rating || 0)} className={`w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 ${activeImage?.culling.flag === 1 ? 'bg-success text-white' : 'text-txt-tertiary'}`}>P</button>
        </div>

        <div className="w-px h-6 bg-app-border flex-shrink-0"></div>

        {/* Stars */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => handleCulling(activeImage?.culling.flag || null, activeImage?.culling.rating === s ? 0 : s)} className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-all cursor-pointer">
              <Star className={`w-3.5 h-3.5 ${(activeImage?.culling.rating || 0) >= s ? 'text-warning fill-warning' : 'text-txt-tertiary'}`} />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-app-border flex-shrink-0"></div>

        {/* Image Actions: In RapidRAW (links) & Finder (rechts) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Action: Open in RapidRAW */}
          <button 
            disabled={!activeImage}
            onClick={() => activeImage && invoke('open_in_rapidraw', { path: activeImage.path })}
            className="px-2.5 py-1 bg-accent/15 border border-accent/30 hover:bg-accent hover:text-app-deepest text-accent rounded-md text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 shadow-sm shadow-accent/10"
            title={t('toolbar.openInRapidRawTooltip')}
          >
            {showActionIcons && <Rocket className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{t('toolbar.openInRapidRaw')}</span>
            <kbd className="text-[10px] opacity-80 font-mono px-1 py-0.2 rounded bg-black/25">R</kbd>
          </button>

          {/* Action: Show in Finder */}
          <button 
            disabled={!activeImage}
            onClick={() => activeImage && invoke('show_in_finder', { path: activeImage.path })}
            className="px-2.5 py-1 bg-app-card border border-app-border hover:border-app-border-hover hover:bg-app-hover rounded-md text-xs font-medium text-txt-secondary hover:text-txt-primary transition-all duration-150 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 shadow-sm"
            title={t('toolbar.showInFinderTooltip')}
          >
            {showActionIcons && <FolderOpen className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />}
            <span>{t('toolbar.showInFinder')}</span>
            <kbd className="text-[10px] text-txt-tertiary font-mono bg-app-panel px-1 py-0.2 rounded border border-app-border">⌘⇧F</kbd>
          </button>
        </div>

        <div className="flex-1"></div>

        {/* Delete Rejected Button */}
        <button onClick={() => {
            const rejected = displayedImages.filter(i => i.culling.flag === -1);
            if (rejected.length === 0) return;
            ask(`Move ${rejected.length} rejected images to the OS Trash?`, {
              title: 'Confirm Delete',
              kind: 'warning',
              okLabel: 'Move to Trash',
              cancelLabel: 'Cancel'
            }).then(confirmed => {
              if (confirmed) {
                invoke('delete_files', { paths: rejected.map(i => i.path), toTrash: true }).then(() => {
                  const remaining = images.filter(i => i.culling.flag !== -1);
                  useLibraryStore.getState().setImages(remaining);
                }).catch(err => {
                  console.error(err);
                  alert('Failed to move to trash: ' + err);
                });
              }
            });
          }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger/10 transition-all flex-shrink-0">
          <Trash2 className="w-3 h-3" />
          <span>Delete Rejected ({displayedImages.filter(i => i.culling.flag === -1).length})</span>
        </button>
      </div>

      {/* Content Area */}
      {viewMode === 'grid' ? (
        <div ref={gridContainerRef} className="flex-1 overflow-auto p-6 relative">
          {displayedImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-txt-tertiary text-sm">
              Keine Bilder gefunden
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const startIndex = virtualRow.index * numColumns;
                const rowImages = displayedImages.slice(startIndex, startIndex + numColumns);

                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`,
                    }}
                    className="grid gap-3"
                  >
                    {rowImages.map((img, colIdx) => {
                      const globalIdx = startIndex + colIdx;
                      return (
                        <GridThumbnailItem
                          key={img.path}
                          img={img}
                          isSelected={activeImageIndex === globalIdx}
                          isScrolling={rowVirtualizer.isScrolling}
                          onSelect={() => setActiveImageIndex(globalIdx)}
                          onOpen={() => {
                            setActiveImageIndex(globalIdx);
                            setViewMode('loupe');
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative">
            {activeImage ? (
              <>
                <ZoomableImage 
                  src={`rr-image://localhost${activeImage.path}?fullres=true`} 
                  previewSrc={`rr-image://localhost${activeImage.path}`}
                  alt={activeImage.name} 
                />
                
                {/* Preload Previous and Next Full-Res images when navigation pauses */}
                {debouncedActiveIndex === activeImageIndex && (
                  <>
                    {debouncedActiveIndex > 0 && (
                      <img src={`rr-image://localhost${displayedImages[debouncedActiveIndex - 1].path}?fullres=true`} className="hidden" />
                    )}
                    {debouncedActiveIndex < displayedImages.length - 1 && (
                      <img src={`rr-image://localhost${displayedImages[debouncedActiveIndex + 1].path}?fullres=true`} className="hidden" />
                    )}
                  </>
                )}
              </>
            ) : null}
            {activeImage?.culling.flag === -1 && <div className="absolute inset-0 bg-danger/10 pointer-events-none" />}
          </div>

          {/* Filmstrip Bar */}
          {showFilmstrip && (
            <FilmstripBar
              displayedImages={displayedImages}
              activeImageIndex={activeImageIndex}
              onSelect={setActiveImageIndex}
            />
          )}

          {/* Bottom Bar: Prev/Next Buttons + Info + Filmstrip Toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button 
                className="p-1.5 rounded-lg hover:bg-app-hover transition-colors text-txt-secondary hover:text-txt-primary cursor-pointer" 
                onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}
                title="Vorheriges Bild (← oder K)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                className="p-1.5 rounded-lg hover:bg-app-hover transition-colors text-txt-secondary hover:text-txt-primary cursor-pointer" 
                onClick={() => setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + 1))}
                title="Nächstes Bild (→ oder J)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary truncate max-w-[200px]" title={activeImage?.name}>{activeImage?.name}</span>
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
                title="Filmstreifen ein-/ausblenden"
              >
                <Film className="w-3.5 h-3.5" />
                <span className="text-[11px]">Filmstreifen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay when directory is being scanned */}
      {isLoading && (
        <div className="absolute inset-0 bg-app-deepest/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-150">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm font-semibold text-txt-primary">Archiv wird indexiert...</p>
          <p className="text-xs text-txt-tertiary">Dateien werden geladen und Culling-Sidecars synchronisiert</p>
        </div>
      )}
    </div>
  );
}
