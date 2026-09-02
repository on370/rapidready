import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ViewType } from "./components/layout/Sidebar";
import { ImportView } from "./components/views/ImportView";
import { LibraryView } from "./components/views/LibraryView";
import { HealthView } from "./components/views/HealthView";
import { HistoryView } from "./components/views/HistoryView";
import { SettingsView } from "./components/views/SettingsView";
import { HelpModal } from "./components/ui/HelpModal";
import { AboutModal } from "./components/ui/AboutModal";
import "./App.css";

function App() {
  const [activeView, setActiveView] = useState<ViewType>("import");

  return (
    <AppShell activeView={activeView} onViewChange={setActiveView}>
      {activeView === "import" && <ImportView />}
      {activeView === "library" && <LibraryView />}
      {activeView === "health" && <HealthView />}
      {activeView === "history" && <HistoryView />}
      {activeView === "settings" && <SettingsView />}
      <HelpModal />
      <AboutModal />
    </AppShell>
  );
}

export default App;
