const fs = require('fs');
let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

const oldStructure = `<div className="w-full h-full bg-app-panel flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Collections */}
        <div className="flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setCollectionsOpen(!collectionsOpen)}>
            <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5" />
              Collections
            </h2>
            <ChevronDown className={\`w-3.5 h-3.5 text-txt-tertiary transition-transform \${!collectionsOpen ? "-rotate-90" : ""}\`} />
          </div>
          <div className={\`section-body p-2 space-y-0.5 \${!collectionsOpen ? "hidden" : ""}\`}>
            {/* Quick Filters */}
            <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-app-border text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
              <Plus className="w-3.5 h-3.5" />
              New Collection
            </button>
          </div>
        </div>

        {/* Section 2: Library */}
        <div className="flex flex-col">
          <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setLibraryOpen(!libraryOpen)}>
            <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5" />
              Library
            </h2>
            <ChevronDown className={\`w-3.5 h-3.5 text-txt-tertiary transition-transform \${!libraryOpen ? "-rotate-90" : ""}\`} />
          </div>
          
          <div className={\`section-body \${!libraryOpen ? "hidden" : ""}\`}>
            <div className="p-2 space-y-1 overflow-hidden">
              {/* Active Folder Display */}
              <div onClick={handleSelectFolder} className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
                <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
                <span className="truncate flex-1 text-txt-secondary">{rootPath ? rootPath.split('/').pop() : "Select Folder..."}</span>
                <Plus className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
              </div>

              {/* Tree */}
              <div className="pt-2">
                {renderTree()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

const newStructure = `<div className="w-full h-full bg-app-panel flex flex-col min-h-0 overflow-hidden">
      {/* Section 1: Collections */}
      <div className="flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setCollectionsOpen(!collectionsOpen)}>
          <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5" />
            Collections
          </h2>
          <ChevronDown className={\`w-3.5 h-3.5 text-txt-tertiary transition-transform \${!collectionsOpen ? "-rotate-90" : ""}\`} />
        </div>
        <div className={\`p-2 space-y-0.5 border-b border-app-border \${!collectionsOpen ? "hidden" : ""}\`}>
          {/* Quick Filters */}
          <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-app-border text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
            <Plus className="w-3.5 h-3.5" />
            New Collection
          </button>
        </div>
      </div>

      {/* Section 2: Library */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors flex-shrink-0" onClick={() => setLibraryOpen(!libraryOpen)}>
          <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5" />
            Library
          </h2>
          <ChevronDown className={\`w-3.5 h-3.5 text-txt-tertiary transition-transform \${!libraryOpen ? "-rotate-90" : ""}\`} />
        </div>
        
        <div className={\`flex flex-col flex-1 min-h-0 \${!libraryOpen ? "hidden" : ""}\`}>
          {/* Active Folder Display */}
          <div className="p-2 border-b border-app-border/50 flex-shrink-0">
            <div onClick={handleSelectFolder} className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
              <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
              <span className="truncate flex-1 text-txt-secondary">{rootPath ? rootPath.split('/').pop() : "Select Folder..."}</span>
              <Plus className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
            </div>
          </div>

          {/* Tree Scroll Area */}
          <div className="flex-1 overflow-y-auto p-2">
            {renderTree()}
          </div>
        </div>
      </div>
    </div>`;

if (!sidebarContent.includes('const newStructure')) {
  sidebarContent = sidebarContent.replace(oldStructure, newStructure);
  fs.writeFileSync(sidebarPath, sidebarContent);
  console.log('Fixed tree scrolling structure');
}
