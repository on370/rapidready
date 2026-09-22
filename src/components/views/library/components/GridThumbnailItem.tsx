import React, { useRef, useState, useEffect } from 'react';
import { Check, Star, Play } from 'lucide-react';
import { LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { getRrImageUrl, isRawFilename, isVideoFilename } from '../../../../utils/image';
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
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
  dropPosition?: 'before' | 'after' | null;
}

export const GridThumbnailItem = React.memo(function GridThumbnailItem({
  img,
  isActive,
  isSelected,
  isScrolling = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  draggable = true,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDropTarget = false,
  dropPosition = null,
}: GridThumbnailItemProps) {
  const isVideo = img.is_video ?? isVideoFilename(img.name);
  const isRaw = !isVideo && (img.is_raw ?? isRawFilename(img.name));
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
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden bg-app-card group transition-all select-none ${
        isSelected
          ? isActive 
            ? 'border-accent ring-2 ring-accent shadow-md shadow-accent/10' 
            : 'border-accent/80 ring-2 ring-accent/50 bg-accent/5' 
          : 'border-app-border hover:border-app-border-hover'
      } ${isDropTarget ? 'ring-2 ring-accent/70 scale-[1.01]' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Drop Indicators */}
      {isDropTarget && dropPosition === 'before' && (
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-accent z-30 rounded-r shadow-lg shadow-accent/50 pointer-events-none animate-pulse" />
      )}
      {isDropTarget && dropPosition === 'after' && (
        <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-accent z-30 rounded-l shadow-lg shadow-accent/50 pointer-events-none animate-pulse" />
      )}
      {shouldLoad && (
        <img 
          ref={imgRef}
          draggable={false}
          decoding="async"
          src={getRrImageUrl(img.path, false, img.culling?.orientation, scale)} 
          className={`w-full h-full object-contain relative z-10 transition-opacity duration-150 pointer-events-none ${isCached ? 'opacity-100' : 'opacity-0'}`} 
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
          onError={(e) => {
            // If thumbnail generation failed (e.g. file momentarily locked by external process or mid-write), retry once after a short pause
            const target = e.currentTarget as HTMLImageElement;
            const retryCount = Number(target.dataset.retryCount || 0);
            if (retryCount < 2) {
              target.dataset.retryCount = String(retryCount + 1);
              setTimeout(() => {
                if (imgRef.current) {
                  const baseSrc = getRrImageUrl(img.path, false, img.culling?.orientation, scale);
                  imgRef.current.src = `${baseSrc}&retry=${Date.now()}`;
                }
              }, 600 * (retryCount + 1));
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
      {/* Format Badge: Video vs RAW vs JPG */}
      <div className="absolute top-1.5 left-1.5 z-20 pointer-events-none">
        {isVideo ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold tracking-wide bg-black/75 text-accent border border-accent/40 shadow-sm backdrop-blur-xs flex items-center gap-1">
            <Play className="w-2.5 h-2.5 fill-accent text-accent" />
            {img.name.split('.').pop()?.toUpperCase() || 'VID'}
          </span>
        ) : isRaw ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold tracking-wide bg-black/60 text-white/90 border border-white/15 shadow-sm backdrop-blur-xs">
            RAW
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium tracking-wide bg-black/40 text-txt-tertiary border border-white/5 shadow-sm backdrop-blur-xs">
            {img.name.split('.').pop()?.toUpperCase() || 'JPG'}
          </span>
        )}
      </div>

      <div className={`absolute top-1 right-1 flex gap-1 z-20 transition-opacity ${img.culling.flag !== 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {img.culling.flag === 1 && <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center shadow"><Check className="w-3 h-3 text-white" /></div>}
        {img.culling.flag === -1 && <div className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-[10px] font-bold text-white shadow">X</div>}
      </div>
      {img.culling.rating > 0 && (
        <div className="absolute bottom-1 left-1 flex z-20">
          {Array.from({length: img.culling.rating}).map((_, i) => <Star key={i} className="w-3 h-3 text-warning fill-warning" />)}
        </div>
      )}
      {img.culling.color && (
        <div className="absolute bottom-1 right-1 flex pointer-events-none z-20">
          <span className={`w-2 h-2 rounded-full shadow ${getColorConfig(img.culling.color)?.bg || 'bg-transparent'}`} />
        </div>
      )}
      {img.culling.flag === -1 && <div className="absolute inset-0 bg-danger/25 pointer-events-none z-[15]" />}
    </div>
  );
});
