import React, { useState, useEffect } from 'react';
import { Check, Star } from 'lucide-react';
import { LibraryImage } from '../../../../stores/libraryStore';
import { getRrImageUrl, isRawFilename } from '../../../../utils/image';
import { getColorConfig } from '../../../../constants/culling';
import { loadedThumbnailCache } from '../utils/thumbnailCache';

export interface FilmstripThumbnailItemProps {
  img: LibraryImage;
  isActive: boolean;
  isSelected: boolean;
  thumbWidth: number;
  thumbHeight: number;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const FilmstripThumbnailItem = React.memo(function FilmstripThumbnailItem({
  img,
  isActive,
  isSelected,
  thumbWidth,
  thumbHeight,
  onClick,
  onContextMenu,
}: FilmstripThumbnailItemProps) {
  const isRaw = img.is_raw ?? isRawFilename(img.name);
  const cacheKey = `${img.path}:${img.culling?.orientation || 1}:1`;
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
        src={getRrImageUrl(img.path, false, img.culling?.orientation, 1)} 
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
      {/* Format Badge: RAW vs JPG */}
      <div className="absolute top-1 left-1 pointer-events-none z-10">
        {isRaw ? (
          <span className="px-1 py-0.2 rounded text-[8px] font-mono font-semibold tracking-wider bg-black/70 text-white/90 border border-white/15 shadow-sm leading-tight inline-block">
            RAW
          </span>
        ) : (
          <span className="px-1 py-0.2 rounded text-[8px] font-mono font-medium tracking-wider bg-black/50 text-txt-tertiary border border-white/5 shadow-sm leading-tight inline-block">
            JPG
          </span>
        )}
      </div>

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
