import { Zap } from "lucide-react";

import { ViewType } from "./Sidebar";
export function TitleBar({ activeView }: { activeView?: ViewType }) {
  const titles = {
    import: "Media Importer",
    library: "Library & Culling",
    health: "Archive Health",
    history: "Import History",
    settings: "Settings"
  };
  const title = activeView ? titles[activeView] : "RapidReady";

  return (
    <header className="title-bar flex items-center justify-between px-4 h-11 bg-app-panel border-b border-app-border flex-shrink-0" style={{ minHeight: '44px' }}>
      {/* Left: Traffic lights + App name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 mr-3">
          <button className="traffic-light tl-close" title="Close"></button>
          <button className="traffic-light tl-minimize" title="Minimize"></button>
          <button className="traffic-light tl-maximize" title="Maximize"></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-app-deepest" />
          </div>
          <span className="text-sm font-semibold text-txt-primary tracking-tight">RapidReady</span>
          <span className="text-[10px] font-medium text-txt-tertiary bg-app-card px-1.5 py-0.5 rounded">BETA</span>
        </div>
      </div>
      {/* Right: Window title (dynamic) */}
      <div id="view-title" className="text-xs text-txt-tertiary">{title}</div>
    </header>
  );
}
