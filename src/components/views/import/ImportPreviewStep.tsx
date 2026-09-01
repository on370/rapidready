import { GitBranch, Filter, ChevronDown, Folder, X, MousePointerClick, Camera, CheckCircle2, AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

export function ImportPreviewStep() {
  const [selectedFile, setSelectedFile] = useState<number | null>(null);

  const CheckboxIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden p-6 gap-6 flex">
      {/* Left Panel: File Tree */}
      <div className="w-[420px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between flex-shrink-0 mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-txt-secondary" />
            <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Planned Import Structure</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-tertiary">235 files selected</span>
            <div className="custom-checkbox checked cursor-pointer">
              <CheckboxIcon />
            </div>
          </div>
        </div>

        {/* Pre-import culling info bar */}
        <div className="flex items-center justify-between px-3 py-2 mb-2 bg-app-card border border-app-border rounded-lg flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3 h-3 text-txt-tertiary" />
            <span className="text-txt-secondary">Importing <span className="text-accent font-semibold">235</span> of 235</span>
          </div>
          <div className="text-[10px] text-txt-tertiary">Click ✗ to exclude files</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-app-card border border-app-border rounded-xl p-3 space-y-0.5">
          {/* Date folder: 2025-07-18 */}
          <div className="tree-item">
            <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group">
              <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary transition-transform duration-200" />
              <div className="custom-checkbox checked">
                <CheckboxIcon />
              </div>
              <Folder className="w-4 h-4 text-warning" />
              <span className="text-sm text-txt-primary font-medium">2025-07-18</span>
              <span className="text-xs text-txt-tertiary ml-auto">142 files</span>
            </div>
            <div className="ml-6 pl-3 border-l border-app-border space-y-0.5 mt-0.5">
              {/* File items */}
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group ${selectedFile === i ? 'bg-app-hover' : ''}`} onClick={() => setSelectedFile(i)}>
                  <div className="custom-checkbox checked">
                    <CheckboxIcon />
                  </div>
                  <div className="thumb-placeholder w-7 h-5 rounded flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a4a6e, #2d7aac)' }}></div>
                  <span className="text-xs text-txt-primary truncate flex-1">IMG_450{i}.cr3</span>
                  <button className="w-4 h-4 rounded flex items-center justify-center text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100" title="Exclude from import">
                    <X className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] text-txt-tertiary ml-auto flex-shrink-0">54.2 MB</span>
                </div>
              ))}
              <div className="py-1 px-2 text-[10px] text-txt-tertiary">… and 139 more files</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Metadata Inspector */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden pl-4">
        <div className="flex items-center gap-2 flex-shrink-0 mb-3">
          <Info className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">File Inspector</h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {selectedFile === null ? (
            /* Default: No file selected */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-4">
                <MousePointerClick className="w-7 h-7 text-txt-tertiary" />
              </div>
              <p className="text-sm text-txt-tertiary">Select a file from the tree to inspect its metadata</p>
            </div>
          ) : (
            /* File detail (shown on selection) */
            <div className="space-y-4">
              {/* Thumbnail */}
              <div className="w-full aspect-[3/2] rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a4a6e 0%, #2d7aac 50%, #1a6e5a 100%)' }}>
                <div className="flex flex-col items-center gap-2">
                  <Camera className="w-10 h-10 text-white/20" />
                  <span className="text-xs text-white/30 font-medium">IMG_450{selectedFile}.cr3</span>
                </div>
              </div>

              {/* File info */}
              <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-txt-primary">IMG_450{selectedFile}.cr3</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">RAW</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-txt-tertiary">Size</span>
                    <p className="text-txt-primary font-medium">54.2 MB</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary">Dimensions</span>
                    <p className="text-txt-primary font-medium">8192 × 5464</p>
                  </div>
                </div>
              </div>

              {/* Date Sources */}
              <div className="bg-app-card border border-app-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-3">Date Sources</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-txt-secondary">EXIF DateTimeOriginal</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-txt-primary font-mono">2025-07-18 14:32:15</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-txt-secondary">File System Created</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-txt-primary font-mono">2025-07-18 14:32:15</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-txt-secondary">File Modified</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-txt-primary font-mono">2025-07-20 09:15:00</span>
                      <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-app-border flex items-center gap-1.5 text-xs">
                  <Check className="w-3.5 h-3.5 text-accent" />
                  <span className="text-accent font-medium">Best Date: 2025-07-18 14:32:15 (from EXIF)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Ensure Info is imported, we missed it earlier in the list above but I will just use what we have or add it.
function Info(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
}
