import { ReactNode } from "react";
import { Sidebar, ViewType } from "./Sidebar";

interface AppShellProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onViewChange, children }: AppShellProps) {
  return (
    <div className="h-screen w-screen flex overflow-hidden select-none bg-app-deepest text-txt-primary">
      <Sidebar activeView={activeView} onViewChange={onViewChange} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-app-deepest relative">
        {children}
      </main>
    </div>
  );
}
