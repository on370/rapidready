import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ViewType } from "./components/layout/Sidebar";
import { ImportView } from "./components/views/ImportView";
import { LibraryView } from "./components/views/LibraryView";
import { ToolsView } from "./components/views/ToolsView";
import { SettingsView } from "./components/views/SettingsView";
import { HelpModal } from "./components/ui/HelpModal";
import { AboutModal } from "./components/ui/AboutModal";
import { useSettingsStore } from "./stores/settingsStore";
import "./App.css";

function App() {
  const startupView = useSettingsStore(state => state.startupView);
  const [activeView, setActiveView] = useState<ViewType>(startupView);

  return (
    <AppShell activeView={activeView} onViewChange={setActiveView}>
      {activeView === "import" && <ImportView />}
      {activeView === "library" && <LibraryView />}
            {activeView === "tools" && <ToolsView />}
      {activeView === "settings" && <SettingsView />}
      <HelpModal />
      <AboutModal />
    </AppShell>
  );
}

export default App;
