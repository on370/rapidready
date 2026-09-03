import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, ChevronLeft, ChevronRight, Check, Rocket, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "../../../stores/libraryStore";
import { ZoomableImage } from "./ZoomableImage";
import { HelpPopover } from "../../ui/HelpPopover";
import { useEffect, useCallback, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";

interface LibraryCenterProps {
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  toggleInspector: () => void;
}

export function LibraryCenter({ viewMode, setViewMode, toggleInspector }: LibraryCenterProps) {
  const { t } = useTranslation('library');
  const { 
    images, activeImageIndex, setActiveImageIndex, autoAdvance, 
    updateCullingState, activeFolderPath, filterMode, setFilterMode,
    lastImportPaths, isViewingLastImport 
  } = useLibraryStore();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showActionIcons, setShowActionIcons] = useState(false);

  // Measure toolbar container width directly (not screen width!)
  useEffect(() => {
    if (!toolbarRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Show icons when toolbar has at least 630px (compact, natural gap to Delete button)
        setShowActionIcons(entry.contentRect.width >= 630);
      }
    });
    observer.observe(toolbarRef.current);
    return () => observer.disconnect();
  }, []);

  const scopedImages = isViewingLastImport
    ? images.filter(img => lastImportPaths.includes(img.path))
    : activeFolderPath 
      ? images.filter(img => img.path.startsWith(activeFolderPath)) 
      : images;

  const displayedImages = scopedImages.filter(img => {
    if (filterMode === 'picks') return img.culling.flag === 1;
    if (filterMode === 'rejected') return img.culling.flag === -1;
    if (filterMode.startsWith('rated')) {
      const minStars = parseInt(filterMode.replace('rated', '')) || 1;
      return img.culling.rating >= minStars;
    }
    return true; // 'all'
  });
  const activeImage = displayedImages[activeImageIndex];

  const handleCulling = useCallback((flag: number | null, rating: number) => {
    if (!activeImage) return;
    
    // Update local state instantly
    const globalIndex = images.findIndex(img => img.path === activeImage.path);
    if (globalIndex !== -1) updateCullingState(globalIndex, { flag, rating });
    
    // Persist to sidecar
    invoke('set_culling_state', { 
      path: activeImage.path,
      flag,
      rating,
      color: activeImage.culling.color
    }).catch(console.error);

    // Auto-advance if enabled and a flag was set
    if (autoAdvance && flag !== null && activeImageIndex < displayedImages.length - 1) {
      setActiveImageIndex(activeImageIndex + 1);
    }
  }, [activeImage, activeImageIndex, displayedImages.length, autoAdvance, images, updateCullingState, setActiveImageIndex]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if an input/textarea is focused
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      
      // Shortcut: Cmd + Shift + F -> Reveal in Finder
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (activeImage) {
          invoke('show_in_finder', { path: activeImage.path });
        }
        return;
      }

      // Shortcut: R -> Open in RapidRAW
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (activeImage) {
          invoke('open_in_rapidraw', { path: activeImage.path });
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'j') {
        setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        setActiveImageIndex(Math.max(0, activeImageIndex - 1));
      } else if (e.key === 'ArrowDown') {
        setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + 6));
      } else if (e.key === 'ArrowUp') {
        setActiveImageIndex(Math.max(0, activeImageIndex - 6));
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
               if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
            } else {
               if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImage, activeImageIndex, displayedImages.length, handleCulling, viewMode, setViewMode]);

  useEffect(() => {
    if (viewMode === 'grid') {
      const el = document.getElementById('active-grid-img');
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeImageIndex, viewMode]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-txt-primary truncate max-w-[400px]">
            {isViewingLastImport ? t('header.lastImport') : activeFolderPath ? activeFolderPath.split('/').pop() : t('header.allImages')}
          </h2>
          <p className="text-xs text-txt-tertiary mt-0.5">{displayedImages.length} {t('previewFiles', 'files')} · {(displayedImages.reduce((acc, img) => acc + img.size, 0) / (1024*1024)).toFixed(1)} MB</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Auto-Advance (UI setting - placed left of Grid/Loupe) */}
          <button 
            onClick={() => useLibraryStore.getState().setAutoAdvance(!autoAdvance)} 
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${autoAdvance ? 'bg-warning/15 border-warning/30 text-warning hover:bg-warning/25' : 'bg-app-card border-app-border text-txt-tertiary hover:text-txt-secondary hover:border-app-border-hover'}`}
            title="Auto-Advance nach Bewertung umschalten"
          >
            <Zap className={`w-3.5 h-3.5 ${autoAdvance ? 'fill-warning text-warning' : 'text-txt-tertiary'}`} />
            <span className="hidden sm:inline">Auto-Advance</span>
          </button>

          <div className="w-px h-5 bg-app-border mx-1"></div>

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
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel/60 flex-shrink-0 text-xs">
        <span className="text-txt-tertiary font-medium">Filters:</span>
        <div className="flex items-center gap-1 text-[11px]">
          <button onClick={() => setFilterMode('all')} className={`filter-pill px-2 py-1 rounded-md font-medium ${filterMode === 'all' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:bg-app-hover'}`}>All</button>
          <button onClick={() => setFilterMode('picks')} className={`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 ${filterMode === 'picks' ? 'bg-success/15 text-success' : 'text-txt-tertiary hover:bg-app-hover'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>Picks
          </button>
          <button onClick={() => setFilterMode('rejected')} className={`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 ${filterMode === 'rejected' ? 'bg-danger/15 text-danger' : 'text-txt-tertiary hover:bg-app-hover'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>Rejected
          </button>
        </div>
        <div className="w-px h-4 bg-app-border"></div>
        <div className="flex items-center gap-1 text-[11px]">
          {[1,2,3,4,5].map(stars => (
            <button key={stars} onClick={() => setFilterMode('rated'+stars)} className={`filter-pill px-2 py-1 rounded-md font-medium ${filterMode === 'rated'+stars ? 'bg-warning/15 text-warning' : 'text-txt-tertiary hover:bg-app-hover'}`}>≥{stars}★</button>
          ))}
        </div>
      </div>

      {/* CULLING TOOLBAR */}
      <div ref={toolbarRef} className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-[#111114] flex-shrink-0 overflow-hidden whitespace-nowrap">
        {/* Flag Buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => handleCulling(-1, activeImage?.culling.rating || 0)} className={`w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 ${activeImage?.culling.flag === -1 ? 'bg-danger text-white' : 'text-txt-tertiary'}`}>X</button>
          <button onClick={() => handleCulling(null, activeImage?.culling.rating || 0)} className={`w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover ${activeImage?.culling.flag === null ? 'bg-app-hover text-white' : 'text-txt-tertiary'}`}>U</button>
          <button onClick={() => handleCulling(1, activeImage?.culling.rating || 0)} className={`w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 ${activeImage?.culling.flag === 1 ? 'bg-success text-white' : 'text-txt-tertiary'}`}>P</button>
        </div>

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

        {/* Image Actions: In RapidRAW (links) & Finder (rechts) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Action: Open in RapidRAW */}
          <button 
            disabled={!activeImage}
            onClick={() => activeImage && invoke('open_in_rapidraw', { path: activeImage.path })}
            className="px-2.5 py-1 bg-accent/15 border border-accent/30 hover:bg-accent hover:text-app-deepest text-accent rounded-md text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 shadow-sm shadow-accent/10"
            title={t('toolbar.openInRapidRawTooltip')}
          >
            {showActionIcons && <Rocket className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{t('toolbar.openInRapidRaw')}</span>
            <kbd className="text-[10px] opacity-80 font-mono px-1 py-0.2 rounded bg-black/25">R</kbd>
          </button>

          {/* Action: Show in Finder */}
          <button 
            disabled={!activeImage}
            onClick={() => activeImage && invoke('show_in_finder', { path: activeImage.path })}
            className="px-2.5 py-1 bg-app-card border border-app-border hover:border-app-border-hover hover:bg-app-hover rounded-md text-xs font-medium text-txt-secondary hover:text-txt-primary transition-all duration-150 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 shadow-sm"
            title={t('toolbar.showInFinderTooltip')}
          >
            {showActionIcons && <FolderOpen className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />}
            <span>{t('toolbar.showInFinder')}</span>
            <kbd className="text-[10px] text-txt-tertiary font-mono bg-app-panel px-1 py-0.2 rounded border border-app-border">⌘⇧F</kbd>
          </button>
        </div>

        <div className="flex-1"></div>

        {/* Delete Rejected Button */}
        <button onClick={() => {
            const rejected = displayedImages.filter(i => i.culling.flag === -1);
            if (rejected.length === 0) return;
            ask(`Move ${rejected.length} rejected images to the OS Trash?`, {
              title: 'Confirm Delete',
              kind: 'warning',
              okLabel: 'Move to Trash',
              cancelLabel: 'Cancel'
            }).then(confirmed => {
              if (confirmed) {
                invoke('delete_files', { paths: rejected.map(i => i.path), toTrash: true }).then(() => {
                  const remaining = images.filter(i => i.culling.flag !== -1);
                  useLibraryStore.getState().setImages(remaining);
                }).catch(err => {
                  console.error(err);
                  alert('Failed to move to trash: ' + err);
                });
              }
            });
          }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger/10 transition-all flex-shrink-0">
          <Trash2 className="w-3 h-3" />
          <span>Delete Rejected ({displayedImages.filter(i => i.culling.flag === -1).length})</span>
        </button>
      </div>

      {/* Content Area */}
      {viewMode === 'grid' ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-6 gap-3">
            {displayedImages.map((img, idx) => (
              <div 
                key={idx} 
                id={activeImageIndex === idx ? 'active-grid-img' : undefined}
                className={`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden group ${activeImageIndex === idx ? 'border-accent ring-2 ring-accent' : 'border-app-border hover:border-app-border-hover'}`}
                onClick={() => setActiveImageIndex(idx)}
                onDoubleClick={() => {
                  setActiveImageIndex(idx);
                  setViewMode('loupe');
                }}
              >
                <img src={`rr-image://localhost${img.path}`} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.culling.flag === 1 && <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                  {img.culling.flag === -1 && <div className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-[10px] font-bold text-white">X</div>}
                </div>
                {img.culling.rating > 0 && (
                  <div className="absolute bottom-1 left-1 flex">
                     {Array.from({length: img.culling.rating}).map((_, i) => <Star key={i} className="w-3 h-3 text-warning fill-warning" />)}
                  </div>
                )}
                {img.culling.flag === -1 && <div className="absolute inset-0 bg-danger/20 pointer-events-none" />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative">
            {activeImage ? (
              <>
                <ZoomableImage src={`rr-image://localhost${activeImage.path}?fullres=true`} alt={activeImage.name} />
                
                {/* Preloading Previous and Next Full-Res images to avoid loading lag */}
                {activeImageIndex > 0 && (
                  <img src={`rr-image://localhost${displayedImages[activeImageIndex - 1].path}?fullres=true`} className="hidden" />
                )}
                {activeImageIndex < displayedImages.length - 1 && (
                  <img src={`rr-image://localhost${displayedImages[activeImageIndex + 1].path}?fullres=true`} className="hidden" />
                )}
              </>
            ) : null}
            {activeImage?.culling.flag === -1 && <div className="absolute inset-0 bg-danger/10 pointer-events-none" />}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0">
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors" onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}>
              <ChevronLeft className="w-4 h-4 text-txt-secondary" />
            </button>
            <div className="flex items-center gap-4 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">{activeImage?.name}</span>
              <span>{displayedImages.length > 0 ? activeImageIndex + 1 : 0} / {displayedImages.length}</span>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors" onClick={() => setActiveImageIndex(Math.min(displayedImages.length - 1, activeImageIndex + 1))}>
              <ChevronRight className="w-4 h-4 text-txt-secondary" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
