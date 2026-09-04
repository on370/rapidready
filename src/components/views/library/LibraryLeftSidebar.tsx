import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../../stores/settingsStore";
import { Bookmark, ChevronDown, Plus, HardDrive, Folder, ChevronRight, FolderOpen, Sparkles, Loader2, Camera } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";

// Folder Tree node definition (folders only, no leaf file clutter)
type TreeNode = {
  name: string;
  path: string;
  fileCount: number;
  children: { [key: string]: TreeNode };
};

// Helper to build a clean folder tree from flat image paths
function buildTree(images: LibraryImage[], rootPath: string): TreeNode {
  const root: TreeNode = { name: "Root", path: rootPath, fileCount: 0, children: {} };
  
  images.forEach(img => {
    if (!img.path.startsWith(rootPath)) return;
    root.fileCount++;
    
    let relPath = img.path.substring(rootPath.length);
    if (relPath.startsWith('/')) relPath = relPath.substring(1);
    
    const parts = relPath.split('/');
    if (parts.length <= 1) return; // File directly in root folder
    
    let current = root;
    let currentPath = rootPath;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentPath = currentPath + '/' + part;
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          fileCount: 0,
          children: {}
        };
      }
      current = current.children[part];
      current.fileCount++;
    }
  });
  
  return root;
}

