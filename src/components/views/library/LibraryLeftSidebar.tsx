import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../../stores/settingsStore";
import { Bookmark, ChevronDown, Plus, HardDrive, Folder, ChevronRight, FolderOpen, Sparkles, Loader2, Camera } from "lucide-react";
import { open, ask } from '@tauri-apps/plugin-dialog';
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";
import { normalizePath, normalizeSlash } from "../../../utils/image";

// Folder Tree node definition (folders only, no leaf file clutter)
type TreeNode = {
  name: string;
  path: string;
  fileCount: number;
  children: { [key: string]: TreeNode };
};

// Helper to build a clean folder tree from flat image paths
function buildTree(images: LibraryImage[], rootPath: string): TreeNode {
  const normRoot = normalizeSlash(rootPath);
  const normRootLower = normRoot.toLowerCase();
  const root: TreeNode = { name: "Root", path: normRoot, fileCount: 0, children: {} };
  const rootLen = normRoot.length;
  
  for (let idx = 0; idx < images.length; idx++) {
    const normImgPath = normalizeSlash(images[idx].path);
    if (!normImgPath.toLowerCase().startsWith(normRootLower)) continue;
    root.fileCount++;
    
    let relPath = normImgPath.substring(rootLen);
    if (relPath.charCodeAt(0) === 47 /* '/' */) relPath = relPath.substring(1);
    
    const parts = relPath.split('/');
    if (parts.length <= 1) continue; // File directly in root folder
    
    let current = root;
    let currentPath = normRoot;
    const end = parts.length - 1;
    for (let i = 0; i < end; i++) {
      const part = parts[i];
      currentPath = currentPath + '/' + part;
      let child = current.children[part];
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          fileCount: 0,
          children: {}
        };
        current.children[part] = child;
      }
      current = child;
      current.fileCount++;
    }
  }
  
  return root;
}

