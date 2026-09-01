import { Settings, Folder, Plus, Zap } from "lucide-react";
import { useState } from "react";

export function SettingsView() {
  const [autoDetect, setAutoDetect] = useState(true);
  const [verifyCopy, setVerifyCopy] = useState(true);
  const [deleteSource, setDeleteSource] = useState(false);
  const [launchSystem, setLaunchSystem] = useState(false);
  const [openRapidRaw, setOpenRapidRaw] = useState(true);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-app-card border border-app-border flex items-center justify-center">
            <Settings className="w-6 h-6 text-txt-secondary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-txt-primary">Settings</h2>
            <p className="text-sm text-txt-secondary">Configure RapidReady preferences</p>
          </div>
        </div>

        {/* Archives Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">Archives</h3>
          </div>
          <div className="divide-y divide-app-border">
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0" title="OK"></span>
              <Folder className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
              <span className="text-sm text-txt-primary flex-1 truncate">/Volumes/Photos/Archiv</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">Default</span>
              <button className="text-xs text-txt-tertiary hover:text-danger transition-colors">Remove</button>
            </div>
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-warning flex-shrink-0" title="Not checked"></span>
              <Folder className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
              <span className="text-sm text-txt-primary flex-1 truncate">/Volumes/External/Backup</span>
              <button className="text-xs text-txt-tertiary hover:text-danger transition-colors">Remove</button>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-app-border">
            <button className="flex items-center gap-2 text-xs text-txt-tertiary hover:text-accent transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Add Archive
            </button>
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">General</h3>
          </div>
          <div className="divide-y divide-app-border">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">Auto-detect SD cards</p>
                <p className="text-xs text-txt-tertiary">Automatically scan for new media when SD cards are inserted</p>
              </div>
              <div className={`toggle-track ${autoDetect ? 'on' : ''}`} onClick={() => setAutoDetect(!autoDetect)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">Verify after copy</p>
                <p className="text-xs text-txt-tertiary">Checksum verification ensures file integrity</p>
              </div>
              <div className={`toggle-track ${verifyCopy ? 'on' : ''}`} onClick={() => setVerifyCopy(!verifyCopy)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">Delete from source after import</p>
                <p className="text-xs text-txt-tertiary">Remove files from SD card after successful import</p>
              </div>
              <div className={`toggle-track ${deleteSource ? 'on' : ''}`} onClick={() => setDeleteSource(!deleteSource)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">Launch with system</p>
                <p className="text-xs text-txt-tertiary">Start RapidReady when you log in</p>
              </div>
              <div className={`toggle-track ${launchSystem ? 'on' : ''}`} onClick={() => setLaunchSystem(!launchSystem)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>

        {/* RapidRaw Integration */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">RapidRaw Integration</h3>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-txt-primary">Open in RapidRaw after import</p>
              <p className="text-xs text-txt-tertiary">Automatically open imported folder in RapidRaw</p>
            </div>
            <div className={`toggle-track ${openRapidRaw ? 'on' : ''}`} onClick={() => setOpenRapidRaw(!openRapidRaw)}>
              <div className="toggle-knob"></div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="bg-app-card border border-app-border rounded-xl p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-app-deepest" />
            </div>
            <h3 className="text-lg font-bold text-txt-primary">RapidReady</h3>
            <p className="text-xs text-txt-secondary mt-1">Version 0.1.0-alpha (Build 20250726)</p>
            <p className="text-xs text-txt-tertiary mt-2">A companion tool for RapidRaw</p>
            <p className="text-xs text-txt-tertiary mt-0.5">MIT License · © 2025</p>
            <div className="flex items-center gap-4 mt-4">
              <button className="text-xs text-accent hover:text-accent-hover transition-colors">GitHub Repository</button>
              <span className="text-txt-tertiary">·</span>
              <button className="text-xs text-accent hover:text-accent-hover transition-colors">RapidRaw by Timon Käch</button>
              <span className="text-txt-tertiary">·</span>
              <button className="text-xs text-accent hover:text-accent-hover transition-colors">Report an Issue</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