function TreeView({ node, depth = 0, rootFolder }: { node: TreeNode, depth?: number, rootFolder: string }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const { activeFolderPath, setActiveFolderPath, activeImageFolder } = useLibraryStore();
  const nodeRef = useRef<HTMLDivElement>(null);
  
  const isSelected = activeFolderPath === node.path;
  const isImageLocation = activeImageFolder === node.path;
  const isAncestorOfImage = activeImageFolder ? (activeImageFolder === node.path || activeImageFolder.startsWith(node.path + '/')) : false;

  // Auto-expand tree branch leading to the active photo
  useEffect(() => {
    if (isAncestorOfImage) {
      setIsOpen(true);
    }
  }, [isAncestorOfImage]);

  // Auto-scroll the folder containing the active photo into view
  useEffect(() => {
    if (isImageLocation && nodeRef.current) {
      const timer = setTimeout(() => {
        nodeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isImageLocation]);

  const childNodes = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));

  // Distinct visual styling for folder selection vs. photo location (Variant C: clean icon/badge distinction)
  let containerStyle = "hover:bg-app-hover text-txt-secondary";
  if (isSelected && isImageLocation) {
    containerStyle = "bg-accent/20 text-accent font-semibold";
  } else if (isSelected) {
    containerStyle = "bg-accent/15 text-accent font-semibold";
  } else if (isImageLocation) {
    containerStyle = "bg-amber-400/10 text-txt-primary font-medium";
  }

  return (
    <div className="space-y-0.5">
      <div 
        ref={nodeRef}
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left ${containerStyle}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (isSelected) {
            setActiveFolderPath(rootFolder);
          } else {
            setActiveFolderPath(node.path);
          }
        }}
      >
        <div 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (childNodes.length > 0) setIsOpen(!isOpen); 
          }} 
          className={`p-0.5 rounded cursor-pointer ${childNodes.length > 0 ? 'hover:bg-white/10' : 'opacity-0 pointer-events-none'}`}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary" />}
        </div>
        
        {isImageLocation ? (
          <FolderOpen className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-amber-400'}`} />
        ) : (
          <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-warning/70'}`} />
        )}
        
        <span 
          className={`text-xs truncate flex-1 ${
            isSelected ? 'text-accent font-semibold' : isImageLocation ? 'text-txt-primary font-medium' : 'text-txt-secondary'
          }`} 
          title={node.name}
        >
          {node.name}
        </span>

        {isImageLocation && (
          <span title="Enthält das aktuell ausgewählte Foto" className="flex items-center flex-shrink-0">
            <Camera 
              className={`w-3 h-3 animate-pulse ${isSelected ? 'text-accent' : 'text-amber-400'}`} 
            />
          </span>
        )}

        {node.fileCount > 0 && (
          <span className="text-[10px] text-txt-tertiary ml-auto font-mono flex-shrink-0">
            ({node.fileCount})
          </span>
        )}
      </div>
      
      {isOpen && childNodes.length > 0 && (
        <div className="space-y-0.5">
          {childNodes.map((child) => (
            <TreeView key={child.path} node={child} depth={depth + 1} rootFolder={rootFolder} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LibraryLeftSidebar() {
  const { t } = useTranslation('library');
  const { lastLibraryPath, setLastLibraryPath, locations, addLocation } = useSettingsStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const { 
    images, setImages, setActiveFolderPath, setViewMode, rootPath, setRootPath,
    lastImportPaths, isViewingLastImport, setIsViewingLastImport,
    isLoading, setIsLoading
  } = useLibraryStore();

  const loadFolder = async (path: string) => {
    setRootPath(path);
    setActiveFolderPath(path);
    setViewMode('grid');
    setLastLibraryPath(path);
    setIsLoading(true);
    try {
      const loadedImages = (await invoke('scan_archive_directory', { path })) as LibraryImage[];
      setImages(loadedImages);
    } catch(e) {
      console.error("Failed to load archive directory:", e);
      setIsLoading(false);
    }
  };

  // Auto-load last library on mount if nothing is loaded
  useEffect(() => {
    if (!rootPath && lastLibraryPath) {
      loadFolder(lastLibraryPath);
    }
  }, []);

  const tree = useMemo(() => {
    if (!rootPath || images.length === 0) return null;
    return buildTree(images, rootPath);
  }, [images, rootPath]);

  const renderTree = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-txt-secondary">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-xs">{t("sidebar.scanning", "Scanning library...")}</span>
        </div>
      );
    }
    if (!tree) return <div className="text-xs text-txt-tertiary text-center py-4">{t("sidebar.noFolder")}</div>;
    return Object.values(tree.children).sort((a,b) => a.name.localeCompare(b.name)).map((child) => (
      <TreeView key={child.path} node={child} depth={0} rootFolder={rootPath || ''} />
    ));
  };

  return (
    <div className="w-full h-full bg-app-panel flex flex-col min-h-0 overflow-hidden">
      {/* Section 1: Collections */}
      <div className="flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setCollectionsOpen(!collectionsOpen)}>
          <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5" />{t("sidebar.collections")}</h2>
          <ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform ${!collectionsOpen ? "-rotate-90" : ""}`} />
        </div>
        <div className={`p-2 space-y-1 border-b border-app-border ${!collectionsOpen ? "hidden" : ""}`}>
          {lastImportPaths.length > 0 && (
            <button 
              onClick={() => setIsViewingLastImport(true)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${isViewingLastImport ? 'bg-accent/20 text-accent font-semibold' : 'text-txt-primary hover:bg-app-hover'}`}
            >
              <div className="flex items-center gap-2 truncate">
                <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="truncate">{t("sidebar.lastImport")}</span>
              </div>
              <span className="text-[10px] text-txt-tertiary flex-shrink-0">({lastImportPaths.length})</span>
            </button>
          )}
          {/* Quick Filters */}
          <button className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-dashed border-app-border text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
            <Plus className="w-3.5 h-3.5" />{t("sidebar.newCollection")}</button>
        </div>
      </div>

      {/* Section 2: Library */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors flex-shrink-0" onClick={() => setLibraryOpen(!libraryOpen)}>
          <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5" />
            {t("sidebar.library")}
            {isLoading && <Loader2 className="w-3 h-3 text-accent animate-spin ml-1" />}
          </h2>
          <ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform ${!libraryOpen ? "-rotate-90" : ""}`} />
        </div>
        
        <div className={`flex flex-col flex-1 min-h-0 ${!libraryOpen ? "hidden" : ""}`}>
          {/* Active Folder Display */}
          <div className="p-3 border-b border-app-border/50 flex flex-col gap-2 flex-shrink-0 relative">
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)} 
              className="w-full flex items-center justify-between px-3 py-1.5 bg-app-card hover:bg-app-hover border border-app-border rounded-lg transition-colors text-xs text-txt-primary"
            >
              <div className="flex items-center gap-2 truncate">
                <HardDrive className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="truncate font-medium" title={rootPath || undefined}>
                  {rootPath ? (locations.find(l => l.path === rootPath)?.name || rootPath.split('/').pop()) : t("sidebar.noFolder")}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
                <div className="absolute top-[3.2rem] left-3 right-3 bg-app-card border border-app-border rounded-lg shadow-xl z-50 overflow-hidden text-xs py-1 animate-in fade-in zoom-in-95 duration-100">
                  
                  {locations.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold text-txt-tertiary uppercase tracking-wider">Locations</div>
                      {locations.map(loc => (
                        <button 
                          key={loc.id}
                          className="w-full text-left px-3 py-2 hover:bg-app-hover text-txt-secondary hover:text-txt-primary truncate transition-colors flex items-center gap-2"
                          onClick={() => {
                            setDropdownOpen(false);
                            loadFolder(loc.path);
                          }}
                        >
                          <Folder className="w-3.5 h-3.5 text-accent" />
                          <span className="truncate">{loc.name}</span>
                        </button>
                      ))}
                      <div className="h-px bg-app-border my-1"></div>
                    </>
                  )}
                  
                  <button 
                    onClick={async () => {
                      setDropdownOpen(false);
                      const selected = await open({ directory: true });
                      if (selected && typeof selected === 'string') {
                        const defaultName = selected.split('/').pop() || selected;
                        addLocation({ id: Date.now().toString(), name: defaultName, path: selected });
                        loadFolder(selected);
                      }
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-app-hover text-txt-secondary hover:text-accent transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t("sidebar.addLocation")}
                  </button>

                  <button 
                    onClick={async () => {
                      setDropdownOpen(false);
                      const selected = await open({ directory: true });
                      if (selected && typeof selected === 'string') {
                        loadFolder(selected);
                      }
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-app-hover text-txt-secondary hover:text-txt-primary transition-colors flex items-center gap-2"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {t("sidebar.browseTemp")}
                  </button>

                </div>
              </>
            )}
          </div>

          {/* Tree Scroll Area */}
          <div className="flex-1 overflow-y-auto p-2">
            {renderTree()}
          </div>
        </div>
      </div>
    </div>
  );
}
