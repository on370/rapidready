import { Download, Gauge, Clock, File, Terminal, Pause, X, CheckCircle2, FolderCheck, Library, CalendarCheck, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";

export function ImportExecuteStep() {
  const [isComplete, setIsComplete] = useState(false);

  return (
    <div className="flex-1 overflow-auto p-6 flex">
      <div className="flex-1 flex flex-col items-center max-w-2xl mx-auto w-full">
        
        {!isComplete ? (
          /* Progress State */
          <div className="w-full flex flex-col items-center gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Download className="w-8 h-8 text-accent animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-txt-primary mb-1">Importing Files</h2>
              <p className="text-sm text-txt-secondary">Copying to /Volumes/Photos/Archiv</p>
            </div>

            {/* Main Progress Bar */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-txt-primary">112 of 235 files</span>
                <span className="text-sm font-bold text-accent tabular-nums">47%</span>
              </div>
              <div className="w-full h-3 bg-app-card rounded-full overflow-hidden border border-app-border">
                <div className="progress-fill h-full rounded-full" style={{ width: '47%' }}></div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-txt-tertiary">
                <span>5.8 of 12.4 GB</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> 142 MB/s</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 45s left</span>
                </div>
              </div>
            </div>

            {/* Current File */}
            <div className="w-full bg-app-card border border-app-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <File className="w-4 h-4 text-accent animate-spin" style={{ animationDuration: '2s' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-txt-primary font-medium truncate">IMG_4612.cr3</p>
                <p className="text-xs text-txt-tertiary">Copying to 2025/2025-07-19/IMG_4612.cr3</p>
              </div>
            </div>

            {/* Log Area */}
            <div className="w-full flex-1 bg-app-card border border-app-border rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '150px' }}>
              <div className="px-3 py-2 border-b border-app-border flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-txt-tertiary" />
                <span className="text-xs font-medium text-txt-secondary">Import Log</span>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-1 font-mono text-[11px] text-txt-tertiary">
                <div className="log-entry">Copying IMG_4610.cr3... OK</div>
                <div className="log-entry">Copying IMG_4611.cr3... OK</div>
                <div className="log-entry text-txt-primary">Copying IMG_4612.cr3...</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button className="px-5 py-2.5 bg-app-card border border-app-border rounded-lg text-sm font-medium text-warning hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-2">
                <Pause className="w-4 h-4" />
                Pause
              </button>
              <button 
                className="px-5 py-2.5 bg-app-card border border-app-border rounded-lg text-sm font-medium text-danger hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-2"
                onClick={() => setIsComplete(true)} // Mocking completion
              >
                <X className="w-4 h-4" />
                Cancel (or Complete for demo)
              </button>
            </div>
          </div>
        ) : (
          /* Completion State */
          <div className="w-full flex flex-col items-center gap-6">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4 bounce-in">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-txt-primary mb-2">Import Complete</h2>
              <p className="text-sm text-txt-secondary">235 files imported successfully</p>
              <p className="text-xs text-txt-tertiary mt-1">12.4 GB copied in 4 min 32 sec</p>
            </div>

            <div className="w-full bg-app-card border border-app-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <FolderCheck className="w-5 h-5 text-success" />
                <span className="text-sm text-txt-primary">Saved to <span className="font-mono text-accent">/Volumes/Photos/Archiv</span></span>
              </div>
              <div className="flex items-center gap-3">
                <Library className="w-5 h-5 text-indigo" />
                <span className="text-sm text-txt-primary">Added to collection: <span className="font-semibold text-indigo-hover">Urlaub 2025 Mallorca</span></span>
              </div>
              <div className="flex items-center gap-3">
                <CalendarCheck className="w-5 h-5 text-txt-tertiary" />
                <span className="text-sm text-txt-secondary">3 date folders created (2025-07-18, 19, 20)</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="px-6 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-semibold text-app-deepest transition-all duration-150 flex items-center gap-2 shadow-lg shadow-accent/20">
                <ExternalLink className="w-4 h-4" />
                Open in RapidRaw
              </button>
              <button 
                className="px-6 py-2.5 bg-app-card border border-app-border rounded-lg text-sm font-medium text-txt-primary hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-2"
                onClick={() => setIsComplete(false)}
              >
                <Plus className="w-4 h-4" />
                New Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
