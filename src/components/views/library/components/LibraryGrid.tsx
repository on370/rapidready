import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useLibraryStore, LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { useCollectionsStore } from '../../../../stores/collectionsStore';
import { GridThumbnailItem } from './GridThumbnailItem';

export interface LibraryGridProps {
  displayedImages: LibraryImage[];
  activeImageIndex: number;
  selectedPaths: Set<string>;
  onItemClick: (e: React.MouseEvent, index: number, img: LibraryImage) => void;
  onOpenLoupe: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, path: string, index: number) => void;
  onClearSelection?: () => void;
  viewMode?: 'grid' | 'loupe';
  isCollectionMode?: boolean;
  onReorderImages?: (sourcePath: string, targetPath: string, isAfter: boolean) => void;
}

export function computeMinimalScrollTop({
  activeImageIndex,
  numColumns,
  itemHeight,
  gap = 12,
  paddingTop = 24,
  paddingBottom = 24,
  containerHeight,
  currentScrollTop,
}: {
  activeImageIndex: number;
  numColumns: number;
  itemHeight: number;
  gap?: number;
  paddingTop?: number;
  paddingBottom?: number;
  containerHeight: number;
  currentScrollTop: number;
}): number {
  if (activeImageIndex < 0 || containerHeight <= 0) {
    return currentScrollTop;
  }

  const rowHeight = itemHeight + gap;
  const activeRow = Math.floor(activeImageIndex / numColumns);
  const rowTop = activeRow * rowHeight + paddingTop;
  const rowBottom = rowTop + itemHeight;

  const viewportTop = currentScrollTop;
  const viewportBottom = currentScrollTop + containerHeight;

  // 1. If already fully visible within the viewport, do NOT move at all
  if (rowTop >= viewportTop && rowBottom <= viewportBottom) {
    return currentScrollTop;
  }

  // 2. If below viewport, scroll down just enough so it sits in the bottom line
  if (rowBottom > viewportBottom) {
    return Math.max(0, rowBottom - containerHeight + paddingBottom);
  }

  // 3. If above viewport, scroll up just enough so it sits in the top line
  if (rowTop < viewportTop) {
    return Math.max(0, rowTop - paddingTop);
  }

  return currentScrollTop;
}

