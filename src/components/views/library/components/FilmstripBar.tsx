import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { FilmstripThumbnailItem } from './FilmstripThumbnailItem';

export interface FilmstripBarProps {
  displayedImages: LibraryImage[];
  activeImageIndex: number;
  selectedPaths: Set<string>;
  onSelect: (index: number, e?: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, path: string, index: number) => void;
}

export const FilmstripBar = React.memo(function FilmstripBar({
  displayedImages,
  activeImageIndex,
  selectedPaths,
  onSelect,
  onContextMenu,
}: FilmstripBarProps) {
  const { t } = useTranslation('library');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  const { filmstripHeight, setFilmstripHeight } = useLibraryUIStore();

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
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, filmstripHeight, setFilmstripHeight]);

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
