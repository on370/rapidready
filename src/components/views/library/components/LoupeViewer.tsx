import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { ZoomableImage } from '../ZoomableImage';
import { FilmstripBar } from './FilmstripBar';
import { getRrImageUrl } from '../../../../utils/image';

export interface LoupeViewerProps {
  activeImage: LibraryImage | undefined;
  activeImageIndex: number;
  displayedImages: LibraryImage[];
  selectedPaths: Set<string>;
  setActiveImageIndex: (index: number) => void;
  setSelectedPaths: (paths: Set<string>) => void;
  onItemClick: (e: React.MouseEvent, index: number, img: LibraryImage) => void;
  onContextMenu: (e: React.MouseEvent, path: string, index: number) => void;
}

export const LoupeViewer = React.memo(function LoupeViewer({
  activeImage,
  activeImageIndex,
  displayedImages,
  selectedPaths,
  setActiveImageIndex,
  setSelectedPaths,
  onItemClick,
  onContextMenu,
}: LoupeViewerProps) {
  const { t } = useTranslation('library');
  const showFilmstrip = useLibraryUIStore((s) => s.showFilmstrip);
  const setShowFilmstrip = useLibraryUIStore((s) => s.setShowFilmstrip);

  const [debouncedActiveIndex, setDebouncedActiveIndex] = useState(activeImageIndex);

  // Debounce preloading so rapid key-navigation doesn't hammer QuickLook with full-res requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedActiveIndex(activeImageIndex);
    }, 400);
    return () => clearTimeout(timer);
  }, [activeImageIndex]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div 
        className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative"
        onContextMenu={(e) => {
          if (activeImage) {
            onContextMenu(e, activeImage.path, activeImageIndex);
          }
        }}
      >
        {activeImage ? (
          <>
            <ZoomableImage 
              src={getRrImageUrl(activeImage.path, true, activeImage.culling?.orientation)} 
              previewSrc={getRrImageUrl(activeImage.path, false, activeImage.culling?.orientation, 2)}
              alt={activeImage.name} 
              onContextMenu={(e) => {
                onContextMenu(e, activeImage.path, activeImageIndex);
              }}
            />
            
            {/* Preload Previous and Next Full-Res images when navigation pauses */}
            {debouncedActiveIndex === activeImageIndex && (
              <>
                {debouncedActiveIndex > 0 && (
                  <img 
                    src={getRrImageUrl(displayedImages[debouncedActiveIndex - 1].path, true, displayedImages[debouncedActiveIndex - 1].culling?.orientation)} 
                    className="hidden" 
                    alt="" 
                  />
                )}
                {debouncedActiveIndex < displayedImages.length - 1 && (
                  <img 
                    src={getRrImageUrl(displayedImages[debouncedActiveIndex + 1].path, true, displayedImages[debouncedActiveIndex + 1].culling?.orientation)} 
                    className="hidden" 
                    alt="" 
                  />
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
              onItemClick(e, idx, displayedImages[idx]);
            } else {
              setActiveImageIndex(idx);
              if (displayedImages[idx]) {
                setSelectedPaths(new Set([displayedImages[idx].path]));
              }
            }
          }}
          onContextMenu={(e, path, idx) => onContextMenu(e, path, idx)}
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
          <span className="font-semibold text-txt-primary truncate max-w-[200px]" title={activeImage?.name}>
            {activeImage?.name}
          </span>
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
  );
});
