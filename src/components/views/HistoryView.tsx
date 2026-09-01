import { Clock, CheckCircle2, Undo2, XCircle } from "lucide-react";

export function HistoryView() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center">
            <Clock className="w-6 h-6 text-indigo" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-txt-primary">Import History</h2>
            <p className="text-sm text-txt-secondary">All past imports and transfers</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          {/* Today */}
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

          {/* July 20 */}
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

          {/* July 8 */}
          <div className="text-xs font-semibold text-txt-tertiary uppercase tracking-wider">July 8, 2025</div>
          <div className="bg-app-card border border-app-border rounded-xl p-4 hover:border-app-border-hover transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <XCircle className="w-5 h-5 text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-txt-primary">89 files from <span className="text-accent">SD_CARD_01</span></p>
                <p className="text-xs text-txt-tertiary mt-0.5">→ /Volumes/Photos/Archiv · 4.2 GB · Sony A7R V</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-danger/10 text-danger font-medium">Cancelled</span>
                  <span className="text-[10px] text-txt-tertiary">12:05 — SD card ejected during transfer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
