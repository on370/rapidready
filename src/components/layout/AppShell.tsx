import { ReactNode } from "react";
import { TitleBar } from "./TitleBar";
import { Sidebar, ViewType } from "./Sidebar";

interface AppShellProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onViewChange, children }: AppShellProps) {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden select-none bg-app-deepest text-txt-primary">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeView={activeView} onViewChange={onViewChange} />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-app-deepest relative">
          {children}
        </main>
      </div>
    </div>
  );
}