export const LibraryGrid = React.memo(function LibraryGrid({
  displayedImages,
  activeImageIndex,
  selectedPaths,
  onItemClick,
  onOpenLoupe,
  onContextMenu,
  onClearSelection,
  viewMode = 'grid',
  isCollectionMode = false,
  onReorderImages,
}: LibraryGridProps) {
  const { t } = useTranslation('library');
  const gridThumbnailSize = useLibraryUIStore((s) => s.gridThumbnailSize);
  const setGridScrollTop = useLibraryUIStore((s) => s.setGridScrollTop);
  const setGridColumns = useLibraryUIStore((s) => s.setGridColumns);
  const scanState = useLibraryStore((s) => s.scanState);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Sprint 1: Speculative RAM Viewport Caching refs & buffer counts
  const [topCount, setTopCount] = useState<number>(0);
  const [bottomCount, setBottomCount] = useState<number>(0);
  const lastScrollTopRef = useRef<number>(0);
  const scrollDirectionRef = useRef<'down' | 'up'>('down');
  const warmupTokenRef = useRef<number>(0);
  const warmupActiveRef = useRef<boolean>(false);
  const warmupTimerRef = useRef<number | null>(null);
  const scale = gridThumbnailSize <= 130 ? 0 : gridThumbnailSize > 220 ? 2 : 1;

  // Listen for background warmup progress events from Rust
  useEffect(() => {
    const unlistenPromise = listen<{
      token: number;
      tag: string;
      current: number;
      total: number;
    }>('warmup-progress', (event) => {
      if (event.payload.token !== warmupTokenRef.current) return;
      if (event.payload.tag === 'grid-top') {
        setTopCount(event.payload.current);
      } else if (event.payload.tag === 'grid-bottom') {
        setBottomCount(event.payload.current);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Clear buffer counts when leaving grid view
  useEffect(() => {
    if (viewMode !== 'grid') {
      setTopCount(0);
      setBottomCount(0);
    }
  }, [viewMode]);

  // Drag and Drop reordering state (active only when in collection view)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const dragSourcePathRef = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent, path: string) => {
    const pathsToDrag = selectedPaths.has(path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [path];

    useCollectionsStore.getState().setDraggedPhotoPaths(pathsToDrag);
    const json = JSON.stringify(pathsToDrag);
    e.dataTransfer.setData('text/plain', json);
    e.dataTransfer.setData('application/json', json);
    e.dataTransfer.effectAllowed = 'copyMove';
    dragSourcePathRef.current = path;
  };

  const handleDragOver = (e: React.DragEvent, path: string) => {
    if (!isCollectionMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = (e.clientX - rect.left) > (rect.width / 2);
    const pos = isAfter ? 'after' : 'before';

    if (dragOverPath !== path || dropPosition !== pos) {
      setDragOverPath(path);
      setDropPosition(pos);
    }
  };

  const handleDragLeave = (e: React.DragEvent, path: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverPath === path) {
        setDragOverPath(null);
        setDropPosition(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    if (!isCollectionMode) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = dropPosition ? dropPosition === 'after' : (e.clientX - rect.left) > (rect.width / 2);

    const sourcePath = dragSourcePathRef.current || useCollectionsStore.getState().draggedPhotoPaths?.[0];

    setDragOverPath(null);
    setDropPosition(null);
    dragSourcePathRef.current = null;
    useCollectionsStore.getState().setDraggedPhotoPaths(null);

    if (sourcePath && onReorderImages) {
      onReorderImages(sourcePath, targetPath, isAfter);
    }
  };

  const handleDragEnd = () => {
    setDragOverPath(null);
    setDropPosition(null);
    dragSourcePathRef.current = null;
    useCollectionsStore.getState().setDraggedPhotoPaths(null);
  };

  // Dynamic Grid Math: responsive column count & precise row height
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      return Math.max(400, window.innerWidth - 300);
    }
    return 1200;
  });

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setContainerWidth((prev) => (Math.abs(prev - w) >= 2 ? w : prev));
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Available width inside padding (p-6 = 24px left + 24px right = 48px)
  const paddingX = 48;
  const gap = 12; // gap-3 = 12px
  const targetWidth = gridThumbnailSize;
  const availableWidth = Math.max(100, containerWidth - paddingX);

  // Responsive number of columns based on container width with hysteresis
  const rawRatio = (availableWidth + gap) / (targetWidth + gap);
  const lastColsRef = useRef<number>(1);
  const numColumns = useMemo(() => {
    const last = lastColsRef.current;
    let cols: number;
    if (last > 1 && rawRatio < last && rawRatio >= last - 0.05) {
      // 5% hysteresis deadband prevents oscillating when container width fluctuates near an integer boundary
      cols = last;
    } else {
      cols = Math.max(1, Math.floor(rawRatio));
    }
    lastColsRef.current = cols;
    return cols;
  }, [rawRatio]);
  const totalGaps = (numColumns - 1) * gap;
  const itemWidth = (availableWidth - totalGaps) / numColumns;
  const itemHeight = itemWidth * (2 / 3); // 3:2 aspect ratio

  const rowCount = Math.ceil(displayedImages.length / numColumns);

  // Sync dynamic column count to store for accurate keyboard navigation (Arrow Up/Down)
  useEffect(() => {
    setGridColumns(numColumns);
  }, [numColumns, setGridColumns]);

  // Reset scroll to 0 whenever folder or collection changes
  const prevFolderKeyRef = useRef<string | null>(null);
  const activeFolderPath = useLibraryStore((s) => s.activeFolderPath);
  const isViewingLastImport = useLibraryStore((s) => s.isViewingLastImport);
  const activeCollectionId = useCollectionsStore((s) => s.activeCollectionId);

  useEffect(() => {
    const key = `${activeFolderPath}::${isViewingLastImport}::${activeCollectionId}`;
    if (prevFolderKeyRef.current !== null && prevFolderKeyRef.current !== key) {
      if (gridContainerRef.current) {
        gridContainerRef.current.scrollTop = 0;
      }
      setGridScrollTop(0);
    }
    prevFolderKeyRef.current = key;
  }, [activeFolderPath, isViewingLastImport, activeCollectionId, setGridScrollTop]);

  // Adaptive overscan: High-density grids (>8 cols) use 1 row buffer (saves 30-60 offscreen images per stop)
  const adaptiveOverscan = numColumns > 8 ? 1 : 2;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => gridContainerRef.current,
    estimateSize: () => itemHeight,
    getItemKey: (index) => {
      const firstImg = displayedImages[index * numColumns];
      return firstImg ? firstImg.path : index;
    },
    gap,
    overscan: adaptiveOverscan,
    isScrollingResetDelay: 100,
  });

  // When scan completes or final sorted images commit, force virtualizer to remeasure and re-sync
  // immediately so all rows reflect final sorted order without requiring manual scrolling
  const prevScanStateRef = useRef(scanState);
  const prevDisplayedImagesRef = useRef(displayedImages);
  useLayoutEffect(() => {
    const wasScanning = prevScanStateRef.current === 'scanning' || prevScanStateRef.current === 'connecting';
    const isNowDone = scanState === 'completed' || scanState === 'idle';
    const imagesChangedWhileDone = isNowDone && prevDisplayedImagesRef.current !== displayedImages;

    if ((wasScanning && isNowDone) || imagesChangedWhileDone) {
      rowVirtualizer.measure();
    }
    prevScanStateRef.current = scanState;
    prevDisplayedImagesRef.current = displayedImages;
  }, [scanState, displayedImages, rowVirtualizer]);

  // On initial mount of the app, restore saved scroll position if any
  const hasInitialScrolledRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasInitialScrolledRef.current && displayedImages.length > 0) {
      hasInitialScrolledRef.current = true;
      const el = gridContainerRef.current;
      if (!el) return;

      const savedScroll = useLibraryUIStore.getState().gridScrollTop;
      if (savedScroll > 0) {
        el.scrollTop = savedScroll;
      }
    }
  }, [displayedImages.length]);

  // Transition from Loupe View back to Grid View:
  // Check if the active image is still within the visible grid viewport.
  // If yes: 0px movement (grid remains completely frozen).
  // If no: scroll minimally to place the image in the last line (if below) or first line (if above).
  const prevViewModeRef = useRef(viewMode);
  useLayoutEffect(() => {
    if (prevViewModeRef.current === 'loupe' && viewMode === 'grid') {
      const el = gridContainerRef.current;
      if (el && displayedImages.length > 0 && activeImageIndex >= 0) {
        rowVirtualizer.measure();

        const containerHeight = el.clientHeight > 0 ? el.clientHeight : (window.innerHeight - 200);
        const currentScroll = el.scrollTop;

        const nextScroll = computeMinimalScrollTop({
          activeImageIndex,
          numColumns,
          itemHeight,
          gap,
          paddingTop: 24,
          paddingBottom: 24,
          containerHeight,
          currentScrollTop: currentScroll,
        });

        if (nextScroll !== currentScroll) {
          el.scrollTop = nextScroll;
          setGridScrollTop(nextScroll);
        }
      }
    }
    prevViewModeRef.current = viewMode;
  }, [viewMode, activeImageIndex, numColumns, itemHeight, gap, displayedImages.length, rowVirtualizer, setGridScrollTop]);

  const prevColumnsRef = useRef(numColumns);
  const prevItemHeightRef = useRef(itemHeight);

  // Synchronously recalculate layout when resizing (Zoom Slider or window resize)
  // and keep the active image in view with minimal scroll delta
  useLayoutEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const oldCols = prevColumnsRef.current;
    const oldItemH = prevItemHeightRef.current;

    // Trigger on column change or significant itemHeight change (>0.5px)
    if (oldCols !== numColumns || Math.abs(oldItemH - itemHeight) > 0.5) {
      if (displayedImages.length === 0) {
        prevColumnsRef.current = numColumns;
        prevItemHeightRef.current = itemHeight;
        return;
      }

      rowVirtualizer.measure();

      const containerHeight = el.clientHeight > 0 ? el.clientHeight : (window.innerHeight - 200);
      const newScrollTop = computeMinimalScrollTop({
        activeImageIndex,
        numColumns,
        itemHeight,
        gap,
        paddingTop: 24,
        paddingBottom: 24,
        containerHeight,
        currentScrollTop: el.scrollTop,
      });

      if (newScrollTop !== el.scrollTop) {
        el.scrollTop = newScrollTop;
        setGridScrollTop(newScrollTop);
      }

      prevColumnsRef.current = numColumns;
      prevItemHeightRef.current = itemHeight;
    }
  }, [itemHeight, numColumns, gap, activeImageIndex, rowVirtualizer, setGridScrollTop, displayedImages.length]);

  // Track user-initiated mouse clicks to prevent auto-scroll when clicking thumbnails
  const isMouseSelectionRef = useRef(false);
  const mouseSelectionTimeRef = useRef(0);

  // Auto-scroll active thumbnail into view with minimal scroll when navigating with keyboard/auto-advance in Grid View
  const prevActiveIndexRef = useRef(activeImageIndex);
  useEffect(() => {
    // If the selection was triggered by a mouse/pointer click, do NOT auto-scroll!
    const isRecentMouseClick = isMouseSelectionRef.current || (Date.now() - mouseSelectionTimeRef.current < 200);
    isMouseSelectionRef.current = false;
    mouseSelectionTimeRef.current = 0;
    if (isRecentMouseClick) {
      prevActiveIndexRef.current = activeImageIndex;
      return;
    }

    if (viewMode === 'grid' && prevActiveIndexRef.current !== activeImageIndex) {
      prevActiveIndexRef.current = activeImageIndex;
      const el = gridContainerRef.current;
      if (el && displayedImages.length > 0 && activeImageIndex >= 0) {
        const containerHeight = el.clientHeight > 0 ? el.clientHeight : (window.innerHeight - 200);
        const nextScroll = computeMinimalScrollTop({
          activeImageIndex,
          numColumns,
          itemHeight,
          gap,
          paddingTop: 24,
          paddingBottom: 24,
          containerHeight,
          currentScrollTop: el.scrollTop,
        });
        if (nextScroll !== el.scrollTop) {
          el.scrollTop = nextScroll;
          setGridScrollTop(nextScroll);
        }
      }
    } else {
      prevActiveIndexRef.current = activeImageIndex;
    }
  }, [activeImageIndex, viewMode, numColumns, itemHeight, gap, displayedImages.length, setGridScrollTop]);

  // Sprint 1: Speculative RAM Viewport Caching
  // Debounce 150ms after scroll settles to warm up thumbnails in scroll direction
  useEffect(() => {
    // Absoluter Schutz: Niemals spekulatives Warmup während eines aktiven Scans!
    if (viewMode !== 'grid' || displayedImages.length === 0 || scanState === 'scanning' || scanState === 'connecting') return;

    if (rowVirtualizer.isScrolling) {
      // Scrolling in progress - invalidate active warmup job immediately and clear buffer counts
      setTopCount((c) => (c === 0 ? c : 0));
      setBottomCount((c) => (c === 0 ? c : 0));
      if (warmupActiveRef.current) {
        warmupActiveRef.current = false;
        warmupTokenRef.current = Date.now();
        invoke('cancel_warmup_cache').catch(() => {});
      }
      if (warmupTimerRef.current !== null) {
        window.clearTimeout(warmupTimerRef.current);
        warmupTimerRef.current = null;
      }
      return;
    }

    // 150ms idle debounce
    warmupTimerRef.current = window.setTimeout(() => {
      warmupTimerRef.current = null;
      const virtualItems = rowVirtualizer.getVirtualItems();
      if (virtualItems.length === 0) return;

      const firstRowIndex = virtualItems[0].index;
      const lastRowIndex = virtualItems[virtualItems.length - 1].index;

      const isScrollingDown = scrollDirectionRef.current === 'down';

      // Lookahead rows:
      // In scroll direction: +3 rows
      // Against scroll direction: -1 row
      const topRowIndices: number[] = [];
      const bottomRowIndices: number[] = [];

      if (isScrollingDown) {
        // Forward rows (+3 rows ahead downwards)
        for (let r = lastRowIndex + 1; r <= lastRowIndex + 3 && r < rowCount; r++) {
          bottomRowIndices.push(r);
        }
        // Backward buffer (-1 row behind upwards)
        if (firstRowIndex > 0) {
          topRowIndices.push(firstRowIndex - 1);
        }
      } else {
        // Forward rows (-3 rows ahead upwards)
        for (let r = firstRowIndex - 1; r >= Math.max(0, firstRowIndex - 3); r--) {
          topRowIndices.push(r);
        }
        // Backward buffer (+1 row behind downwards)
        if (lastRowIndex + 1 < rowCount) {
          bottomRowIndices.push(lastRowIndex + 1);
        }
      }

      // Collect images in target rows
      const topPaths: string[] = [];
      for (const r of topRowIndices) {
        const startIndex = r * numColumns;
        const endIndex = Math.min(displayedImages.length, startIndex + numColumns);
        for (let i = startIndex; i < endIndex; i++) {
          const img = displayedImages[i];
          if (img) topPaths.push(img.path);
        }
      }

      const bottomPaths: string[] = [];
      for (const r of bottomRowIndices) {
        const startIndex = r * numColumns;
        const endIndex = Math.min(displayedImages.length, startIndex + numColumns);
        for (let i = startIndex; i < endIndex; i++) {
          const img = displayedImages[i];
          if (img) bottomPaths.push(img.path);
        }
      }

      if (topPaths.length === 0 && bottomPaths.length === 0) return;

      const token = Date.now();
      warmupTokenRef.current = token;
      warmupActiveRef.current = true;

      Promise.all([
        topPaths.length > 0
          ? invoke('warm_thumbnail_cache', { paths: topPaths, scale, token, tag: 'grid-top' })
          : Promise.resolve(0),
        bottomPaths.length > 0
          ? invoke('warm_thumbnail_cache', { paths: bottomPaths, scale, token, tag: 'grid-bottom' })
          : Promise.resolve(0),
      ])
        .catch(() => {})
        .finally(() => {
          warmupActiveRef.current = false;
        });
    }, 150);

    return () => {
      if (warmupTimerRef.current !== null) {
        window.clearTimeout(warmupTimerRef.current);
        warmupTimerRef.current = null;
      }
    };
  }, [
    rowVirtualizer.isScrolling,
    viewMode,
    displayedImages.length,
    numColumns,
    rowCount,
    scale,
    scanState,
  ]);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      <div 
        ref={gridContainerRef} 
        style={{ scrollbarGutter: 'stable' }}
        className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative [scrollbar-gutter:stable]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClearSelection?.();
        }
      }}
      onScroll={(e) => {
        const currentScrollTop = e.currentTarget.scrollTop;
        if (currentScrollTop > lastScrollTopRef.current) {
          scrollDirectionRef.current = 'down';
        } else if (currentScrollTop < lastScrollTopRef.current) {
          scrollDirectionRef.current = 'up';
        }
        lastScrollTopRef.current = currentScrollTop;

        // Invalidate active background warmup only when warmup is active; never during scan
        const isScanning = scanState === 'scanning' || scanState === 'connecting';
        if (!isScanning && warmupActiveRef.current) {
          warmupActiveRef.current = false;
          warmupTokenRef.current = Date.now();
          invoke('cancel_warmup_cache').catch(() => {});
        }
        if (warmupTimerRef.current !== null) {
          window.clearTimeout(warmupTimerRef.current);
          warmupTimerRef.current = null;
        }
        setTopCount((c) => (c === 0 ? c : 0));
        setBottomCount((c) => (c === 0 ? c : 0));

        setGridScrollTop(currentScrollTop);
      }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      {displayedImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-txt-tertiary text-sm gap-2">
          <div className="font-medium text-txt-secondary">
            {isCollectionMode ? t('collections.emptyCollection', { defaultValue: 'Diese Sammlung ist leer.' }) : t('empty')}
          </div>
          {isCollectionMode && (
            <div className="text-xs text-txt-tertiary text-center max-w-sm">
              {t('collections.emptyCollectionHint', { defaultValue: 'Ziehe Fotos hierher oder in die Seitenleiste, um sie hinzuzufügen.' })}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClearSelection?.();
            }
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
                  const isSelected = selectedPaths.has(img.path);
                  const isActive = isSelected && activeImageIndex === globalIdx;
                  const isTarget = isCollectionMode && dragOverPath === img.path;

                  return (
                    <GridThumbnailItem
                      key={img.path}
                      img={img}
                      isActive={isActive}
                      isSelected={isSelected}
                      isScrolling={rowVirtualizer.isScrolling}
                      onClick={(e) => {
                        isMouseSelectionRef.current = true;
                        mouseSelectionTimeRef.current = Date.now();
                        onItemClick(e, globalIdx, img);
                      }}
                      onDoubleClick={() => onOpenLoupe(globalIdx)}
                      onContextMenu={(e) => {
                        isMouseSelectionRef.current = true;
                        mouseSelectionTimeRef.current = Date.now();
                        onContextMenu(e, img.path, globalIdx);
                      }}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, img.path)}
                      onDragOver={(e) => handleDragOver(e, img.path)}
                      onDragLeave={(e) => handleDragLeave(e, img.path)}
                      onDrop={(e) => handleDrop(e, img.path)}
                      onDragEnd={handleDragEnd}
                      isDropTarget={isTarget}
                      dropPosition={isTarget ? dropPosition : null}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Top RAM Cache Buffer Bubble */}
      {topCount > 0 && (
        <div 
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white/90 shadow-lg select-none transition-opacity duration-200"
          title={`${topCount} ${topCount === 1 ? 'Bild' : 'Bilder'} oberhalb im RAM-Cache`}
        >
          <span className="text-[9px] text-accent">▲</span>
          <span>{topCount}</span>
        </div>
      )}

      {/* Bottom RAM Cache Buffer Bubble */}
      {bottomCount > 0 && (
        <div 
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white/90 shadow-lg select-none transition-opacity duration-200"
          title={`${bottomCount} ${bottomCount === 1 ? 'Bild' : 'Bilder'} unterhalb im RAM-Cache`}
        >
          <span className="text-[9px] text-accent">▼</span>
          <span>{bottomCount}</span>
        </div>
      )}
    </div>
  );
});
