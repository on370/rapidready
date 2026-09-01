import { Bookmark, ChevronDown, Plus, HardDrive, Folder } from "lucide-react";
import { useState } from "react";

export function LibraryLeftSidebar() {
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);

  return (
    <div className="w-[250px] flex-shrink-0 border-r border-app-border bg-app-panel flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Collections */}
        <div className={`section-collapsible ${!collectionsOpen ? 'collapsed' : ''}`}>
          <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setCollectionsOpen(!collectionsOpen)}>
            <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5" />
              Collections
            </h2>
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary section-chevron" />
          </div>
          <div className="section-body p-2 space-y-0.5" style={{ maxHeight: '500px' }}>
            <button className="lib-collection-item w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium text-left transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0"></span>
              <span className="truncate flex-1">Urlaub 2025 Mallorca</span>
              <span className="text-[10px] bg-accent/20 px-1.5 py-0.5 rounded text-accent">847</span>
            </button>
            <button className="lib-collection-item w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-txt-secondary text-sm hover:bg-app-hover text-left transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0"></span>
              <span className="truncate flex-1">Kunde — Müller GmbH</span>
              <span className="text-[10px] bg-app-card px-1.5 py-0.5 rounded text-txt-tertiary">312</span>
            </button>
            <div className="pt-1">
              <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-app-border text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
                <Plus className="w-3.5 h-3.5" />
                New Collection
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Library (file tree) */}
        <div className={`section-collapsible ${!libraryOpen ? 'collapsed' : ''}`}>
          <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setLibraryOpen(!libraryOpen)}>
            <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5" />
              Library
            </h2>
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary section-chevron" />
          </div>
          <div className="section-body" style={{ maxHeight: '800px' }}>
            {/* Archive selector */}
            <div className="px-3 py-2 border-b border-app-border">
              <div className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
                <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
                <span className="text-txt-primary truncate">/Volumes/Photos/Archiv</span>
                <ChevronDown className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
              </div>
            </div>

            {/* Browsable file tree */}
            <div className="p-2 space-y-0.5">
              <div className="tree-item">
                <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer">
                  <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary tree-chevron" />
                  <Folder className="w-4 h-4 text-warning" />
                  <span className="text-sm text-txt-primary font-medium">2025</span>
                </div>
                <div className="tree-children ml-4 pl-3 border-l border-app-border space-y-0.5 mt-0.5">
                  <button className="lib-folder-item w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer text-left bg-app-hover">
                    <Folder className="w-3.5 h-3.5 text-warning/70" />
                    <span className="text-xs text-txt-secondary">2025-07-20</span>
                    <span className="text-[10px] text-txt-tertiary ml-auto">(32)</span>
                  </button>
                  <button className="lib-folder-item w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer text-left">
                    <Folder className="w-3.5 h-3.5 text-warning/70" />
                    <span className="text-xs text-txt-secondary">2025-07-19</span>
                    <span className="text-[10px] text-txt-tertiary ml-auto">(61)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
