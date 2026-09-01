import { HardDrive, SdCard, Camera, File, Database, Calendar, CheckCircle2, EyeOff, Sparkles, FolderPlus, FolderOutput, SlidersHorizontal, ChevronDown, Pencil, Info, Folder, FolderSearch, Save, Plus, X } from "lucide-react";
import { useState } from "react";

export function ImportSourceStep() {
  const [hideImported, setHideImported] = useState(true);

  return (
    <div className="flex-1 min-h-0 overflow-hidden p-6 gap-6 flex">
      {/* Left Panel: Source */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pr-1">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Source</h2>
        </div>

        {/* SD Card Detected */}
        <div className="bg-app-card border border-app-border rounded-xl p-5 hover:border-app-border-hover transition-colors duration-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <SdCard className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-txt-primary">SD Card Detected</span>
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-3.5 h-3.5 text-txt-tertiary" />
                <span className="text-sm font-medium text-txt-secondary">Canon EOS R5</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-txt-tertiary">
                <span className="flex items-center gap-1"><File className="w-3 h-3" /> 847 files</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Database className="w-3 h-3" /> 32.4 GB</span>
              </div>
              <div className="text-xs text-txt-tertiary mt-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                2025-07-18 – 2025-07-20
              </div>
            </div>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold uppercase tracking-wide">EOS_DIGITAL</span>
            </div>
          </div>
        </div>

        {/* Already Imported Indicator */}
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-txt-tertiary" />
              <span className="text-sm text-txt-secondary">Already imported</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-txt-tertiary">Hide imported</span>
              <div className={`toggle-track ${hideImported ? 'on' : ''}`} onClick={() => setHideImported(!hideImported)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-txt-tertiary">
              <EyeOff className="w-3.5 h-3.5" />
              <span>612 already imported (hidden)</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-accent">235 new files</span>
            <span className="text-sm text-txt-tertiary">(12.4 GB)</span>
          </div>
        </div>

        {/* Or Select Folder */}
        <button className="flex items-center justify-center gap-2 py-3 px-4 border border-dashed border-app-border rounded-xl text-sm text-txt-secondary hover:border-accent hover:text-accent transition-all duration-200 hover:bg-accent/5">
          <FolderPlus className="w-4 h-4" />
          <span>Or select folder…</span>
        </button>
      </div>

      {/* Right Panel: Destination & Settings */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pl-1">
        <div className="flex items-center gap-2 mb-1">
          <FolderOutput className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Destination</h2>
        </div>

        {/* Import Profile */}
        <div>
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5">Import Profile</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-app-card border border-app-border rounded-lg px-3 py-2 hover:border-app-border-hover transition-colors cursor-pointer justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <span className="text-sm text-txt-primary font-medium">Standard</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary" />
            </div>
            <button className="px-2 py-2 bg-app-card border border-app-border rounded-lg hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-1.5" title="Edit Profile">
              <Pencil className="w-3.5 h-3.5 text-txt-secondary" />
            </button>
          </div>
          <p className="text-[10px] text-txt-tertiary mt-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Profile defines default format, destination & settings
          </p>
        </div>

        {/* Path Input (inherited from profile) */}
        <div className="inherited-field ml-2.5">
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5 flex items-center gap-1.5">
            Archive Path
            <span className="text-[10px] text-accent/60 font-normal">(from profile)</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-app-card border border-app-border rounded-lg px-3 py-2 hover:border-app-border-hover transition-colors">
              <Folder className="w-4 h-4 text-txt-tertiary mr-2 flex-shrink-0" />
              <span className="text-sm text-txt-primary truncate">/Volumes/Photos/Archiv</span>
            </div>
            <button className="px-3 py-2 bg-app-card border border-app-border rounded-lg hover:bg-app-hover hover:border-app-border-hover transition-all duration-150">
              <FolderSearch className="w-4 h-4 text-txt-secondary" />
            </button>
          </div>
        </div>

        {/* Directory Format Template (inherited from profile) */}
        <div className="inherited-field ml-2.5">
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5 flex items-center gap-1.5">
            Directory Format
            <span className="text-[10px] text-accent/60 font-normal">(from profile)</span>
          </label>
          <div className="flex items-center bg-app-card border border-app-border rounded-lg px-3 py-2 hover:border-app-border-hover transition-colors font-mono">
            <span className="text-sm text-accent">{'{year}'}</span>
            <span className="text-sm text-txt-tertiary">/</span>
            <span className="text-sm text-accent">{'{year}'}</span>
            <span className="text-sm text-txt-tertiary">-</span>
            <span className="text-sm text-accent">{'{month}'}</span>
            <span className="text-sm text-txt-tertiary">-</span>
            <span className="text-sm text-accent">{'{day}'}</span>
            <span className="text-sm text-txt-tertiary">/</span>
          </div>
          <p className="text-[11px] text-txt-tertiary mt-1.5">Tokens: <code className="text-accent/70">{'{year}'}</code> <code className="text-accent/70">{'{month}'}</code> <code className="text-accent/70">{'{day}'}</code> <code className="text-accent/70">{'{camera}'}</code> <code className="text-accent/70">{'{ext}'}</code></p>
        </div>

        {/* Save as new profile */}
        <button className="flex items-center gap-1.5 text-xs text-accent/70 hover:text-accent transition-colors ml-2.5">
          <Save className="w-3 h-3" />
          Save as new Profile…
        </button>

        {/* Collection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-txt-tertiary">Add to Collection</label>
            <button className="w-5 h-5 rounded flex items-center justify-center hover:bg-app-hover transition-colors">
              <Plus className="w-3.5 h-3.5 text-txt-tertiary" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="collection-chip inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo/15 border border-indigo/30 rounded-lg text-xs font-medium text-indigo-hover cursor-default">
              <Folder className="w-3 h-3" />
              Urlaub 2025 Mallorca
              <button className="hover:text-danger transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
            <button className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-app-border rounded-lg text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
              <Plus className="w-3 h-3" />
              Add…
            </button>
          </div>
        </div>

        {/* Live Preview: Directory Structure */}
        <div className="mt-1">
          <label className="block text-xs font-medium text-txt-tertiary mb-2">Preview</label>
          <div className="bg-app-deepest border border-app-border rounded-lg p-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-txt-secondary mb-1">
              <Folder className="w-3.5 h-3.5 text-warning" />
              <span>2025/</span>
            </div>
            <div className="ml-5 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-txt-secondary">
                <Folder className="w-3.5 h-3.5 text-warning/70" />
                <span>2025-07-18/</span>
                <span className="text-txt-tertiary ml-1">(142 files)</span>
              </div>
              <div className="flex items-center gap-1.5 text-txt-secondary">
                <Folder className="w-3.5 h-3.5 text-warning/70" />
                <span>2025-07-19/</span>
                <span className="text-txt-tertiary ml-1">(61 files)</span>
              </div>
              <div className="flex items-center gap-1.5 text-txt-secondary">
                <Folder className="w-3.5 h-3.5 text-warning/70" />
                <span>2025-07-20/</span>
                <span className="text-txt-tertiary ml-1">(32 files)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
