import React, { useRef, useEffect } from 'react';
import { Check, Star, Play } from 'lucide-react';
import { LibraryImage } from '../../../../stores/libraryStore';
import { getRrImageUrl, isRawFilename, isVideoFilename } from '../../../../utils/image';
import { getColorConfig } from '../../../../constants/culling';
import { loadedThumbnailCache } from '../utils/thumbnailCache';

export interface GridThumbnailItemProps {
  img: LibraryImage;
  isActive: boolean;
  isSelected: boolean;
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
  const scale = 1;
  const cacheKey = `${img.path}:${img.culling?.orientation || 1}:${scale}`;
  const isCached = loadedThumbnailCache.has(cacheKey);
  const imgRef = useRef<HTMLImageElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const imgEl = imgRef.current;
    return () => {
      if (imgEl && !imgEl.complete) {
        imgEl.src = '';
      }
    };
  }, []);

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
      <img 
        ref={imgRef}
        draggable={false}
        loading="eager"
        decoding="async"
        src={getRrImageUrl(img.path, false, img.culling?.orientation, scale, img.size, img.mtime)} 
        style={{ opacity: isCached ? 1 : 0 }}
        className="w-full h-full object-contain relative z-10 pointer-events-none" 
        alt="" 
        onLoad={(e) => {
          loadedThumbnailCache.add(cacheKey);
          e.currentTarget.style.opacity = '1';
          if (placeholderRef.current) {
            placeholderRef.current.style.display = 'none';
          }
        }}
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          target.style.opacity = '0';
          const retryCount = Number(target.dataset.retryCount || 0);
          if (retryCount < 6) {
            target.dataset.retryCount = String(retryCount + 1);
            setTimeout(() => {
              if (imgRef.current) {
                const baseSrc = getRrImageUrl(img.path, false, img.culling?.orientation, scale, img.size, img.mtime);
                imgRef.current.src = `${baseSrc}&retry=${Date.now()}`;
              }
            }, 250 * (retryCount + 1));
          }
        }}
      />
      <div 
        ref={placeholderRef}
        style={{ display: isCached ? 'none' : 'flex' }}
        className="absolute inset-0 bg-[#161619] items-center justify-center pointer-events-none z-10"
      >
        <div className="w-6 h-6 rounded-md bg-white/[0.03]" />
      </div>
      {/* Format Badge: Video vs RAW vs JPG */}
      <div className="absolute top-1.5 left-1.5 z-20 pointer-events-none">
        {isVideo ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold tracking-wide bg-black/80 text-accent border border-accent/40 shadow-sm backdrop-blur-xs flex items-center gap-1">
            <Play className="w-2.5 h-2.5 fill-accent text-accent" />
            {img.name.split('.').pop()?.toUpperCase() || 'VID'}
          </span>
        ) : isRaw ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold tracking-wide bg-black/80 text-white/95 border border-white/20 shadow-sm backdrop-blur-xs">
            RAW
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold tracking-wide bg-black/80 text-white/95 border border-white/20 shadow-sm backdrop-blur-xs">
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
