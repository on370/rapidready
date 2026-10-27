import { ReactNode } from "react";
import { Sidebar, ViewType } from "./Sidebar";
import { useLibraryUIStore } from "../../stores/libraryUIStore";

interface AppShellProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onViewChange, children }: AppShellProps) {
  const isFullscreen = activeView === 'library' && useLibraryUIStore((state) => state.viewMode === 'fullscreen');

  return (
    <div className="h-screen w-screen flex overflow-hidden select-none bg-app-deepest text-txt-primary">
      <div className={isFullscreen ? 'hidden' : 'contents'}>
        <Sidebar activeView={activeView} onViewChange={onViewChange} />
      </div>
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-app-deepest relative">
        {children}
      </main>
    </div>
  );
}
