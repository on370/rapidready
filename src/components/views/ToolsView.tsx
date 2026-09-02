import { useState } from "react";
import { Wrench, ShieldCheck, Clock, AlertTriangle, CheckCircle2, Undo2, ChevronDown, ChevronRight } from "lucide-react";

export function ToolsView() {
  const [healthOpen, setHealthOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-app-card border border-app-border flex items-center justify-center">
            <Wrench className="w-6 h-6 text-txt-secondary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-txt-primary">Tools & Dashboard</h2>
            <p className="text-sm text-txt-secondary">Manage archive health and import history</p>
          </div>
        </div>

        {/* Archive Health Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden shadow-sm">
          <button 
            onClick={() => setHealthOpen(!healthOpen)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-app-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <span className="font-semibold text-txt-primary">Archive Health</span>
              <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning font-medium ml-2">3 Issues</span>
            </div>
            {healthOpen ? <ChevronDown className="w-5 h-5 text-txt-tertiary" /> : <ChevronRight className="w-5 h-5 text-txt-tertiary" />}
          </button>
          
          {healthOpen && (
            <div className="px-5 py-4 border-t border-app-border bg-app-panel/30">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-txt-tertiary">Last scan: 2 hours ago</span>
                <button className="px-4 py-1.5 bg-accent hover:bg-accent-hover rounded-lg text-xs font-semibold text-app-deepest transition-all duration-150">
                  Run Full Scan
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-app-card border border-app-border rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-success">12,847</p>
                  <p className="text-xs text-txt-tertiary mt-1">Files Verified</p>
                </div>
                <div className="bg-app-card border border-app-border rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-txt-primary">482 GB</p>
                  <p className="text-xs text-txt-tertiary mt-1">Archive Size</p>
                </div>
                <div className="bg-app-card border border-app-border rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-success">99.97%</p>
                  <p className="text-xs text-txt-tertiary mt-1">Health Score</p>
                </div>
              </div>

              <div className="divide-y divide-app-border border border-app-border rounded-lg bg-app-card overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-3 hover:bg-app-hover transition-colors">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary">2 files in wrong date folder</p>
                    <p className="text-xs text-txt-tertiary">IMG_3201.cr3, IMG_3202.cr3 — EXIF date doesn't match folder</p>
                  </div>
                  <button className="px-3 py-1 text-xs rounded-lg bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">Fix</button>
                </div>
                <div className="px-4 py-3 flex items-center gap-3 hover:bg-app-hover transition-colors">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary">1 file with date mismatch</p>
                    <p className="text-xs text-txt-tertiary">MVI_2801.mp4 — File modified date differs from creation date by 2 days</p>
                  </div>
                  <button className="px-3 py-1 text-xs rounded-lg bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">Fix</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import History Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden shadow-sm">
          <button 
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-app-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-accent" />
              <span className="font-semibold text-txt-primary">Import History</span>
            </div>
            {historyOpen ? <ChevronDown className="w-5 h-5 text-txt-tertiary" /> : <ChevronRight className="w-5 h-5 text-txt-tertiary" />}
          </button>
          
          {historyOpen && (
            <div className="px-5 py-4 border-t border-app-border bg-app-panel/30">
              <div className="space-y-4">
                <div className="text-xs font-semibold text-txt-tertiary uppercase tracking-wider">Today — July 26, 2025</div>
                <div className="bg-app-card border border-app-border rounded-xl p-4 hover:border-app-border-hover transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-txt-primary">235 files from <span className="text-accent">EOS_DIGITAL</span></p>
                      <p className="text-xs text-txt-tertiary mt-0.5">→ /Volumes/Photos/Archiv · 12.4 GB · Canon EOS R5</p>
                      <p className="text-xs text-txt-tertiary mt-0.5">Collection: Urlaub 2025 Mallorca</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success font-medium">Completed</span>
                        <span className="text-[10px] text-txt-tertiary">14:35</span>
                      </div>
                    </div>
                    <button className="px-3 py-1.5 text-xs rounded-lg border border-app-border text-txt-secondary hover:bg-app-hover hover:border-app-border-hover transition-all">
                      <Undo2 className="w-3 h-3 inline mr-1" />
                      Undo
                    </button>
                  </div>
                </div>

                <div className="text-xs font-semibold text-txt-tertiary uppercase tracking-wider">July 20, 2025</div>
                <div className="bg-app-card border border-app-border rounded-xl p-4 hover:border-app-border-hover transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-txt-primary">412 files from <span className="text-accent">NIKON_D850</span></p>
                      <p className="text-xs text-txt-tertiary mt-0.5">→ /Volumes/Photos/Archiv · 28.7 GB · Nikon D850</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success font-medium">Completed</span>
                        <span className="text-[10px] text-txt-tertiary">09:22</span>
                      </div>
                    </div>
                    <button className="px-3 py-1.5 text-xs rounded-lg border border-app-border text-txt-secondary hover:bg-app-hover hover:border-app-border-hover transition-all">
                      <Undo2 className="w-3 h-3 inline mr-1" />
                      Undo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
