import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { ImportView } from "./components/views/ImportView";
import { LibraryView } from "./components/views/LibraryView";
import { ToolsView } from "./components/views/ToolsView";
import { SettingsView } from "./components/views/SettingsView";
import { HelpModal } from "./components/ui/HelpModal";
import { AboutModal } from "./components/ui/AboutModal";
import { useSettingsStore } from "./stores/settingsStore";
import { useNavigationStore } from "./stores/navigationStore";
import { CullingState, useLibraryStore } from "./stores/libraryStore";
import "./App.css";

function App() {
  const startupView = useSettingsStore(state => state.startupView);
  const { activeView, setActiveView } = useNavigationStore();

  useEffect(() => {
    setActiveView(startupView);
  }, []);

  // Real-time synchronization for RapidRAW / external sidecar changes
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; culling: CullingState }>(
      "sidecar-updated",
      (event) => {
        useLibraryStore.getState().updateImageCullingByPath(event.payload.path, event.payload.culling);
      }
    );

    // Immediate fallback when returning to the RapidReady window from RapidRAW
    const handleWindowFocus = async () => {
      const state = useLibraryStore.getState();
      const active = state.images[state.activeImageIndex];
      if (active) {
        try {
          const culling: CullingState = await invoke("get_culling_state", { path: active.path });
          state.updateImageCullingByPath(active.path, culling);
        } catch {}
      }
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("focus", handleWindowFocus);
    };
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
