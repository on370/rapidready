const fs = require('fs');

let viewPath = 'src/components/views/LibraryView.tsx';
let viewContent = `import { useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { LibraryLeftSidebar } from "./library/LibraryLeftSidebar";
import { LibraryCenter } from "./library/LibraryCenter";
import { LibraryInspector } from "./library/LibraryInspector";

export function LibraryView() {
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'loupe'>('grid');

  return (
    <div className="flex-1 w-full overflow-hidden flex flex-col min-h-0">
      <PanelGroup direction="horizontal" className="h-full w-full">
        <Panel defaultSize={20} minSize={15} maxSize={30} className="flex min-h-0">
          <LibraryLeftSidebar />
        </Panel>
        
        <PanelResizeHandle className="w-1 bg-app-border hover:bg-accent/50 transition-colors cursor-col-resize active:bg-accent delay-75" />
        
        <Panel defaultSize={inspectorVisible ? 60 : 80} minSize={40} className="flex min-h-0 bg-app-bg">
          <LibraryCenter 
            viewMode={viewMode} 
            setViewMode={setViewMode} 
            toggleInspector={() => setInspectorVisible(!inspectorVisible)} 
          />
        </Panel>

        {inspectorVisible && (
          <>
            <PanelResizeHandle className="w-1 bg-app-border hover:bg-accent/50 transition-colors cursor-col-resize active:bg-accent delay-75" />
            <Panel defaultSize={20} minSize={15} maxSize={30} className="flex min-h-0">
              <LibraryInspector close={() => setInspectorVisible(false)} />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}`;
fs.writeFileSync(viewPath, viewContent);
console.log('Fixed LibraryView with Resizable Panels');
