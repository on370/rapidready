import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, Camera, ChevronLeft, ChevronRight } from "lucide-react";

interface LibraryCenterProps {
  viewMode: 'grid' | 'loupe';
  setViewMode: (mode: 'grid' | 'loupe') => void;
  toggleInspector: () => void;
}

export function LibraryCenter({ viewMode, setViewMode, toggleInspector }: LibraryCenterProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-txt-primary">Urlaub 2025 Mallorca</h2>
          <p className="text-xs text-txt-tertiary mt-0.5">847 files · 34.2 GB</p>
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
        <div className="flex items-center gap-1">
          <button className="filter-pill px-2 py-1 rounded-md bg-accent/15 text-accent font-medium">All</button>
          <button className="filter-pill px-2 py-1 rounded-md text-txt-tertiary hover:bg-app-hover font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>Picks
          </button>
        </div>
        <div className="w-px h-4 bg-app-border"></div>
        <div className="flex items-center gap-1">
          <button className="filter-pill px-2 py-1 rounded-md text-txt-tertiary hover:bg-app-hover font-medium">≥1★</button>
        </div>
      </div>

      {/* CULLING TOOLBAR */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-app-border bg-[#111114] flex-shrink-0">
        {/* Flag Buttons */}
        <div className="flex items-center gap-0.5">
          <button className="w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 text-txt-tertiary">X</button>
          <button className="w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover text-txt-tertiary">U</button>
          <button className="w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 text-txt-tertiary">P</button>
        </div>

        <div className="w-px h-6 bg-app-border"></div>

        {/* Stars */}
        <div className="flex items-center gap-0.5">
          {[1,2,3,4,5].map(s => (
            <button key={s} className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-all">
              <Star className="w-3.5 h-3.5 text-txt-tertiary" />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-app-border"></div>

        {/* Auto-Advance */}
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent/15 text-accent text-xs font-medium transition-all hover:bg-accent/25">
          <Zap className="w-3 h-3" />
          <span>Auto-Advance</span>
        </button>

        <div className="flex-1"></div>

        {/* Delete Rejected Button */}
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger/10 transition-all">
          <Trash2 className="w-3 h-3" />
          <span>Delete 3</span>
        </button>
      </div>

      {/* Content Area */}
      {viewMode === 'grid' ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-6 gap-3">
            {/* Mocking a few thumbnails */}
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-[3/2] rounded-lg border border-app-border thumb-placeholder cursor-pointer" style={{ background: `linear-gradient(135deg, #1a4a6e, #2d7aac)` }}>
                <div className="flex flex-col items-center gap-1">
                  <Camera className="w-6 h-6 text-white/20" />
                  <span className="text-[10px] text-white/40">IMG_450{i}.cr3</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative">
            <div className="thumb-placeholder rounded-xl w-4/5 aspect-[3/2]" style={{ background: `linear-gradient(135deg, #1a4a6e, #2d7aac)` }}>
              <div className="flex flex-col items-center gap-3">
                <Camera className="w-16 h-16 text-white/15" />
                <span className="text-sm text-white/25 font-medium">IMG_4501.cr3</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0">
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors">
              <ChevronLeft className="w-4 h-4 text-txt-secondary" />
            </button>
            <div className="flex items-center gap-4 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">IMG_4501.cr3</span>
              <span>1 / 16</span>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors">
              <ChevronRight className="w-4 h-4 text-txt-secondary" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
