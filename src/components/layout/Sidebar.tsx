import { Download, LayoutGrid, ShieldCheck, Clock, Settings } from "lucide-react";

export type ViewType = "import" | "library" | "health" | "history" | "settings";

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const NavButton = ({ view, icon: Icon, label }: { view: ViewType, icon: any, label: string }) => (
    <button
      className={`nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-app-hover ${activeView === view ? 'bg-app-hover text-accent' : 'text-txt-secondary'}`}
      onClick={() => onViewChange(view)}
    >
      <Icon className="w-[18px] h-[18px]" />
      <span className="tooltip">{label}</span>
    </button>
  );

  return (
    <nav className="w-[60px] bg-app-panel border-r border-app-border flex flex-col items-center py-3 flex-shrink-0 z-10">
      {/* Top nav items */}
      <div className="flex flex-col gap-1 flex-1">
        <NavButton view="import" icon={Download} label="Import" />
        <NavButton view="library" icon={LayoutGrid} label="Library" />
        <NavButton view="health" icon={ShieldCheck} label="Archive Health" />
        <NavButton view="history" icon={Clock} label="History" />
      </div>
      {/* Bottom: Settings */}
      <NavButton view="settings" icon={Settings} label="Settings" />
    </nav>
  );
}
