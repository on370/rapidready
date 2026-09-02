import { useState, useMemo } from "react";
import { Bookmark, ChevronDown, Plus, HardDrive, Folder, Image as ImageIcon, ChevronRight } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";

// Tree node definition
type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: { [key: string]: TreeNode };
  image?: LibraryImage;
};

// Helper to build a file tree from flat paths
function buildTree(images: LibraryImage[], rootPath: string): TreeNode {
  const root: TreeNode = { name: "Root", path: rootPath, isDir: true, children: {} };
  
  images.forEach(img => {
    // Only build tree for files inside rootPath
    if (!img.path.startsWith(rootPath)) return;
    
    let relPath = img.path.substring(rootPath.length);
    if (relPath.startsWith('/')) relPath = relPath.substring(1);
    
    const parts = relPath.split('/');
    
    let current = root;
    let currentPath = rootPath;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath + '/' + part;
      
      if (!current.children[part]) {
        const isFile = i === parts.length - 1;
        current.children[part] = {
          name: part,
          path: currentPath,
          isDir: !isFile,
          children: {},
          image: isFile ? img : undefined
        };
      }
      current = current.children[part];
    }
  });
  
  return root;
}

function TreeView({ node, depth = 0, rootFolder }: { node: TreeNode, depth?: number, rootFolder: string }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const { activeFolderPath, setActiveFolderPath, setViewMode, images, activeImageIndex, setActiveImageIndex } = useLibraryStore();
  
  const isSelected = activeFolderPath === node.path;
  
  // Get all files in this node for the badge
  const countFiles = (n: TreeNode): number => {
    let count = n.image ? 1 : 0;
    Object.values(n.children).forEach(c => count += countFiles(c));
    return count;
  };
  
  const fileCount = countFiles(node);
  const childNodes = Object.values(node.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!node.isDir) {
    const isActiveImage = images[activeImageIndex]?.path === node.image?.path;
    return (
      <div 
        className={`flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left ${isActiveImage ? 'bg-accent/20 text-accent font-medium' : 'hover:bg-app-hover text-txt-secondary'}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={(e) => {
          e.stopPropagation();
          // Find this image in the filtered images or global
          // For simplicity, just select its parent folder and set active image
          let parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
          if (!activeFolderPath || !node.path.startsWith(activeFolderPath)) {
             setActiveFolderPath(parentPath);
          } else {
             parentPath = activeFolderPath;
          }
          setViewMode('loupe');
          
          // Need to update active index
          const displayed = images.filter(img => img.path.startsWith(parentPath));
          const idx = displayed.findIndex(img => img.path === node.image?.path);
          if (idx !== -1) setActiveImageIndex(idx);
        }}
      >
        <ImageIcon className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
        <span className="text-xs text-txt-secondary truncate flex-1" title={node.name}>{node.name}</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div 
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left ${isSelected ? 'bg-accent/15' : 'hover:bg-app-hover'}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (isSelected) {
            setActiveFolderPath(rootFolder);
          } else {
            setActiveFolderPath(node.path);
          }
        }}
      >
        <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
           {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary" />}
        </div>
        <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-warning/70'}`} />
        <span className={`text-xs truncate flex-1 ${isSelected ? 'text-accent font-semibold' : 'text-txt-secondary'}`} title={node.name}>{node.name}</span>
        {fileCount > 0 && <span className="text-[10px] text-txt-tertiary ml-auto">({fileCount})</span>}
      </div>
      
      {isOpen && childNodes.length > 0 && (
        <div className="space-y-0.5">
          {childNodes.map((child, idx) => (
            <TreeView key={idx} node={child} depth={depth + 1} rootFolder={rootFolder} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LibraryLeftSidebar() {
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const { images, setImages, setActiveFolderPath, setViewMode, rootPath, setRootPath } = useLibraryStore();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({ directory: true });
      if (selected && !Array.isArray(selected)) {
        setRootPath(selected);
        setActiveFolderPath(selected); // Reset filter to root
        setViewMode('grid');
        const loadedImages: LibraryImage[] = await invoke('scan_archive_directory', { path: selected });
        setImages(loadedImages);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const tree = useMemo(() => {
    if (!rootPath || images.length === 0) return null;
    return buildTree(images, rootPath);
  }, [images, rootPath]);

  const renderTree = () => {
    if (!tree) return <div className="text-xs text-txt-tertiary text-center py-4">No folder selected</div>;
    return Object.values(tree.children).sort((a,b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).map((child, idx) => (
      <TreeView key={idx} node={child} depth={0} rootFolder={rootPath || ''} />
    ));
  };

  return (
    <div className="w-full h-full bg-app-panel flex flex-col min-h-0 overflow-hidden">
      {/* Section 1: Collections */}
      <div className="flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setCollectionsOpen(!collectionsOpen)}>
          <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5" />
            Collections
          </h2>
          <ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform ${!collectionsOpen ? "-rotate-90" : ""}`} />
        </div>
        <div className={`p-2 space-y-0.5 border-b border-app-border ${!collectionsOpen ? "hidden" : ""}`}>
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
          <ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform ${!libraryOpen ? "-rotate-90" : ""}`} />
        </div>
        
        <div className={`flex flex-col flex-1 min-h-0 ${!libraryOpen ? "hidden" : ""}`}>
          {/* Active Folder Display */}
          <div className="p-2 border-b border-app-border/50 flex-shrink-0">
            <div onClick={handleSelectFolder} className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
              <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
              <span className="truncate flex-1 text-txt-secondary" title={rootPath || "Select Folder..."}>{rootPath ? rootPath.split('/').pop() : "Select Folder..."}</span>
              <Plus className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
            </div>
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