function TreeView({ node, depth = 0, rootFolder }: { node: TreeNode, depth?: number, rootFolder: string }) {
  const [isOpen, setIsOpen] = useState(depth < 3);
  const { activeFolderPath, setActiveFolderPath, activeImageFolder } = useLibraryStore();
  const nodeRef = useRef<HTMLDivElement>(null);
  
  const normNodePath = normalizePath(node.path);
  const normActiveFolder = normalizePath(activeFolderPath);
  const normImageFolder = normalizePath(activeImageFolder);

  const isSelected = !!normActiveFolder && normActiveFolder === normNodePath;
  const isImageLocation = !!normImageFolder && normImageFolder === normNodePath;
  const isAncestorOfImage = normImageFolder ? (normImageFolder === normNodePath || normImageFolder.startsWith(normNodePath + '/')) : false;

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
  
  const rootPath = useLibraryStore((s) => s.rootPath);
  const imageCount = useLibraryStore((s) => s.images.length);
  const scanState = useLibraryStore((s) => s.scanState);
  const lastImportPaths = useLibraryStore((s) => s.lastImportPaths);
  const isViewingLastImport = useLibraryStore((s) => s.isViewingLastImport);
  const setIsViewingLastImport = useLibraryStore((s) => s.setIsViewingLastImport);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const loadArchive = useLibraryStore((s) => s.loadArchive);

  const loadFolder = async (path: string) => {
    setLastLibraryPath(path);
    await loadArchive(path, false);
  };

  const handleFolderChange = async (newPath: string) => {
    if (rootPath && normalizePath(newPath) === normalizePath(rootPath)) {
      return;
    }

    const { scanState: curScanState, pauseScan, resumeScan, cancelScan, scanProgress, images } = useLibraryStore.getState();

    // If an archive scan is actively running, pause and ask the user
    if (curScanState === 'scanning' || curScanState === 'connecting') {
      pauseScan();

      const currentName = rootPath ? (normalizeSlash(rootPath).split('/').pop() || rootPath) : '';
      const newName = normalizeSlash(newPath).split('/').pop() || newPath;
      const count = scanProgress?.files_found ?? images.length;
      const formattedCount = count.toLocaleString();

      const confirmed = await ask(
        t('dialog.switchFolderMessage', {
          current: currentName,
          count: formattedCount,
          newFolder: newName,
          defaultValue: `Die Indexierung von "${currentName}" läuft noch (${formattedCount} Fotos geladen).\n\nMöchtest du den aktuellen Scan abbrechen und zu "${newName}" wechseln?`
        }),
        {
          title: t('dialog.switchFolderTitle', { defaultValue: 'Ordner wechseln?' }),
          kind: 'warning',
          okLabel: t('dialog.switchFolderConfirm', { defaultValue: 'Ja, abbrechen & wechseln' }),
          cancelLabel: t('dialog.switchFolderCancel', { defaultValue: 'Nein, hier bleiben' }),
        }
      );

      if (!confirmed) {
        // User wants to stay: resume scan!
        resumeScan();
        return;
      }

      // User confirmed: cancel active scan
      cancelScan();
    }

    loadFolder(newPath);
  };

  // Auto-load last library on mount if nothing is loaded
  useEffect(() => {
    if (!rootPath && lastLibraryPath) {
      loadFolder(lastLibraryPath);
    }
  }, []);

  const [tree, setTree] = useState<TreeNode | null>(() => {
    const store = useLibraryStore.getState();
    return store.rootPath && store.images.length > 0 ? buildTree(store.images, store.rootPath) : null;
  });
  const lastTreeUpdateRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up throttle timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!rootPath || imageCount === 0) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      setTree(null);
      return;
    }

    const updateTreeNow = () => {
      const currentImages = useLibraryStore.getState().images;
      setTree(buildTree(currentImages, rootPath));
      lastTreeUpdateRef.current = Date.now();
    };

    // If not actively scanning (e.g. idle, paused, stopped, completed), update immediately
    if (scanState !== 'scanning' && scanState !== 'connecting') {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      updateTreeNow();
      return;
    }

    // While scanning: throttle tree updates to at most once every 350ms
    const now = Date.now();
    const timeSinceLast = now - lastTreeUpdateRef.current;
    if (timeSinceLast >= 350) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      updateTreeNow();
    } else if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        updateTreeNow();
      }, Math.max(50, 350 - timeSinceLast));
    }
  }, [rootPath, imageCount, scanState]);

  const renderTree = () => {
    if (isLoading && imageCount === 0) {
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
          {lastImportPaths.length > 0 ? (
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
          ) : (
            <div className="px-2 py-1 text-xs text-txt-tertiary italic">
              {t("sidebar.noCollections")}
            </div>
          )}
          {/* v0.2 roadmap: Neue Sammlung */}
          {/* <button className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-dashed border-app-border text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
            <Plus className="w-3.5 h-3.5" />{t("sidebar.newCollection")}</button> */}
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
                  {rootPath ? (locations.find(l => normalizePath(l.path) === normalizePath(rootPath))?.name || normalizeSlash(rootPath).split('/').pop()) : t("sidebar.noFolder")}
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
                      <div className="px-3 py-1.5 text-[10px] font-bold text-txt-tertiary uppercase tracking-wider">{t("sidebar.locationsTitle")}</div>
                      {locations.map(loc => (
                        <button 
                          key={loc.id}
                          className="w-full text-left px-3 py-2 hover:bg-app-hover text-txt-secondary hover:text-txt-primary truncate transition-colors flex items-center gap-2"
                          onClick={() => {
                            setDropdownOpen(false);
                            handleFolderChange(loc.path);
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
                        const defaultName = normalizeSlash(selected).split('/').pop() || selected;
                        addLocation({ id: Date.now().toString(), name: defaultName, path: selected });
                        handleFolderChange(selected);
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
                        handleFolderChange(selected);
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
