const fs = require('fs');
let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

sidebarContent = `import { Bookmark, ChevronDown, Plus, HardDrive, Folder, Image as ImageIcon, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";

// Recursive Node Type
type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: Record<string, TreeNode>;
  image?: LibraryImage;
};

function buildTree(images: LibraryImage[], rootPath: string): TreeNode {
  const root: TreeNode = { name: rootPath.split('/').pop() || 'Root', path: rootPath, isDir: true, children: {} };
  
  images.forEach(img => {
    // Strip root path to get relative
    const relative = img.path.startsWith(rootPath) ? img.path.substring(rootPath.length) : img.path;
    const parts = relative.split('/').filter(Boolean);
    
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

function TreeView({ node, depth = 0 }: { node: TreeNode, depth?: number }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const { activeFolderPath, setActiveFolderPath, setViewMode, images, setActiveImageIndex } = useLibraryStore();
  
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
    return (
      <div 
        className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer text-left"
        style={{ paddingLeft: \`\${depth * 12 + 8}px\` }}
        onClick={(e) => {
          e.stopPropagation();
          // Find this image in the filtered images or global
          // For simplicity, just select its parent folder and set active image
          const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
          setActiveFolderPath(parentPath);
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
        className={\`flex items-center gap-1.5 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left \${isSelected ? 'bg-accent/15' : 'hover:bg-app-hover'}\`}
        style={{ paddingLeft: \`\${depth * 12 + 4}px\` }}
        onClick={() => {
          setIsOpen(!isOpen);
          setActiveFolderPath(node.path);
        }}
      >
        <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
           {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary" />}
        </div>
        <Folder className={\`w-3.5 h-3.5 \${isSelected ? 'text-accent' : 'text-warning/70'}\`} />
        <span className={\`text-xs truncate flex-1 \${isSelected ? 'text-accent font-semibold' : 'text-txt-secondary'}\`} title={node.name}>{node.name}</span>
        {fileCount > 0 && <span className="text-[10px] text-txt-tertiary ml-auto">({fileCount})</span>}
      </div>
      
      {isOpen && childNodes.length > 0 && (
        <div className="space-y-0.5">
          {childNodes.map((child, idx) => (
            <TreeView key={idx} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LibraryLeftSidebar() {
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const { images, setImages, setActiveFolderPath, setViewMode } = useLibraryStore();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({ directory: true });
      if (selected && !Array.isArray(selected)) {
        setSelectedFolder(selected);
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
    if (!selectedFolder || images.length === 0) return null;
    return buildTree(images, selectedFolder);
  }, [images, selectedFolder]);

  return (
    <div className="w-[250px] flex-shrink-0 border-r border-app-border bg-app-panel flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Collections */}
        <div className={\`section-collapsible \${!collectionsOpen ? 'collapsed' : ''}\`}>
          <div className="px-4 py-3 border-b border-app-border flex items-center justify-between cursor-pointer hover:bg-app-hover/50 transition-colors" onClick={() => setCollectionsOpen(!collectionsOpen)}>
            <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5" />
              Collections
            </h2>
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary section-chevron" />
          </div>
          <div className="section-body p-2 space-y-0.5" style={{ maxHeight: '500px' }}>
            <div className="pt-1">
              <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-app-border text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
                <Plus className="w-3.5 h-3.5" />
                New Collection
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Library (file tree) */}
        <div className={\`section-collapsible \${!libraryOpen ? 'collapsed' : ''}\`}>
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
              <div onClick={handleSelectFolder} className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
                <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
                <span className="text-txt-primary truncate" title={selectedFolder || "Select Folder..."}>{selectedFolder ? selectedFolder.split('/').pop() : "Select Folder..."}</span>
                <Plus className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
              </div>
            </div>

            {/* Browsable file tree */}
            <div className="p-2 space-y-0.5">
              {tree ? (
                Object.values(tree.children).sort((a,b) => {
                  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                  return a.name.localeCompare(b.name);
                }).map((child, idx) => (
                  <TreeView key={idx} node={child} depth={0} />
                ))
              ) : (
                <div className="text-xs text-txt-tertiary text-center py-4">No folder selected</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Sidebar rebuilt successfully.');
