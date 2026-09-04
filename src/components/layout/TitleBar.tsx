import { invoke } from "@tauri-apps/api/core";
import { ViewType } from "./Sidebar";

export function TitleBar({ activeView }: { activeView?: ViewType }) {
  const titles: Record<ViewType, string> = {
    import: "Media Importer",
    library: "Library & Culling",
    tools: "Tools & Dashboard",
    settings: "Settings"
  };
  const title = activeView ? titles[activeView] : "RapidReady";

  return (
    <header 
      data-tauri-drag-region
      onDoubleClick={() => invoke("toggle_maximize_window")}
      className="title-bar flex items-center justify-between px-4 h-11 bg-app-panel border-b border-app-border flex-shrink-0 select-none" 
      style={{ minHeight: '44px' }}
    >
      {/* Left: Traffic lights + App name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 mr-3">
          <button 
            className="traffic-light tl-close cursor-pointer" 
            title="Schließen"
            onClick={() => invoke("close_window")}
          />
          <button 
            className="traffic-light tl-minimize cursor-pointer" 
            title="Minimieren"
            onClick={() => invoke("minimize_window")}
          />
          <button 
            className="traffic-light tl-maximize cursor-pointer" 
            title="Maximieren"
            onClick={() => invoke("toggle_maximize_window")}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-txt-primary tracking-tight">RapidReady</span>
          <span className="text-[10px] font-medium text-txt-tertiary bg-app-card px-1.5 py-0.5 rounded">BETA</span>
        </div>
      </div>
      {/* Right: Window title (dynamic) */}
      <div id="view-title" className="text-xs text-txt-tertiary">{title}</div>
    </header>
  );
}
