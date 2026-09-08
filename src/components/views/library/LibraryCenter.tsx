import React, { useEffect, useCallback, useState, useRef } from "react";
import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, ChevronLeft, ChevronRight, Check, Rocket, FolderOpen, Film, Loader2, ZoomIn, ZoomOut, RotateCw, RotateCcw, SquareArrowOutUpRight, CircleSlash, Tag, ChevronDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLibraryStore, LibraryImage, CullingState } from "../../../stores/libraryStore";
import { ZoomableImage } from "./ZoomableImage";
import { HelpPopover } from "../../ui/HelpPopover";
import { ContextMenu } from "./ContextMenu";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getRrImageUrl, normalizePath, normalizeSlash } from "../../../utils/image";
import { isMac, modSymbol, shiftSymbol } from "../../../utils/platform";
import { COLOR_PALETTE, getColorConfig } from "../../../constants/culling";

const loadedThumbnailCache = new Set<string>();

const GridThumbnailItem = React.memo(function GridThumbnailItem({
  img,
  isActive,
  isSelected,
  isScrolling = false,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  img: LibraryImage;
  isActive: boolean;
  isSelected: boolean;
  isScrolling?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const cacheKey = `${img.path}:${img.culling?.orientation || 1}`;
  const isCached = loadedThumbnailCache.has(cacheKey);
  const [shouldLoad, setShouldLoad] = useState(isCached || !isScrolling);
  const [isLoaded, setIsLoaded] = useState(isCached);
  const imgRef = useRef<HTMLImageElement>(null);

  // When scrolling settles, start loading immediately (no redundant timer)
  useEffect(() => {
    if (!shouldLoad && !isScrolling) {
      setShouldLoad(true);
    }
  }, [isScrolling, shouldLoad]);

  useEffect(() => {
    setIsLoaded(loadedThumbnailCache.has(cacheKey));
  }, [cacheKey]);

  // Cancel in-flight HTTP request if tile scrolls off-screen before completing
  useEffect(() => {
    return () => {
      if (imgRef.current && !loadedThumbnailCache.has(cacheKey)) {
        imgRef.current.src = "";
      }
    };
  }, [cacheKey]);

  return (
    <div 
      className={`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden bg-app-card group transition-colors ${
        isActive 
          ? 'border-accent ring-2 ring-accent shadow-md shadow-accent/10' 
          : isSelected 
            ? 'border-accent/80 ring-2 ring-accent/50 bg-accent/5' 
            : 'border-app-border hover:border-app-border-hover'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {shouldLoad && (
        <img 
          ref={imgRef}
          src={getRrImageUrl(img.path, false, img.culling?.orientation)} 
          className={`w-full h-full object-contain transition-opacity duration-150 ${isLoaded ? 'opacity-100' : 'opacity-0'}`} 
          alt={img.name} 
          onLoad={() => {
            loadedThumbnailCache.add(cacheKey);
            setIsLoaded(true);
          }}
        />
      )}
      {!isLoaded && (
        <div className="absolute inset-0 bg-[#161619] flex items-center justify-center pointer-events-none">
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
      {img.culling.color && (
        <div className="absolute bottom-1 right-1 flex pointer-events-none">
          <span className={`w-2 h-2 rounded-full shadow ${getColorConfig(img.culling.color)?.bg || 'bg-transparent'}`} />
        </div>
      )}
      {img.culling.flag === -1 && <div className="absolute inset-0 bg-danger/20 pointer-events-none" />}
    </div>
  );
});

const FilmstripThumbnailItem = React.memo(function FilmstripThumbnailItem({
  img,
  isActive,
  isSelected,
  thumbWidth,
  thumbHeight,
  onClick,
  onContextMenu,
}: {
  img: LibraryImage;
  isActive: boolean;
  isSelected: boolean;
  thumbWidth: number;
  thumbHeight: number;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const cacheKey = `${img.path}:${img.culling?.orientation || 1}`;
  const [loaded, setLoaded] = useState(loadedThumbnailCache.has(cacheKey));

  useEffect(() => {
    setLoaded(loadedThumbnailCache.has(cacheKey));
  }, [cacheKey]);

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
      className={`rounded-lg border relative overflow-hidden flex-shrink-0 cursor-pointer transition-all duration-150 group bg-app-card ${
        isActive 
          ? 'border-accent ring-2 ring-accent shadow-md shadow-accent/20 opacity-100' 
          : isSelected
            ? 'border-accent/80 ring-1 ring-accent/60 opacity-100 bg-accent/10'
            : 'border-app-border hover:border-app-border-hover opacity-75 hover:opacity-100'
      }`}
    >
      <img 
        src={getRrImageUrl(img.path, false, img.culling?.orientation)} 
        className={`w-full h-full object-contain pointer-events-none transition-opacity duration-150 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`} 
        alt={img.name} 
        onLoad={() => {
          loadedThumbnailCache.add(cacheKey);
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
      {img.culling.color && (
        <div className="absolute bottom-1 right-1 flex pointer-events-none">
          <span className={`w-2 h-2 rounded-full shadow ${getColorConfig(img.culling.color)?.bg || 'bg-transparent'}`} />
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
  selectedPaths: Set<string>;
  onSelect: (index: number, e?: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, path: string, index: number) => void;
}

const FilmstripBar = React.memo(function FilmstripBar({
  displayedImages,
  activeImageIndex,
  selectedPaths,
  onSelect,
  onContextMenu,
}: FilmstripBarProps) {
  const { t } = useTranslation('library');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  const [filmstripHeight, setFilmstripHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rapidready_filmstrip_height');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val)) return Math.max(56, Math.min(180, val));
      }
    } catch (_) {}
    return 80;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startDragY = useRef(0);
  const startHeight = useRef(80);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startDragY.current = e.clientY;
    startHeight.current = filmstripHeight;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging upward increases height, dragging downward decreases height
      const deltaY = startDragY.current - e.clientY;
      const nextHeight = Math.max(56, Math.min(180, startHeight.current + deltaY));
      setFilmstripHeight(nextHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('rapidready_filmstrip_height', filmstripHeight.toString());
      } catch (_) {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, filmstripHeight]);

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

  const paddingY = 16; // 8px top, 8px bottom
  const thumbHeight = Math.max(40, filmstripHeight - paddingY);
  const thumbWidth = Math.round(thumbHeight * 1.5); // 3:2 ratio
  const ITEM_SLOT = thumbWidth + 8; // 8px gap
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
      style={{ height: `${filmstripHeight}px` }}
      className="bg-app-card/60 border-t border-app-border overflow-hidden select-none py-2 px-4 flex items-center justify-center relative flex-shrink-0"
    >
      {/* Resizing Handle along the top border */}
      <div 
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setFilmstripHeight(80);
          try {
            localStorage.setItem('rapidready_filmstrip_height', '80');
          } catch (_) {}
        }}
        className="absolute top-0 left-0 right-0 h-2 cursor-row-resize flex items-center justify-center group z-20 hover:bg-accent/20 transition-colors"
        title={t('filmstrip.resizeTooltip')}
      >
        <div className="w-12 h-1 rounded-full bg-app-border group-hover:bg-accent transition-colors" />
      </div>

      <div className="flex items-center justify-center gap-2">
        {visibleImages.map((img, localIdx) => {
          const itemIndex = startIndex + localIdx;
          const isSelected = selectedPaths.size > 0
            ? selectedPaths.has(img.path)
            : activeImageIndex === itemIndex;
          return (
            <FilmstripThumbnailItem
              key={img.path}
              img={img}
              isActive={activeImageIndex === itemIndex}
              isSelected={isSelected}
              thumbWidth={thumbWidth}
              thumbHeight={thumbHeight}
              onClick={(e) => onSelect(itemIndex, e)}
              onContextMenu={(e) => onContextMenu(e, img.path, itemIndex)}
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
    updateCullingState, updateBatchCullingState, updateImageCullings,
    selectedPaths, setSelectedPaths, toggleSelectedPath, selectRange, selectAll,
    activeFolderPath, filterMode, setFilterMode,
    selectedRatingFilter, setSelectedRatingFilter,
    selectedColorFilter, setSelectedColorFilter,
    selectedTagFilter, setSelectedTagFilter,
    lastImportPaths, isViewingLastImport, isLoading, rootPath,
    gridThumbnailSize, setGridThumbnailSize, loupeScale, setLoupeScale
  } = useLibraryStore();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const colorPaletteRef = useRef<HTMLDivElement>(null);
  const ratingFilterRef = useRef<HTMLDivElement>(null);
  const colorFilterRef = useRef<HTMLDivElement>(null);
  const tagFilterRef = useRef<HTMLDivElement>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
  const [isRatingFilterOpen, setIsRatingFilterOpen] = useState(false);
  const [isColorFilterOpen, setIsColorFilterOpen] = useState(false);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setIsShareOpen(false);
      }
      if (colorPaletteRef.current && !colorPaletteRef.current.contains(e.target as Node)) {
        setIsColorPaletteOpen(false);
      }
      if (ratingFilterRef.current && !ratingFilterRef.current.contains(e.target as Node)) {
        setIsRatingFilterOpen(false);
      }
      if (colorFilterRef.current && !colorFilterRef.current.contains(e.target as Node)) {
        setIsColorFilterOpen(false);
      }
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) {
        setIsTagFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const normLastImport = React.useMemo(() => {
    return new Set(lastImportPaths.map(p => normalizePath(p)));
  }, [lastImportPaths]);

  const normActiveFolder = React.useMemo(() => {
    return activeFolderPath ? normalizePath(activeFolderPath) : null;
  }, [activeFolderPath]);

  const normRoot = React.useMemo(() => {
    return rootPath ? normalizePath(rootPath) : null;
  }, [rootPath]);

  const scopedImages = isViewingLastImport
    ? images.filter(img => normLastImport.has(normalizePath(img.path)))
    : normActiveFolder && normActiveFolder !== normRoot
      ? images.filter(img => {
          const p = normalizePath(img.path);
          return p.startsWith(normActiveFolder + '/') || p === normActiveFolder;
        })
      : images;

  const displayedImages = scopedImages.filter(img => {
    if (selectedTagFilter && !img.culling.tags.includes(selectedTagFilter)) {
      return false;
    }
    if (selectedColorFilter && img.culling.color !== selectedColorFilter) {
      return false;
    }
    if (selectedRatingFilter !== null && (img.culling.rating || 0) < selectedRatingFilter) {
      return false;
    }
    if (filterMode === 'picks') return img.culling.flag === 1;
    if (filterMode === 'rejected') return img.culling.flag === -1;
    if (filterMode.startsWith('rated')) {
      const minStars = parseInt(filterMode.replace('rated', '')) || 1;
      return (img.culling.rating || 0) >= minStars;
    }
    return true; // 'all'
  });

  const availableTags = React.useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const img of scopedImages) {
      for (const tag of img.culling.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [scopedImages]);

  const colorCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of scopedImages) {
      if (img.culling.color) {
        counts.set(img.culling.color, (counts.get(img.culling.color) || 0) + 1);
      }
    }
    return counts;
  }, [scopedImages]);

  const ratingCounts = React.useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const img of scopedImages) {
      const r = img.culling.rating || 0;
      for (let s = 1; s <= 5; s++) {
        if (r >= s) counts[s]++;
      }
    }
    return counts;
  }, [scopedImages]);
  const activeImage = displayedImages[activeImageIndex];

  // Sync active photo folder with libraryStore so sidebar tree highlights and scrolls to location
  useEffect(() => {
    if (activeImage?.path) {
      const norm = normalizeSlash(activeImage.path);
      const lastSlash = norm.lastIndexOf('/');
      const folder = lastSlash > 0 ? norm.substring(0, lastSlash) : null;
      useLibraryStore.getState().setActiveImageFolder(folder);
    } else {
      useLibraryStore.getState().setActiveImageFolder(null);
    }
  }, [activeImage?.path]);

  // When active folder or collection changes, always select and display the first image in the folder
  const prevFolderRef = useRef(activeFolderPath);
  const prevLastImportRef = useRef(isViewingLastImport);

  useEffect(() => {
    if (prevFolderRef.current !== activeFolderPath || prevLastImportRef.current !== isViewingLastImport) {
      prevFolderRef.current = activeFolderPath;
      prevLastImportRef.current = isViewingLastImport;
      
      if (displayedImages.length > 0) {
        setActiveImageIndex(0);
        setSelectedPaths(new Set([displayedImages[0].path]));
      } else {
        setActiveImageIndex(0);
        setSelectedPaths(new Set());
      }
    }
  }, [activeFolderPath, isViewingLastImport, displayedImages, setActiveImageIndex, setSelectedPaths]);

  // Safeguard: keep activeImageIndex within valid range if displayedImages shrinks (e.g. filter change or deletes)
  useEffect(() => {
    if (displayedImages.length > 0 && activeImageIndex >= displayedImages.length) {
      setActiveImageIndex(0);
      setSelectedPaths(new Set([displayedImages[0].path]));
    }
  }, [displayedImages.length, activeImageIndex, setActiveImageIndex, setSelectedPaths]);

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

  const handleRotate = useCallback(async (direction: 'cw' | 'ccw') => {
    if (!activeImage) return;
    const targetPaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    try {
      const res = await invoke<Array<{ path: string; culling: CullingState }>>('rotate_images', {
        paths: targetPaths,
        direction,
      });
      if (res && res.length > 0) {
        updateImageCullings(res);
      }
    } catch (err) {
      console.error('Failed to rotate images:', err);
    }
  }, [activeImage, selectedPaths, updateImageCullings]);

  const handleCulling = useCallback((flag: number | null, rating: number) => {
    if (!activeImage) return;
    
    const targetPaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (targetPaths.length > 1) {
      updateBatchCullingState(targetPaths, { flag, rating });
      invoke('set_culling_state_batch', {
        paths: targetPaths,
        flag: flag === null ? 0 : flag,
        rating,
        color: null,
      }).catch(console.error);
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { flag, rating });
      
      invoke('set_culling_state', { 
        path: activeImage.path,
        flag,
        rating,
        color: activeImage.culling.color,
        tags: activeImage.culling.tags,
      }).catch(console.error);

      // Auto-advance only for single selection
      if (autoAdvance && flag !== null && activeImageIndex < displayedImages.length - 1) {
        const nextIdx = activeImageIndex + 1;
        setActiveImageIndex(nextIdx);
        if (displayedImages[nextIdx]) {
          setSelectedPaths(new Set([displayedImages[nextIdx].path]));
        }
      }
    }
  }, [activeImage, selectedPaths, images, autoAdvance, activeImageIndex, displayedImages, updateBatchCullingState, updateCullingState, setActiveImageIndex, setSelectedPaths]);

  const handleSetColor = useCallback((newColor: string | null) => {
    if (!activeImage) return;

    const targetPaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (targetPaths.length > 1) {
      updateBatchCullingState(targetPaths, { color: newColor });
      invoke('set_culling_state_batch', {
        paths: targetPaths,
        color: newColor || 'none',
      }).catch(console.error);
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { color: newColor });

      invoke('set_culling_state', { 
        path: activeImage.path,
        flag: activeImage.culling.flag,
        rating: activeImage.culling.rating,
        color: newColor,
        tags: activeImage.culling.tags,
      }).catch(console.error);
    }
  }, [activeImage, selectedPaths, images, updateBatchCullingState, updateCullingState]);

  const rejectedImages = React.useMemo(() => {
    return scopedImages.filter(i => i.culling.flag === -1);
  }, [scopedImages]);
  const rejectedCount = rejectedImages.length;

  const handleDeleteRejected = useCallback(() => {
    if (rejectedCount === 0) return;
    ask(t('delete.confirmMessage', { count: rejectedCount }), {
      title: t('delete.confirmTitle'),
      kind: 'warning',
      okLabel: t('delete.okLabel'),
      cancelLabel: t('delete.cancelLabel')
    }).then(confirmed => {
      if (confirmed) {
        invoke('delete_files', { paths: rejectedImages.map(i => i.path), toTrash: true }).then(() => {
          const rejectedPathSet = new Set(rejectedImages.map(i => i.path));
          const remaining = images.filter(i => !rejectedPathSet.has(i.path));
          useLibraryStore.getState().setImages(remaining);
        }).catch(err => {
          console.error(err);
          alert(t('delete.failedError') + err);
        });
      }
    });
  }, [rejectedCount, rejectedImages, images, t]);

  const handleItemClick = useCallback((e: React.MouseEvent, clickedIndex: number, img: LibraryImage) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelectedPath(img.path);
      setActiveImageIndex(clickedIndex);
    } else if (e.shiftKey) {
      selectRange(activeImageIndex, clickedIndex, displayedImages);
      setActiveImageIndex(clickedIndex);
    } else {
      setSelectedPaths(new Set([img.path]));
      setActiveImageIndex(clickedIndex);
    }
  }, [activeImageIndex, displayedImages, toggleSelectedPath, selectRange, setSelectedPaths, setActiveImageIndex]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedPaths.has(path)) {
      setSelectedPaths(new Set([path]));
      setActiveImageIndex(index);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  }, [selectedPaths, setSelectedPaths, setActiveImageIndex]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if an input/textarea is focused
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      
      // Shortcut: Cmd/Ctrl + A -> Select All
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAll(displayedImages);
        return;
      }

      // Shortcut: Cmd/Ctrl + Shift + F -> Reveal in Finder
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (activeImage) {
          invoke('show_in_finder', { path: activeImage.path });
        }
        return;
      }

      // Shortcut: Cmd/Ctrl + R -> Rotate CW
      if ((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        handleRotate('cw');
        return;
      }

      // Shortcut: Cmd/Ctrl + L -> Rotate CCW
      if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleRotate('ccw');
        return;
      }

      // Shortcut: R (without Cmd/Ctrl) -> Open in RapidRAW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (activeImage) {
          invoke('open_in_rapidraw', { path: activeImage.path });
        }
        return;
      }

      // Shortcut: . (Period) -> Rotate CW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '.') {
        e.preventDefault();
        handleRotate('cw');
        return;
      }

      // Shortcut: , (Comma) -> Rotate CCW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === ',') {
        e.preventDefault();
        handleRotate('ccw');
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'j') {
        const next = Math.min(displayedImages.length - 1, activeImageIndex + 1);
        setActiveImageIndex(next);
        if (!e.shiftKey && displayedImages[next]) {
          setSelectedPaths(new Set([displayedImages[next].path]));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        const prev = Math.max(0, activeImageIndex - 1);
        setActiveImageIndex(prev);
        if (!e.shiftKey && displayedImages[prev]) {
          setSelectedPaths(new Set([displayedImages[prev].path]));
        }
      } else if (e.key === 'ArrowDown') {
        const step = viewMode === 'grid' ? numColumns : 1;
        const next = Math.min(displayedImages.length - 1, activeImageIndex + step);
        setActiveImageIndex(next);
        if (!e.shiftKey && displayedImages[next]) {
          setSelectedPaths(new Set([displayedImages[next].path]));
        }
      } else if (e.key === 'ArrowUp') {
        const step = viewMode === 'grid' ? numColumns : 1;
        const prev = Math.max(0, activeImageIndex - step);
        setActiveImageIndex(prev);
        if (!e.shiftKey && displayedImages[prev]) {
          setSelectedPaths(new Set([displayedImages[prev].path]));
        }
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
          case '6':
            handleSetColor(activeImage?.culling.color === 'red' ? null : 'red');
            break;
          case '7':
            handleSetColor(activeImage?.culling.color === 'yellow' ? null : 'yellow');
            break;
          case '8':
            handleSetColor(activeImage?.culling.color === 'green' ? null : 'green');
            break;
          case '9':
            handleSetColor(activeImage?.culling.color === 'blue' ? null : 'blue');
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
               if (activeImageIndex > 0) {
                 const prev = activeImageIndex - 1;
                 setActiveImageIndex(prev);
                 if (displayedImages[prev]) setSelectedPaths(new Set([displayedImages[prev].path]));
               }
            } else {
               if (activeImageIndex < displayedImages.length - 1) {
                 const next = activeImageIndex + 1;
                 setActiveImageIndex(next);
                 if (displayedImages[next]) setSelectedPaths(new Set([displayedImages[next].path]));
               }
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImage, activeImageIndex, displayedImages, handleCulling, handleSetColor, handleRotate, viewMode, setViewMode, numColumns, selectAll, setSelectedPaths, setActiveImageIndex]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-txt-primary truncate max-w-[400px]">
            {isViewingLastImport ? t('header.lastImport') : activeFolderPath ? normalizeSlash(activeFolderPath).split('/').pop() : t('header.allImages')}
          </h2>
          <p className="text-xs text-txt-tertiary mt-0.5">{displayedImages.length} {t('previewFiles', 'files')} · {(displayedImages.reduce((acc, img) => acc + img.size, 0) / (1024*1024)).toFixed(1)} MB</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Auto-Advance (UI setting - placed left) */}
          <button 
            onClick={() => useLibraryStore.getState().setAutoAdvance(!autoAdvance)} 
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${autoAdvance ? 'bg-warning/15 border-warning/30 text-warning hover:bg-warning/25' : 'bg-app-card border-app-border text-txt-tertiary hover:text-txt-secondary hover:border-app-border-hover'}`}
            title={t('toolbar.autoAdvanceTooltip')}
          >
            <Zap className={`w-3.5 h-3.5 ${autoAdvance ? 'fill-warning text-warning' : 'text-txt-tertiary'}`} />
            <span className="hidden sm:inline">{t('toolbar.autoAdvance')}</span>
          </button>

          <div className="w-px h-5 bg-app-border mx-0.5"></div>

          {/* Dual-Mode Zoom Slider (Grid Thumbnail Zoom / Loupe Image Zoom) */}
          <div 
            className="flex items-center gap-1.5 bg-app-card border border-app-border rounded-lg px-2 py-1 h-[30px]"
            title={
              viewMode === 'grid' 
                ? t('toolbar.zoomThumbnailSize', { size: gridThumbnailSize }) 
                : loupeScale <= 0 
                  ? t('toolbar.zoomFit') 
                  : t('toolbar.zoomPercent', { percent: Math.round(loupeScale * 100) })
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
              title={viewMode === 'grid' ? t('toolbar.smallerThumbnails') : t('toolbar.zoomOut')}
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
              title={viewMode === 'grid' ? t('toolbar.largerThumbnails') : t('toolbar.zoomIn')}
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
      <div className="relative z-30 flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel/60 flex-shrink-0 text-xs">
        <span className="text-txt-tertiary font-medium">{t('filters.label')}</span>
        <div className="flex items-center gap-1 text-[11px]">
          <button onClick={() => setFilterMode('all')} className={`filter-pill px-2 py-1 rounded-md font-medium ${filterMode === 'all' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:bg-app-hover'}`}>{t('filters.all')}</button>
          <button onClick={() => setFilterMode('picks')} className={`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 ${filterMode === 'picks' ? 'bg-success/15 text-success' : 'text-txt-tertiary hover:bg-app-hover'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>{t('filters.picks')}
          </button>
          <button onClick={() => setFilterMode('rejected')} className={`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 ${filterMode === 'rejected' ? 'bg-danger/15 text-danger' : 'text-txt-tertiary hover:bg-app-hover'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>{t('filters.rejected')}
          </button>
        </div>
        <div className="w-px h-4 bg-app-border"></div>

        {/* Rating Filter Dropdown */}
        <div ref={ratingFilterRef} className="relative">
          {selectedRatingFilter !== null ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/30 text-[11px] font-medium">
              <Star className="w-3 h-3 fill-warning text-warning" />
              <button 
                onClick={() => setIsRatingFilterOpen(prev => !prev)}
                className="flex items-center gap-1 hover:underline cursor-pointer"
                title={t('filters.ratingFilter')}
              >
                <span>≥{selectedRatingFilter}★</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRatingFilter(null);
                }}
                className="p-0.5 hover:bg-warning/20 rounded cursor-pointer ml-0.5 text-warning/70 hover:text-warning"
                title={t('filters.allRatings')}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsRatingFilterOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                isRatingFilterOpen ? 'bg-app-hover text-txt-primary' : 'text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'
              }`}
              title={t('filters.ratingFilter')}
            >
              <Star className="w-3 h-3 text-warning/70" />
              <span>{t('filters.allRatings')}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
          )}

          {/* Rating Dropdown Menu */}
          {isRatingFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 rounded-lg bg-[#18181b] border border-app-border shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setSelectedRatingFilter(null);
                  setIsRatingFilterOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                  selectedRatingFilter === null ? 'text-accent font-medium' : 'text-txt-secondary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 opacity-60" />
                  <span>{t('filters.allRatings')}</span>
                </div>
                {selectedRatingFilter === null && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>

              <div className="h-px bg-app-border my-1" />

              {[1, 2, 3, 4, 5].map(stars => (
                <button
                  key={stars}
                  onClick={() => {
                    setSelectedRatingFilter(stars);
                    setIsRatingFilterOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                    selectedRatingFilter === stars ? 'text-warning font-medium bg-warning/10' : 'text-txt-secondary'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold">≥{stars}</span>
                    <div className="flex items-center">
                      {Array.from({ length: stars }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-warning text-warning" />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] px-1.5 py-0.2 bg-white/5 border border-white/10 rounded-full text-txt-tertiary">
                      {ratingCounts[stars]}
                    </span>
                    {selectedRatingFilter === stars && <Check className="w-3.5 h-3.5 text-warning" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-app-border"></div>

        {/* Color Filter Dropdown */}
        <div ref={colorFilterRef} className="relative">
          {selectedColorFilter ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 text-txt-primary border border-white/20 text-[11px] font-medium">
              <span className={`w-3 h-3 rounded-full ${getColorConfig(selectedColorFilter)?.bg} ring-1 ring-white/30 flex-shrink-0`} />
              <button 
                onClick={() => setIsColorFilterOpen(prev => !prev)}
                className="flex items-center gap-1 hover:underline cursor-pointer"
                title={t('filters.colorFilter')}
              >
                <span>{t(`colors.${selectedColorFilter}`)}</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedColorFilter(null);
                }}
                className="p-0.5 hover:bg-white/20 rounded cursor-pointer ml-0.5 text-txt-secondary hover:text-white"
                title={t('filters.allColors')}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsColorFilterOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                isColorFilterOpen ? 'bg-app-hover text-txt-primary' : 'text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'
              }`}
              title={t('filters.colorFilter')}
            >
              <span
                className="w-3 h-3 rounded-full ring-1 ring-white/20 shadow-sm flex-shrink-0"
                style={{
                  background: 'conic-gradient(from 0deg, #ef4444 0deg 72deg, #fbbf24 72deg 144deg, #10b981 144deg 216deg, #3b82f6 216deg 288deg, #a855f7 288deg 360deg)'
                }}
              />
              <span>{t('filters.allColors')}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
          )}

          {/* Color Dropdown Menu */}
          {isColorFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 rounded-lg bg-[#18181b] border border-app-border shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setSelectedColorFilter(null);
                  setIsColorFilterOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                  selectedColorFilter === null ? 'text-accent font-medium' : 'text-txt-secondary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full ring-1 ring-white/20 shadow-sm flex-shrink-0"
                    style={{
                      background: 'conic-gradient(from 0deg, #ef4444 0deg 72deg, #fbbf24 72deg 144deg, #10b981 144deg 216deg, #3b82f6 216deg 288deg, #a855f7 288deg 360deg)'
                    }}
                  />
                  <span>{t('filters.allColors')}</span>
                </div>
                {selectedColorFilter === null && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>

              <div className="h-px bg-app-border my-1" />

              {COLOR_PALETTE.map((c) => {
                const count = colorCounts.get(c.id) || 0;
                const isSelected = selectedColorFilter === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedColorFilter(c.id);
                      setIsColorFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                      isSelected ? 'bg-white/10 text-white font-medium' : 'text-txt-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full ${c.bg} ring-1 ring-white/30 flex-shrink-0`} />
                      <span>{t(`colors.${c.id}`)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] px-1.5 py-0.2 bg-white/5 border border-white/10 rounded-full text-txt-tertiary">
                        {count}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-app-border"></div>

        {/* Tag Filter Dropdown */}
        <div ref={tagFilterRef} className="relative">
          {selectedTagFilter ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30 text-[11px] font-medium">
              <Tag className="w-3 h-3" />
              <button 
                onClick={() => setIsTagFilterOpen(prev => !prev)}
                className="flex items-center gap-1 hover:underline cursor-pointer"
                title={t('filters.tagFilter')}
              >
                <span>{selectedTagFilter}</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTagFilter(null);
                }}
                className="p-0.5 hover:bg-accent/20 rounded cursor-pointer ml-0.5 text-accent/70 hover:text-accent"
                title={t('filters.allTags')}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsTagFilterOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                isTagFilterOpen ? 'bg-app-hover text-txt-primary' : 'text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'
              }`}
              title={t('filters.tagFilter')}
            >
              <Tag className="w-3 h-3" />
              <span>{t('filters.allTags')}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
          )}

          {/* Dropdown Menu */}
          {isTagFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-lg bg-[#18181b] border border-app-border shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setSelectedTagFilter(null);
                  setIsTagFilterOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                  selectedTagFilter === null ? 'text-accent font-medium' : 'text-txt-secondary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 opacity-60" />
                  <span>{t('filters.allTags')}</span>
                </div>
                {selectedTagFilter === null && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>

              <div className="h-px bg-app-border my-1" />

              {availableTags.length === 0 ? (
                <div className="px-3 py-2 text-xs text-txt-tertiary italic text-center">
                  {t('filters.noTagsInFolder')}
                </div>
              ) : (
                availableTags.map(tItem => (
                  <button
                    key={tItem.name}
                    onClick={() => {
                      setSelectedTagFilter(tItem.name);
                      setIsTagFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                      selectedTagFilter === tItem.name ? 'text-accent font-medium bg-accent/10' : 'text-txt-secondary'
                    }`}
                  >
                    <span className="truncate pr-2">{tItem.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] px-1.5 py-0.2 bg-white/5 border border-white/10 rounded-full text-txt-tertiary">
                        {tItem.count}
                      </span>
                      {selectedTagFilter === tItem.name && <Check className="w-3.5 h-3.5 text-accent" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* CULLING TOOLBAR */}
      <div ref={toolbarRef} className="relative z-20 flex items-center gap-3 px-4 py-2 border-b border-app-border bg-[#111114] flex-shrink-0 overflow-visible whitespace-nowrap">
        {/* Flag Buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button 
            onClick={() => handleCulling(1, activeImage?.culling.rating || 0)} 
            className={`w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 cursor-pointer ${activeImage?.culling.flag === 1 ? 'bg-success text-white' : 'text-txt-tertiary'}`}
            title={t('inspector.pick')}
          >
            P
          </button>
          <button 
            onClick={() => handleCulling(null, activeImage?.culling.rating || 0)} 
            className={`w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover cursor-pointer ${activeImage?.culling.flag === null ? 'bg-app-hover text-white' : 'text-txt-tertiary'}`}
            title={t('inspector.unflag')}
          >
            U
          </button>
          <button 
            onClick={() => handleCulling(-1, activeImage?.culling.rating || 0)} 
            className={`w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 cursor-pointer ${activeImage?.culling.flag === -1 ? 'bg-danger text-white' : 'text-txt-tertiary'}`}
            title={t('inspector.reject')}
          >
            X
          </button>
        </div>

        {/* Delete Rejected Button */}
        <button
          disabled={rejectedCount === 0}
          onClick={handleDeleteRejected}
          className={`flex items-center gap-1.5 px-2 h-7 rounded-md text-xs font-medium transition-all flex-shrink-0 ml-0.5 ${
            rejectedCount > 0
              ? 'text-danger hover:bg-danger/15 border border-danger/30 cursor-pointer'
              : 'text-txt-tertiary opacity-25 cursor-not-allowed border border-transparent'
          }`}
          title={rejectedCount > 0 ? t('delete.buttonTooltip', { count: rejectedCount }) : t('delete.noRejectedTooltip')}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="font-semibold text-[11px]">({rejectedCount})</span>
        </button>

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

        {/* Dynamic Color Dot (Option 2) */}
        <div className="relative flex-shrink-0" ref={colorPaletteRef}>
          <button
            disabled={!activeImage}
            onClick={() => setIsColorPaletteOpen(!isColorPaletteOpen)}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-app-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={t('toolbar.colorLabelTooltip')}
          >
            {activeImage?.culling.color ? (
              <span 
                className={`w-3.5 h-3.5 rounded-full ${getColorConfig(activeImage.culling.color)?.bg} ring-1 ring-white/30 shadow-sm transition-transform hover:scale-110`} 
              />
            ) : (
              <span
                className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20 shadow-sm transition-transform hover:scale-110"
                style={{
                  background: 'conic-gradient(from 0deg, #ef4444 0deg 72deg, #fbbf24 72deg 144deg, #10b981 144deg 216deg, #3b82f6 216deg 288deg, #a855f7 288deg 360deg)'
                }}
              />
            )}
          </button>

          {isColorPaletteOpen && activeImage && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 p-1.5 bg-app-card/95 backdrop-blur-md border border-app-border rounded-xl shadow-xl z-50 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100">
              {COLOR_PALETTE.map((c) => {
                const isSelected = activeImage.culling.color === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      handleSetColor(isSelected ? null : c.id);
                      setIsColorPaletteOpen(false);
                    }}
                    className={`w-6 h-6 rounded-full ${c.bg} flex items-center justify-center hover:scale-110 transition-transform cursor-pointer relative shadow-sm ${
                      isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-app-card' : ''
                    }`}
                    title={`${t(`colors.${c.id}`)}${c.shortcut ? ` (${c.shortcut})` : ''}`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                  </button>
                );
              })}

              <div className="w-px h-4 bg-app-border mx-0.5" />

              {/* Clear color */}
              <button
                onClick={() => {
                  handleSetColor(null);
                  setIsColorPaletteOpen(false);
                }}
                className="w-6 h-6 rounded-full bg-app-panel border border-app-border hover:bg-app-hover flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:scale-110 transition-all cursor-pointer"
                title={t('colors.none')}
              >
                <CircleSlash className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-app-border flex-shrink-0"></div>

        {/* Rotation Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[11px] text-txt-tertiary font-medium mr-0.5">{t('toolbar.rotateLabel')}</span>
          <button
            disabled={!activeImage}
            onClick={() => handleRotate('ccw')}
            className="p-1.5 bg-app-card border border-app-border hover:border-app-border-hover hover:bg-app-hover rounded-md text-txt-secondary hover:text-txt-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            title={t('toolbar.rotateCcwTooltip')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!activeImage}
            onClick={() => handleRotate('cw')}
            className="p-1.5 bg-app-card border border-app-border hover:border-app-border-hover hover:bg-app-hover rounded-md text-txt-secondary hover:text-txt-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            title={t('toolbar.rotateCwTooltip')}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {selectedPaths.size > 1 && (
          <>
            <div className="w-px h-6 bg-app-border flex-shrink-0"></div>
            <div className="px-2 py-0.5 bg-accent/15 border border-accent/30 rounded text-[11px] font-medium text-accent flex-shrink-0">
              {t('contextMenu.selectedCount', { count: selectedPaths.size })}
            </div>
          </>
        )}

        <div className="flex-1"></div>

        {/* Share / Export Popover */}
        <div className="relative flex-shrink-0" ref={shareMenuRef}>
          <button 
            disabled={!activeImage}
            onClick={() => setIsShareOpen(!isShareOpen)}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-all duration-150 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm ${
              isShareOpen 
                ? 'bg-accent/15 border-accent text-accent' 
                : 'bg-app-card border-app-border hover:border-app-border-hover hover:bg-app-hover text-txt-primary'
            }`}
            title={t('toolbar.shareTooltip')}
          >
            <SquareArrowOutUpRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline font-medium">{t('toolbar.share')}</span>
            <ChevronDown className="w-3 h-3 opacity-60 hidden sm:inline flex-shrink-0" />
          </button>

          {isShareOpen && activeImage && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-app-card/95 backdrop-blur-md border border-app-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  invoke('open_in_rapidraw', { path: activeImage.path });
                  setIsShareOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-txt-primary hover:bg-accent hover:text-white transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <Rocket className="w-3.5 h-3.5 text-accent group-hover:text-white transition-colors" />
                  <span className="font-medium">{t('toolbar.openInRapidRaw')}</span>
                </div>
                <kbd className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono px-1 py-0.5 rounded bg-black/20">
                  R
                </kbd>
              </button>

              <button
                onClick={() => {
                  invoke('show_in_finder', { path: activeImage.path });
                  setIsShareOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-txt-primary hover:bg-app-hover transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-primary transition-colors" />
                  <span>{isMac ? t('toolbar.showInFinder') : t('toolbar.showInExplorer')}</span>
                </div>
                <kbd className="text-[10px] text-txt-tertiary font-mono px-1 py-0.5 rounded bg-app-panel border border-app-border">
                  {modSymbol}{shiftSymbol}F
                </kbd>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'grid' ? (
        <div 
          ref={gridContainerRef} 
          className="flex-1 overflow-auto p-6 relative"
          onContextMenu={(e) => {
            if (e.target === e.currentTarget) e.preventDefault();
          }}
        >
          {displayedImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-txt-tertiary text-sm">
              {t('empty')}
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
                      const isSelected = selectedPaths.size > 0 
                        ? selectedPaths.has(img.path) 
                        : activeImageIndex === globalIdx;
                      return (
                        <GridThumbnailItem
                          key={img.path}
                          img={img}
                          isActive={activeImageIndex === globalIdx}
                          isSelected={isSelected}
                          isScrolling={rowVirtualizer.isScrolling}
                          onClick={(e) => handleItemClick(e, globalIdx, img)}
                          onDoubleClick={() => {
                            setActiveImageIndex(globalIdx);
                            setViewMode('loupe');
                          }}
                          onContextMenu={(e) => handleContextMenu(e, img.path, globalIdx)}
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
          <div 
            className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative"
            onContextMenu={(e) => {
              if (activeImage) {
                handleContextMenu(e, activeImage.path, activeImageIndex);
              }
            }}
          >
            {activeImage ? (
              <>
                <ZoomableImage 
                  src={getRrImageUrl(activeImage.path, true, activeImage.culling?.orientation)} 
                  previewSrc={getRrImageUrl(activeImage.path, false, activeImage.culling?.orientation)}
                  alt={activeImage.name} 
                  onContextMenu={(e) => {
                    handleContextMenu(e, activeImage.path, activeImageIndex);
                  }}
                />
                
                {/* Preload Previous and Next Full-Res images when navigation pauses */}
                {debouncedActiveIndex === activeImageIndex && (
                  <>
                    {debouncedActiveIndex > 0 && (
                      <img src={getRrImageUrl(displayedImages[debouncedActiveIndex - 1].path, true, displayedImages[debouncedActiveIndex - 1].culling?.orientation)} className="hidden" />
                    )}
                    {debouncedActiveIndex < displayedImages.length - 1 && (
                      <img src={getRrImageUrl(displayedImages[debouncedActiveIndex + 1].path, true, displayedImages[debouncedActiveIndex + 1].culling?.orientation)} className="hidden" />
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
              selectedPaths={selectedPaths}
              onSelect={(idx, e) => {
                if (e) {
                  handleItemClick(e, idx, displayedImages[idx]);
                } else {
                  setActiveImageIndex(idx);
                  if (displayedImages[idx]) {
                    setSelectedPaths(new Set([displayedImages[idx].path]));
                  }
                }
              }}
              onContextMenu={(e, path, idx) => handleContextMenu(e, path, idx)}
            />
          )}

          {/* Bottom Bar: Prev/Next Buttons + Info + Filmstrip Toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0">
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
                title={t('filmstrip.toggleTooltip')}
              >
                <Film className="w-3.5 h-3.5" />
                <span className="text-[11px]">{t('filmstrip.title')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedPaths.has(activeImage?.path || '') && selectedPaths.size > 1 ? selectedPaths.size : 1}
          currentRating={activeImage?.culling?.rating || 0}
          currentColor={activeImage?.culling?.color || null}
          onClose={() => setContextMenu(null)}
          onRotate={(dir) => handleRotate(dir)}
          onCulling={(flag, rating) => handleCulling(flag !== undefined ? flag : (activeImage?.culling.flag ?? null), rating ?? activeImage?.culling.rating ?? 0)}
          onSetColor={(color) => handleSetColor(color)}
          onOpenInRapidRaw={() => {
            if (activeImage) invoke('open_in_rapidraw', { path: activeImage.path });
          }}
          onShowInFinder={() => {
            if (activeImage) invoke('show_in_finder', { path: activeImage.path });
          }}
          zoomOptions={viewMode === 'loupe' ? {
            currentScale: loupeScale,
            onSetScale: (scale: number) => setLoupeScale(scale),
          } : undefined}
        />
      )}

      {/* Loading Overlay when directory is being scanned */}
      {isLoading && (
        <div className="absolute inset-0 bg-app-deepest/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-150">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm font-semibold text-txt-primary">{t('loading.indexing')}</p>
          <p className="text-xs text-txt-tertiary">{t('loading.syncing')}</p>
        </div>
      )}
    </div>
  );
}
