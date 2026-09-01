import { useState } from "react";
import { LibraryLeftSidebar } from "./library/LibraryLeftSidebar";
import { LibraryCenter } from "./library/LibraryCenter";
import { LibraryInspector } from "./library/LibraryInspector";

export function LibraryView() {
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'loupe'>('grid');

  return (
    <div className="flex-1 w-full overflow-hidden flex flex-col">
      <div className="flex h-full w-full min-w-0 flex-1">
        <LibraryLeftSidebar />
        <LibraryCenter 
          viewMode={viewMode} 
          setViewMode={setViewMode} 
          toggleInspector={() => setInspectorVisible(!inspectorVisible)} 
        />
        {inspectorVisible && <LibraryInspector close={() => setInspectorVisible(false)} />}
      </div>
    </div>
  );
}
