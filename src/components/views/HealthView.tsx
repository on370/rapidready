import { ShieldCheck, Folder, Search, FolderSearch, AlertTriangle, Wrench } from "lucide-react";

export function HealthView() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-success" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-txt-primary">Archive Health</h2>
            <p className="text-sm text-txt-secondary">Scan your archive for integrity issues</p>
          </div>
        </div>

        {/* Archive Selector */}
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <label className="block text-xs font-medium text-txt-tertiary mb-2">Select Archive</label>
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent/10 border border-accent/30 cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0"></span>
              <Folder className="w-4 h-4 text-txt-secondary flex-shrink-0" />
              <span className="text-sm text-txt-primary flex-1 truncate">/Volumes/Photos/Archiv</span>
              <span className="text-[10px] text-accent font-medium">Selected</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-app-hover border border-transparent hover:border-app-border-hover transition-colors cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-full bg-warning flex-shrink-0"></span>
              <Folder className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
              <span className="text-sm text-txt-secondary flex-1 truncate">/Volumes/External/Backup</span>
              <span className="text-[10px] text-warning font-medium">Needs check</span>
            </div>
          </div>
          <button className="text-[10px] text-accent hover:text-accent-hover mt-2 inline-flex items-center gap-1 transition-colors">
            Manage archives in Settings →
          </button>
        </div>

        {/* Scan Card */}
        <div className="bg-app-card border border-app-border rounded-xl p-6 text-center">
          <Search className="w-10 h-10 text-txt-tertiary mx-auto mb-3" />
          <p className="text-sm text-txt-secondary mb-4">Select an archive folder to scan for date mismatches, missing files, and integrity issues.</p>
          <button className="px-5 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-semibold text-app-deepest transition-all duration-150 shadow-lg shadow-accent/20">
            <FolderSearch className="w-4 h-4 inline mr-2" />
            Scan Archive
          </button>
        </div>

        {/* Results Preview (simulated) */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm font-semibold text-txt-primary">3 Issues Found</span>
            </div>
            <span className="text-xs text-txt-tertiary">Last scan: 2 hours ago</span>
          </div>
          <div className="divide-y divide-app-border">
            <div className="px-5 py-3 flex items-center gap-3 hover:bg-app-hover transition-colors">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-txt-primary">2 files in wrong date folder</p>
                <p className="text-xs text-txt-tertiary">IMG_3201.cr3, IMG_3202.cr3 — EXIF date doesn't match folder</p>
              </div>
              <button className="px-3 py-1 text-xs rounded-lg bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">Fix</button>
            </div>
            <div className="px-5 py-3 flex items-center gap-3 hover:bg-app-hover transition-colors">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-txt-primary">1 file with date mismatch</p>
                <p className="text-xs text-txt-tertiary">MVI_2801.mp4 — File modified date differs from creation date by 2 days</p>
              </div>
              <button className="px-3 py-1 text-xs rounded-lg bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">Fix</button>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-app-border">
            <button className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-xs font-semibold text-app-deepest transition-all duration-150 flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5" />
              Fix All Issues
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
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
      </div>
    </div>
  );
}
