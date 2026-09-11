import React, { useRef, useState, useEffect } from 'react';
import { Check, Star } from 'lucide-react';
import { LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { getRrImageUrl } from '../../../../utils/image';
import { getColorConfig } from '../../../../constants/culling';
import { loadedThumbnailCache } from '../utils/thumbnailCache';

export interface GridThumbnailItemProps {
  img: LibraryImage;
  isActive: boolean;
  isSelected: boolean;
  isScrolling?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const GridThumbnailItem = React.memo(function GridThumbnailItem({
  img,
  isActive,
  isSelected,
  isScrolling = false,
  onClick,
  onDoubleClick,
  onContextMenu,
}: GridThumbnailItemProps) {
  const gridThumbnailSize = useLibraryUIStore((s) => s.gridThumbnailSize);
  const scale = gridThumbnailSize <= 130 ? 0 : gridThumbnailSize > 220 ? 2 : 1;
  const cacheKey = `${img.path}:${img.culling?.orientation || 1}:${scale}`;
  const isCached = loadedThumbnailCache.has(cacheKey);
  const [shouldLoad, setShouldLoad] = useState(isCached || !isScrolling);
  const imgRef = useRef<HTMLImageElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);

  // When scrolling settles, start loading immediately (no redundant timer)
  useEffect(() => {
    if (!shouldLoad && !isScrolling) {
      setShouldLoad(true);
    }
  }, [isScrolling, shouldLoad]);

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
          decoding="async"
          src={getRrImageUrl(img.path, false, img.culling?.orientation, scale)} 
          className={`w-full h-full object-contain relative z-10 transition-opacity duration-150 ${isCached ? 'opacity-100' : 'opacity-0'}`} 
          alt={img.name} 
          onLoad={(e) => {
            loadedThumbnailCache.add(cacheKey);
            const target = e.currentTarget as HTMLImageElement;
            target.classList.remove('opacity-0');
            target.classList.add('opacity-100');
            if (placeholderRef.current) {
              placeholderRef.current.style.display = 'none';
            }
          }}
        />
      )}
      <div 
        ref={placeholderRef}
        style={{ display: isCached ? 'none' : 'flex' }}
        className="absolute inset-0 bg-[#161619] items-center justify-center pointer-events-none z-0"
      >
        <div className="w-6 h-6 rounded-md bg-white/[0.03]" />
      </div>
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
