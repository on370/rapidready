import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { ImportView } from "./components/views/ImportView";
import { LibraryView } from "./components/views/LibraryView";
import { ToolsView } from "./components/views/ToolsView";
import { SettingsView } from "./components/views/SettingsView";
import { HelpModal } from "./components/ui/HelpModal";
import { AboutModal } from "./components/ui/AboutModal";
import { TextContextMenu } from "./components/ui/TextContextMenu";
import { ToastContainer } from "./components/ui/ToastContainer";
import { useToastStore } from "./stores/toastStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useNavigationStore } from "./stores/navigationStore";
import { CullingState, useLibraryStore, ArchiveScanProgress, ArchiveChunkPayload, LibraryImage } from "./stores/libraryStore";
import "./App.css";

function App() {
  const startupView = useSettingsStore(state => state.startupView);
  const { activeView, setActiveView } = useNavigationStore();

  useEffect(() => {
    setActiveView(startupView);
    invoke("show_main_window").catch(() => {});
  }, []);

  // Real-time synchronization for RapidRAW / external sidecar changes
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; culling: CullingState }>(
      "sidecar-updated",
      (event) => {
        useLibraryStore.getState().updateImageCullingByPath(event.payload.path, event.payload.culling);
      }
    );

    const unlistenWatcherError = listen<string>(
      "sidecar-watcher-error",
      (event) => {
        console.warn("Sidecar watcher error:", event.payload);
        useToastStore.getState().showWarning(
          "Automatische Sidecar-Synchronisation unterbrochen (z. B. Netzwerkfreigabe getrennt).",
          "Dateisystem-Überwachung"
        );
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
      unlistenWatcherError.then((unlisten) => unlisten());
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  // Real-time synchronization for archive directory scanning (chunks & progress)
  useEffect(() => {
    const unlistenScanProgress = listen<ArchiveScanProgress>(
      "archive_scan_progress",
      (event) => {
        const store = useLibraryStore.getState();
        if (store.activeScanId !== null && event.payload.scan_id !== undefined && event.payload.scan_id !== store.activeScanId) {
          return;
        }
        if (event.payload.is_cancelled) {
          store.setScanProgress(event.payload);
          if (store.images.length > 0 || event.payload.files_found > 0) {
            store.setScanState('stopped');
          } else {
            store.setScanState('idle');
          }
          store.setIsLoading(false);
          return;
        }
        if (store.scanState === 'stopped') {
          return;
        }
        store.setScanProgress(event.payload);
        if (event.payload.is_complete) {
          if (store.scanState === 'scanning' && store.images.length >= 100) {
            store.setScanState('completed');
            store.setIsLoading(false);
            setTimeout(() => {
              if (useLibraryStore.getState().scanState === 'completed') {
                useLibraryStore.getState().setScanState('idle');
              }
            }, 1200);
          } else {
            store.setScanState('idle');
            store.setIsLoading(false);
          }
        } else if (event.payload.is_paused) {
          store.setScanState('paused');
        } else if (store.scanState === 'connecting' || store.scanState === 'idle') {
          store.setScanState('scanning');
        }
      }
    );

    const unlistenScanChunk = listen<ArchiveChunkPayload | LibraryImage[]>(
      "archive_scan_chunk",
      (event) => {
        const store = useLibraryStore.getState();
        const files = Array.isArray(event.payload) ? event.payload : event.payload.files;
        const scanId = Array.isArray(event.payload) ? undefined : event.payload.scan_id;
        if (store.activeScanId !== null && scanId !== undefined && scanId !== store.activeScanId) {
          return;
        }
        store.appendImageChunk(files);
        if (store.scanState === 'connecting' || store.scanState === 'idle') {
          store.setScanState('scanning');
        }
      }
    );

    return () => {
      unlistenScanProgress.then((unlisten) => unlisten());
      unlistenScanChunk.then((unlisten) => unlisten());
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

  const [textMenu, setTextMenu] = useState<{
    x: number;
    y: number;
    target: HTMLInputElement | HTMLTextAreaElement;
  } | null>(null);

  // Global context menu suppression (suppress browser context menu, custom text menu for inputs)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setTextMenu({
          x: e.clientX,
          y: e.clientY,
          target: target as HTMLInputElement | HTMLTextAreaElement,
        });
      } else {
        setTextMenu(null);
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
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
      <ToastContainer />
      {textMenu && (
        <TextContextMenu
          x={textMenu.x}
          y={textMenu.y}
          target={textMenu.target}
          onClose={() => setTextMenu(null)}
        />
      )}
    </AppShell>
  );
}

export default App;
