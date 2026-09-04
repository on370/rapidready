import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "./components/layout/AppShell";
import { ImportView } from "./components/views/ImportView";
import { LibraryView } from "./components/views/LibraryView";
import { ToolsView } from "./components/views/ToolsView";
import { SettingsView } from "./components/views/SettingsView";
import { HelpModal } from "./components/ui/HelpModal";
import { AboutModal } from "./components/ui/AboutModal";
import { useSettingsStore } from "./stores/settingsStore";
import { useNavigationStore } from "./stores/navigationStore";
import "./App.css";

function App() {
  const startupView = useSettingsStore(state => state.startupView);
  const { activeView, setActiveView } = useNavigationStore();

  useEffect(() => {
    setActiveView(startupView);
  }, []);

  // Global macOS Quit (Cmd + Q / Ctrl + Q) handler in capture phase
  useEffect(() => {
    const handleGlobalQuit = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'q' || e.key === 'Q')) {
        invoke('quit_app').catch(() => {});
      }
    };
    window.addEventListener('keydown', handleGlobalQuit, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalQuit, { capture: true });
  }, []);

  return (
    <AppShell activeView={activeView} onViewChange={setActiveView}>
      <div className={`flex-1 flex flex-col h-full min-h-0 ${activeView === "import" ? "" : "hidden"}`}>
        <ImportView />
      </div>
      <div className={`flex-1 flex flex-col h-full min-h-0 ${activeView === "library" ? "" : "hidden"}`}>
        <LibraryView />
      </div>
      <div className={`flex-1 flex flex-col h-full min-h-0 ${activeView === "tools" ? "" : "hidden"}`}>
        <ToolsView />
      </div>
      <div className={`flex-1 flex flex-col h-full min-h-0 ${activeView === "settings" ? "" : "hidden"}`}>
        <SettingsView />
      </div>
      <HelpModal />
      <AboutModal />
    </AppShell>
  );
}

export default App;
