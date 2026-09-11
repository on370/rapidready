import React, { useRef, useState, useEffect } from 'react';
import { 
  LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, Check, 
  Rocket, FolderOpen, ZoomIn, ZoomOut, RotateCw, RotateCcw, 
  SquareArrowOutUpRight, CircleSlash, Tag, ChevronDown, X 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { LibraryImage, useLibraryStore } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { HelpPopover } from '../../../ui/HelpPopover';
import { COLOR_PALETTE, getColorConfig } from '../../../../constants/culling';
import { normalizeSlash } from '../../../../utils/image';
import { isMac, modSymbol, shiftSymbol } from '../../../../utils/platform';

export interface CullingToolbarProps {
  activeImage: LibraryImage | undefined;
  displayedImages: LibraryImage[];
  availableTags: Array<{ name: string; count: number }>;
  colorCounts: Map<string, number>;
  ratingCounts: number[];
  rejectedCount: number;
  handleCulling: (flag: number | null, rating: number) => void;
  handleSetColor: (color: string | null) => void;
  handleRotate: (direction: 'cw' | 'ccw') => void;
  handleDeleteRejected: () => void;
  toggleInspector: () => void;
}

export const CullingToolbar = React.memo(function CullingToolbar({
  activeImage,
  displayedImages,
  availableTags,
  colorCounts,
  ratingCounts,
  rejectedCount,
  handleCulling,
  handleSetColor,
  handleRotate,
  handleDeleteRejected,
  toggleInspector,
}: CullingToolbarProps) {
  const { t } = useTranslation('library');

  // Domain Store
  const {
    activeFolderPath,
    isViewingLastImport,
    filterMode,
    setFilterMode,
    selectedRatingFilter,
    setSelectedRatingFilter,
    selectedColorFilter,
    setSelectedColorFilter,
    selectedTagFilter,
    setSelectedTagFilter,
    selectedPaths,
  } = useLibraryStore();

  // UI Store
  const {
    viewMode,
    setViewMode,
    autoAdvance,
    setAutoAdvance,
    gridThumbnailSize,
    setGridThumbnailSize,
    loupeScale,
    setLoupeScale,
  } = useLibraryUIStore();

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

  return (
    <>
      {/* 1. Header Bar: Title, Stats, AutoAdvance, Zoom, View Mode */}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-txt-primary truncate max-w-[400px]">
            {isViewingLastImport ? t('header.lastImport') : activeFolderPath ? normalizeSlash(activeFolderPath).split('/').pop() : t('header.allImages')}
          </h2>
          <p className="text-xs text-txt-tertiary mt-0.5">
            {displayedImages.length} {t('previewFiles', 'files')} · {(displayedImages.reduce((acc, img) => acc + img.size, 0) / (1024 * 1024)).toFixed(1)} MB
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Auto-Advance Toggle */}
          <button 
            onClick={() => setAutoAdvance(!autoAdvance)} 
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
              autoAdvance 
                ? 'bg-warning/15 border-warning/30 text-warning hover:bg-warning/25' 
                : 'bg-app-card border-app-border text-txt-tertiary hover:text-txt-secondary hover:border-app-border-hover'
            }`}
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

      {/* 2. Filter Bar: All/Picks/Rejects + Rating, Color, Tag Dropdowns */}
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
                className="w-3 h-3 rounded-full ring-1 ring-white/20 flex-shrink-0"
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
            <div className="absolute top-full left-0 mt-1 w-44 rounded-lg bg-[#18181b] border border-app-border shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
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
                  <CircleSlash className="w-3.5 h-3.5 opacity-60" />
                  <span>{t('filters.allColors')}</span>
                </div>
                {selectedColorFilter === null && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>

              <div className="h-px bg-app-border my-1" />

              {COLOR_PALETTE.map(c => {
                const count = colorCounts.get(c.id) || 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedColorFilter(c.id);
                      setIsColorFilterOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer ${
                      selectedColorFilter === c.id ? 'text-txt-primary font-medium bg-white/5' : 'text-txt-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${c.bg} ring-1 ring-white/20 flex-shrink-0`} />
                      <span>{t(`colors.${c.id}`)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] px-1.5 py-0.2 bg-white/5 border border-white/10 rounded-full text-txt-tertiary">
                        {count}
                      </span>
                      {selectedColorFilter === c.id && <Check className="w-3.5 h-3.5 text-accent" />}
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
              <Tag className="w-3 h-3 text-accent" />
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
              <Tag className="w-3 h-3 text-txt-tertiary" />
              <span>{t('filters.allTags')}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
          )}

          {/* Tag Dropdown Menu */}
          {isTagFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 max-h-60 overflow-y-auto rounded-lg bg-[#18181b] border border-app-border shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
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
                    <div className="flex items-center gap-2 truncate">
                      <Tag className="w-3 h-3 opacity-50 flex-shrink-0" />
                      <span className="truncate">{tItem.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
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

      {/* 3. Culling Toolbar: Flags P/U/X, Delete, Stars, Color, Rotation, Share */}
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
          {[1, 2, 3, 4, 5].map(s => (
            <button key={s} onClick={() => handleCulling(activeImage?.culling.flag || null, activeImage?.culling.rating === s ? 0 : s)} className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-all cursor-pointer">
              <Star className={`w-3.5 h-3.5 ${(activeImage?.culling.rating || 0) >= s ? 'text-warning fill-warning' : 'text-txt-tertiary'}`} />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-app-border flex-shrink-0"></div>

        {/* Dynamic Color Dot */}
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
    </>
  );
});
