import { Download, LayoutGrid, Settings, CircleHelp, Copyright, Wrench, Loader2 } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { useImportStore } from "../../stores/importStore";

export type ViewType = "import" | "library" | "tools" | "settings";

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const isScanning = useImportStore(state => state.isScanning);

  const NavButton = ({ view, icon: Icon, iconClassName, label }: { view: ViewType, icon: any, iconClassName?: string, label: string }) => (
    <button
      className={`nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-app-hover relative ${activeView === view ? 'bg-app-hover text-accent' : 'text-txt-secondary'}`}
      onClick={() => onViewChange(view)}
    >
      <Icon className={`w-[18px] h-[18px] ${iconClassName || ''}`} />
      {view === 'import' && isScanning && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent animate-ping" />
      )}
      <span className="tooltip">{label}</span>
    </button>
  );

  return (
    <nav className="w-[60px] bg-app-panel border-r border-app-border flex flex-col items-center py-3 flex-shrink-0 z-10">
      {/* Top nav items */}
      <div className="flex flex-col gap-1 flex-1">
        <NavButton 
          view="import" 
          icon={isScanning ? Loader2 : Download} 
          iconClassName={isScanning ? "animate-spin text-accent" : ""}
          label={isScanning ? "Import (Scanning...)" : "Import"} 
        />
        <NavButton view="library" icon={LayoutGrid} label="Library" />
        <NavButton view="tools" icon={Wrench} label="Tools & Dashboard" />
      </div>
      <div className="flex flex-col gap-1">
        <button
          className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary"
          onClick={() => window.dispatchEvent(new Event('open-about-modal'))}
        >
          <Copyright className="w-[18px] h-[18px]" />
          <span className="tooltip">About</span>
        </button>
        <button
          className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary"
          onClick={() => emit('toggle-help-modal')}
        >
          <CircleHelp className="w-[18px] h-[18px]" />
          <span className="tooltip">Help</span>
        </button>
        {/* Bottom: Settings */}
        <NavButton view="settings" icon={Settings} label="Settings" />
      </div>
    </nav>
  );
}
