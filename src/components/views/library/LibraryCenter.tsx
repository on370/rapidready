import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useLibraryStore } from "../../../stores/libraryStore";
import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";

interface LibraryCenterProps {
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  toggleInspector: () => void;
}

export function LibraryCenter({ viewMode, setViewMode, toggleInspector }: LibraryCenterProps) {
  const { images, activeImageIndex, setActiveImageIndex, autoAdvance, updateCullingState, activeFolderPath, filterMode, setFilterMode } = useLibraryStore();
  const folderImages = activeFolderPath ? images.filter(img => img.path.startsWith(activeFolderPath)) : images;
  const displayedImages = folderImages.filter(img => {
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
      color: null
    }).catch(console.error);

    if (autoAdvance && activeImageIndex < displayedImages.length - 1) {
      setActiveImageIndex(activeImageIndex + 1);
    }
  }, [activeImage, activeImageIndex, autoAdvance, displayedImages.length, setActiveImageIndex, updateCullingState]);

    useEffect(() => {
    if (viewMode === 'grid') {
      const el = document.getElementById('active-grid-img');
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeImageIndex, viewMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;

      switch(e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          if (viewMode === 'loupe') {
            if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
          } else {
            if (e.key === 'ArrowRight') {
              if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
            } else {
              const cols = 6;
              const rows = Math.ceil(displayedImages.length / cols);
              const currentRow = Math.floor(activeImageIndex / cols);
              const currentCol = activeImageIndex % cols;
              let nextRow = currentRow + 1;
              if (nextRow >= rows) nextRow = 0;
              let nextIdx = nextRow * cols + currentCol;
              if (nextIdx >= displayedImages.length) {
                nextIdx = currentRow === rows - 1 ? currentCol : displayedImages.length - 1;
              }
              setActiveImageIndex(nextIdx);
            }
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          if (viewMode === 'loupe') {
            if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          } else {
            if (e.key === 'ArrowLeft') {
              if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
            } else {
              const cols = 6;
              const rows = Math.ceil(displayedImages.length / cols);
              const currentRow = Math.floor(activeImageIndex / cols);
              const currentCol = activeImageIndex % cols;
              let nextRow = currentRow - 1;
              if (nextRow < 0) nextRow = rows - 1;
              let nextIdx = nextRow * cols + currentCol;
              if (nextIdx >= displayedImages.length) {
                nextIdx = displayedImages.length - 1;
              }
              setActiveImageIndex(nextIdx);
            }
          }
          break;
        }
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
        case ' ':
          setViewMode(viewMode === 'grid' ? 'loupe' : 'grid');
          e.preventDefault();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImageIndex, displayedImages.length, handleCulling, viewMode, setViewMode]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-txt-primary truncate max-w-[400px]">{activeFolderPath ? activeFolderPath.split('/').pop() : 'All Images'}</h2>
          <p className="text-xs text-txt-tertiary mt-0.5">{displayedImages.length} files · {(displayedImages.reduce((acc, img) => acc + img.size, 0) / (1024*1024)).toFixed(1)} MB</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle: Grid / Loupe */}
          <div className="flex items-center bg-app-card border border-app-border rounded-lg p-0.5">
            <button 
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ${viewMode === 'grid' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:text-txt-secondary'}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button 
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ${viewMode === 'loupe' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:text-txt-secondary'}`}
              onClick={() => setViewMode('loupe')}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Loupe</span>
            </button>
          </div>
          <div className="w-px h-5 bg-app-border mx-1"></div>
          <button className="p-2 rounded-lg hover:bg-app-hover transition-colors" onClick={toggleInspector}>
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
      <div className="flex items-center gap-4 px-4 py-2 border-b border-app-border bg-[#111114] flex-shrink-0">
        {/* Flag Buttons */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => handleCulling(-1, activeImage?.culling.rating || 0)} className={`w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 ${activeImage?.culling.flag === -1 ? 'bg-danger text-white' : 'text-txt-tertiary'}`}>X</button>
          <button onClick={() => handleCulling(null, activeImage?.culling.rating || 0)} className={`w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover ${activeImage?.culling.flag === null ? 'bg-app-hover text-white' : 'text-txt-tertiary'}`}>U</button>
          <button onClick={() => handleCulling(1, activeImage?.culling.rating || 0)} className={`w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 ${activeImage?.culling.flag === 1 ? 'bg-success text-white' : 'text-txt-tertiary'}`}>P</button>
        </div>

        <div className="w-px h-6 bg-app-border"></div>

        {/* Stars */}
        <div className="flex items-center gap-0.5">
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => handleCulling(activeImage?.culling.flag || null, activeImage?.culling.rating === s ? 0 : s)} className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-all">
              <Star className={`w-3.5 h-3.5 ${(activeImage?.culling.rating || 0) >= s ? 'text-warning fill-warning' : 'text-txt-tertiary'}`} />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-app-border"></div>

        {/* Auto-Advance */}
        <button onClick={() => useLibraryStore.getState().setAutoAdvance(!autoAdvance)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${autoAdvance ? 'bg-warning/15 text-warning hover:bg-warning/25' : 'text-txt-tertiary hover:bg-app-hover'}`}>
          <Zap className={`w-3 h-3 ${autoAdvance ? 'fill-warning text-warning' : 'text-txt-tertiary'}`} />
          <span>Auto-Advance</span>
        </button>

        <div className="flex-1"></div>

        {/* Delete Rejected Button */}
        <button onClick={() => {
            const rejected = displayedImages.filter(i => i.culling.flag === -1);
            if (rejected.length === 0) return;
            ask(`Move ${rejected.length} rejected images to the OS Trash?`, {
              title: 'Confirm Delete',
              kind: 'warning',
              okLabel: 'Move to Trash',
              cancelLabel: 'Cancel' // Default is Cancel, so safe!
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
          }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger/10 transition-all">
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
              <img src={`rr-image://localhost${activeImage.path}`} className="max-w-full max-h-full object-contain" />
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
