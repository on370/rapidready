import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLibraryStore, LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { GridThumbnailItem } from './GridThumbnailItem';

export interface LibraryGridProps {
  displayedImages: LibraryImage[];
  activeImageIndex: number;
  selectedPaths: Set<string>;
  onItemClick: (e: React.MouseEvent, index: number, img: LibraryImage) => void;
  onOpenLoupe: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, path: string, index: number) => void;
  viewMode?: 'grid' | 'loupe';
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
  viewMode = 'grid',
}: LibraryGridProps) {
  const { t } = useTranslation('library');
  const gridThumbnailSize = useLibraryUIStore((s) => s.gridThumbnailSize);
  const gridScrollTop = useLibraryUIStore((s) => s.gridScrollTop);
  const setGridScrollTop = useLibraryUIStore((s) => s.setGridScrollTop);
  const setGridColumns = useLibraryUIStore((s) => s.setGridColumns);
  const gridContainerRef = useRef<HTMLDivElement>(null);

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
  }, []);

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

  // Sync dynamic column count to store for accurate keyboard navigation (Arrow Up/Down)
  useEffect(() => {
    setGridColumns(numColumns);
  }, [numColumns, setGridColumns]);

  // Reset scroll to 0 whenever folder or collection changes
  const prevFolderKeyRef = useRef<string | null>(null);
  const activeFolderPath = useLibraryStore((s) => s.activeFolderPath);
  const isViewingLastImport = useLibraryStore((s) => s.isViewingLastImport);

  useEffect(() => {
    const key = `${activeFolderPath}::${isViewingLastImport}`;
    if (prevFolderKeyRef.current !== null && prevFolderKeyRef.current !== key) {
      if (gridContainerRef.current) {
        gridContainerRef.current.scrollTop = 0;
      }
      setGridScrollTop(0);
    }
    prevFolderKeyRef.current = key;
  }, [activeFolderPath, isViewingLastImport, setGridScrollTop]);

  // Adaptive overscan: High-density grids (>8 cols) use 1 row buffer (saves 30-60 offscreen images per stop)
  const adaptiveOverscan = numColumns > 8 ? 1 : 2;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => gridContainerRef.current,
    estimateSize: () => itemHeight,
    gap,
    overscan: adaptiveOverscan,
    isScrollingResetDelay: 100,
  });

  // On initial mount of the app, restore saved scroll position if any
  const hasInitialScrolledRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasInitialScrolledRef.current && displayedImages.length > 0) {
      hasInitialScrolledRef.current = true;
      const el = gridContainerRef.current;
      if (!el) return;

      if (gridScrollTop > 0) {
        el.scrollTop = gridScrollTop;
      }
    }
  }, [displayedImages.length, gridScrollTop]);

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
      if (displayedImages.length === 0) return;

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

  // Auto-scroll active thumbnail into view with minimal scroll when navigating in Grid View
  const prevActiveIndexRef = useRef(activeImageIndex);
  useEffect(() => {
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

  return (
    <div 
      ref={gridContainerRef} 
      className="flex-1 overflow-auto p-6 relative"
      onScroll={(e) => {
        setGridScrollTop(e.currentTarget.scrollTop);
      }}
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
                      onClick={(e) => onItemClick(e, globalIdx, img)}
                      onDoubleClick={() => onOpenLoupe(globalIdx)}
                      onContextMenu={(e) => onContextMenu(e, img.path, globalIdx)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
