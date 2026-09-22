import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { AppShell } from "./components/layout/AppShell";
import { ViewType } from "./components/layout/Sidebar";
import { ImportView } from "./components/views/ImportView";
import { LibraryView } from "./components/views/LibraryView";
import { ToolsView } from "./components/views/ToolsView";
import { SettingsView } from "./components/views/SettingsView";
import { HelpModal } from "./components/ui/HelpModal";
import { AboutModal } from "./components/ui/AboutModal";
import { UpdateNotificationModal } from "./components/ui/UpdateNotificationModal";
import { TextContextMenu } from "./components/ui/TextContextMenu";
import { ToastContainer } from "./components/ui/ToastContainer";
import { DestructiveConfirmModal } from "./components/ui/DestructiveConfirmModal";
import { TourWelcomePrompt } from "./components/onboarding/TourWelcomePrompt";
import { TourOverlay } from "./components/onboarding/TourOverlay";
import { useOnboardingStore } from "./stores/onboardingStore";
import { useToastStore } from "./stores/toastStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUpdateStore } from "./stores/updateStore";
import { useNavigationStore } from "./stores/navigationStore";
import { CullingState, useLibraryStore, ArchiveScanProgress, ArchiveChunkPayload, LibraryImage } from "./stores/libraryStore";
import { useCollectionsStore } from "./stores/collectionsStore";
import "./App.css";

function App() {
  const { t } = useTranslation('settings');
  const startupView = useSettingsStore(state => state.startupView);
  const { activeView, setActiveView } = useNavigationStore();

  useEffect(() => {
    setActiveView(startupView);
    useCollectionsStore.getState().selectCollection(null);
    invoke("show_main_window").catch(() => {});
  }, []);

  // Check for updates on startup after 3.5s (allowing splashscreen to dismiss first)
  useEffect(() => {
    const timer = setTimeout(() => {
      useUpdateStore.getState().checkNow(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Check onboarding prompt eligibility after 1.5s
  useEffect(() => {
    const timer = setTimeout(() => {
      useOnboardingStore.getState().checkAndTriggerPrompt();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Listen for native menu trigger to replay/start guided tour
  useEffect(() => {
    const unlistenPromise = listen("start-guided-tour", () => {
      useOnboardingStore.getState().startTour('replay');
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Listen for menu trigger to check for updates
  useEffect(() => {
    const unlistenPromise = listen("trigger-check-updates", async () => {
      const res = await useUpdateStore.getState().checkNow(true);
      if (!res.hasUpdate) {
        if (res.error) {
          useToastStore.getState().showError(
            t('updates.checkError', { error: res.error }),
            t('updates.title')
          );
        } else {
          useToastStore.getState().showSuccess(
            t('updates.upToDate', { version: res.currentVersion }),
            t('updates.title')
          );
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [t]);

  // Listen for navigation view events from native menu
  useEffect(() => {
    const unlistenPromise = listen<ViewType>("navigate-view", (event) => {
      setActiveView(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setActiveView]);

  // Global view switching keyboard shortcuts (Cmd+1, Cmd+2, Cmd+,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveView('import');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveView('library');
        } else if (e.key === ',') {
          e.preventDefault();
          setActiveView('settings');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveView]);

  // Real-time synchronization for RapidRAW / external sidecar and file changes
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; culling: CullingState }>(
      "sidecar-updated",
      (event) => {
        useLibraryStore.getState().updateImageCullingByPath(event.payload.path, event.payload.culling);
      }
    );

    const unlistenFilesChanged = listen<{
      added: LibraryImage[];
      removed: string[];
      new_dirs: string[];
    }>("archive-files-changed", (event) => {
      const store = useLibraryStore.getState();
      if ((event.payload.added && event.payload.added.length > 0) || (event.payload.new_dirs && event.payload.new_dirs.length > 0)) {
        store.addImages(event.payload.added || [], event.payload.new_dirs || []);
      }
      if (event.payload.removed && event.payload.removed.length > 0) {
        store.removeImages(event.payload.removed);
      }
    });

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
      // Reconcile active folder in background when window gains focus
      state.reconcileActiveFolder().catch(() => {});
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      unlistenFilesChanged.then((unlisten) => unlisten());
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
        const dirs = Array.isArray(event.payload) ? [] : (event.payload.directories || []);
        const scanId = Array.isArray(event.payload) ? undefined : event.payload.scan_id;
        if (store.activeScanId !== null && scanId !== undefined && scanId !== store.activeScanId) {
          return;
        }
        if (dirs && dirs.length > 0) {
          store.addDiscoveredFolders(dirs);
        }
        store.appendImageChunk(files, dirs);
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
      <UpdateNotificationModal />
      <ToastContainer />
      <DestructiveConfirmModal />
      <TourWelcomePrompt />
      <TourOverlay />
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
