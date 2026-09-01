import { Info, X, Camera, MousePointerClick, Pencil, Save } from "lucide-react";

interface LibraryInspectorProps {
  close: () => void;
}

export function LibraryInspector({ close }: LibraryInspectorProps) {
  // To keep it simple, we simulate a file being selected
  const hasSelection = true;

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-app-border bg-app-panel flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Inspector
        </h2>
        <button className="p-1 rounded hover:bg-app-hover transition-colors" onClick={close}>
          <X className="w-3.5 h-3.5 text-txt-tertiary" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!hasSelection ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-3">
              <MousePointerClick className="w-6 h-6 text-txt-tertiary" />
            </div>
            <p className="text-xs text-txt-tertiary">Select a file to inspect</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Large thumbnail */}
            <div className="thumb-placeholder w-full aspect-[3/2] rounded-xl" style={{ background: 'linear-gradient(135deg, #1a4a6e 0%, #2d7aac 50%, #1a6e5a 100%)' }}>
              <div className="flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 text-white/20" />
                <span className="text-[10px] text-white/30 font-medium">IMG_4501.cr3</span>
              </div>
            </div>

            {/* File info */}
            <div className="bg-app-card border border-app-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-txt-primary">IMG_4501.cr3</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">RAW</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div>
                  <span className="text-txt-tertiary">Size</span>
                  <p className="text-txt-primary font-medium">54.2 MB</p>
                </div>
                <div>
                  <span className="text-txt-tertiary">Dimensions</span>
                  <p className="text-txt-primary font-medium">8192 × 5464</p>
                </div>
                <div>
                  <span className="text-txt-tertiary">Date</span>
                  <p className="text-txt-primary font-medium">2025-07-18</p>
                </div>
                <div>
                  <span className="text-txt-tertiary">Path</span>
                  <p className="text-txt-primary font-medium truncate" title="/Volumes/Photos/Archiv/2025/2025-07-18/">…/2025-07-18/</p>
                </div>
              </div>
            </div>

            {/* Camera */}
            <div className="bg-app-card border border-app-border rounded-lg p-3">
              <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider mb-2">Camera</h3>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div>
                  <span className="text-txt-tertiary">Body</span>
                  <p className="text-txt-primary font-medium">Canon EOS R5</p>
                </div>
                <div>
                  <span className="text-txt-tertiary">Lens</span>
                  <p className="text-txt-primary font-medium">RF 24-70mm</p>
                </div>
                <div>
                  <span className="text-txt-tertiary">ISO</span>
                  <p className="text-txt-primary font-medium">400</p>
                </div>
                <div>
                  <span className="text-txt-tertiary">f/</span>
                  <p className="text-txt-primary font-medium">f/2.8</p>
                </div>
              </div>
            </div>

            {/* Editable Metadata */}
            <div className="bg-app-card border border-app-border rounded-lg p-3 space-y-2.5">
              <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider">Editable Metadata</h3>
              <div>
                <label className="text-[10px] text-txt-tertiary mb-0.5 block">Artist</label>
                <div className="flex items-center bg-app-deepest border border-app-border rounded px-2 py-1 hover:border-app-border-hover transition-colors">
                  <input type="text" defaultValue="Ole Fischer" className="bg-transparent text-xs text-txt-primary w-full outline-none" />
                  <Pencil className="w-3 h-3 text-txt-tertiary flex-shrink-0" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-txt-tertiary mb-0.5 block">Tags</label>
                <div className="flex flex-wrap gap-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded text-[10px] text-accent">landscape <button className="hover:text-danger">×</button></span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded text-[10px] text-accent">mallorca <button className="hover:text-danger">×</button></span>
                  <button className="px-1.5 py-0.5 border border-dashed border-app-border rounded text-[10px] text-txt-tertiary hover:border-accent hover:text-accent transition-all">+ add</button>
                </div>
              </div>
            </div>

            {/* Save button */}
            <button className="w-full px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-xs font-semibold text-app-deepest transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-accent/20">
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
