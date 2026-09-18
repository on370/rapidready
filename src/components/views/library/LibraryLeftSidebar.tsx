import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../../stores/settingsStore";
import { Bookmark, ChevronDown, Plus, HardDrive, Folder, ChevronRight, FolderOpen, Sparkles, Loader2, Camera } from "lucide-react";
import { open, ask } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";
import { useDialogStore } from "../../../stores/dialogStore";
import { useToastStore } from "../../../stores/toastStore";
import { normalizePath, normalizeSlash } from "../../../utils/image";
import { FolderContextMenu } from "./components/FolderContextMenu";
import { NewFolderModal } from "./components/NewFolderModal";
import { RenameFolderModal } from "./components/RenameFolderModal";

// Folder Tree node definition (folders only, no leaf file clutter)
export type TreeNode = {
  name: string;
  path: string;
  fileCount: number;
  children: { [key: string]: TreeNode };
};

// Helper to build a clean folder tree from flat image paths and extra empty folders
function buildTree(images: LibraryImage[], rootPath: string, allFolders: Set<string> = new Set()): TreeNode {
  const normRoot = normalizeSlash(rootPath);
  const normRootLower = normRoot.toLowerCase();
  const root: TreeNode = { name: "Root", path: normRoot, fileCount: 0, children: {} };
  const rootLen = normRoot.length;
  
  // 1. Insert all known directories (discovered from disk or created dynamically)
  for (const folder of allFolders) {
    const normF = normalizeSlash(folder);
    if (!normF.toLowerCase().startsWith(normRootLower)) continue;
    if (normF.length === rootLen) continue; // Skip root itself
    let relPath = normF.substring(rootLen);
    if (relPath.charCodeAt(0) === 47 /* '/' */) relPath = relPath.substring(1);
    const parts = relPath.split('/').filter(Boolean);
    let current = root;
    let currentPath = normRoot;
    for (let i = 0; i < parts.length; i++) {
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
    }
  }

  // 2. Insert images and calculate counts for all ancestor folders
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

// Helper to recursively collect a node's path and all of its descendants
export function collectAllFolderPaths(node: TreeNode): string[] {
  const result: string[] = [normalizePath(node.path)];
  for (const child of Object.values(node.children)) {
    result.push(...collectAllFolderPaths(child));
  }
  return result;
}

// Helper to get all currently visible tree nodes in linear display order
export function getVisibleTreeNodes(
  root: TreeNode,
  expandedMap: Record<string, boolean>
): TreeNode[] {
  const visible: TreeNode[] = [];
  function traverse(node: TreeNode, depth: number) {
    visible.push(node);
    const isExplicitlySet = expandedMap[node.path] !== undefined;
    const isOpen = isExplicitlySet ? expandedMap[node.path] : depth < 3;
    if (isOpen) {
      const sortedChildren = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
      for (const child of sortedChildren) {
        traverse(child, depth + 1);
      }
    }
  }
  const topChildren = Object.values(root.children).sort((a, b) => a.name.localeCompare(b.name));
  for (const child of topChildren) {
    traverse(child, 0);
  }
  return visible;
}

export function getTopLevelSelectedPaths(paths: Set<string>): string[] {
  const result: string[] = [];
  for (const p of paths) {
    let hasAncestor = false;
    let cur = p;
    while (true) {
      const slash = cur.lastIndexOf('/');
      if (slash <= 0) break;
      cur = cur.substring(0, slash);
      if (paths.has(cur)) {
        hasAncestor = true;
        break;
      }
    }
    if (!hasAncestor) {
      result.push(p);
    }
  }
  return result;
}

export function findNodeInTree(root: TreeNode, targetNormPath: string): TreeNode | null {
  if (normalizePath(root.path) === targetNormPath) return root;
  for (const child of Object.values(root.children)) {
    const found = findNodeInTree(child, targetNormPath);
    if (found) return found;
  }
  return null;
}

interface TreeViewProps {
  node: TreeNode;
  depth?: number;
  rootFolder: string;
  expandedMap: Record<string, boolean>;
  selectedFolderPaths: Set<string>;
  ancestorFolderPaths: Set<string>;
  onToggleExpand: (path: string, nextState: boolean) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onFolderClick: (e: React.MouseEvent, node: TreeNode) => void;
}

function TreeView({ 
  node, 
  depth = 0, 
  rootFolder,
  expandedMap,
  selectedFolderPaths,
  ancestorFolderPaths,
  onToggleExpand,
  onContextMenu,
  onFolderClick
}: TreeViewProps) {
  const { t } = useTranslation('library');
  const { activeImageFolder } = useLibraryStore();
  const nodeRef = useRef<HTMLDivElement>(null);
  
  const isExplicitlySet = expandedMap[node.path] !== undefined;
  const isOpen = isExplicitlySet ? expandedMap[node.path] : depth < 3;

  const normNodePath = normalizePath(node.path);
  const normImageFolder = normalizePath(activeImageFolder);

  const isDirectlySelected = selectedFolderPaths.has(normNodePath);
  const isCollapsedAncestorOfSelected = !isOpen && ancestorFolderPaths.has(normNodePath);
  const hasSelectedHighlight = isDirectlySelected || isCollapsedAncestorOfSelected;

  const isExactImageLocation = !!normImageFolder && normImageFolder === normNodePath;
  const isAncestorOfImage = !!normImageFolder && !isExactImageLocation && normImageFolder.startsWith(normNodePath + '/');

  // The camera indicator and active photo highlighting are shown on:
  // 1. The exact folder containing the photo (if reached), OR
  // 2. An ancestor folder IF that ancestor is currently collapsed (!isOpen),
  //    meaning the photo's actual subfolder is hidden inside it and bubbles up here!
  const showsImageBadge = isExactImageLocation || (isAncestorOfImage && !isOpen);

  // Auto-expand tree branch leading to the active photo when navigating to a new photo / folder
  useEffect(() => {
    if (isAncestorOfImage && !isOpen) {
      onToggleExpand(node.path, true);
    }
  }, [normImageFolder]);

  // Auto-scroll the folder containing the active photo (or its visible collapsed ancestor) into view
  useEffect(() => {
    if (showsImageBadge && nodeRef.current) {
      const timer = setTimeout(() => {
        nodeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [showsImageBadge]);

  const childNodes = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));

  // Distinct visual styling for folder selection vs. photo location
  let containerStyle = "hover:bg-app-hover text-txt-secondary";
  if (hasSelectedHighlight && showsImageBadge) {
    containerStyle = "bg-accent/20 text-accent font-semibold";
  } else if (hasSelectedHighlight) {
    containerStyle = "bg-accent/15 text-accent font-semibold";
  } else if (showsImageBadge) {
    containerStyle = "bg-amber-400/10 text-txt-primary font-medium";
  }

  return (
    <div className="space-y-0.5">
      <div 
        ref={nodeRef}
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left ${containerStyle}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={(e) => {
          onFolderClick(e, node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, node);
        }}
      >
        <div 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (childNodes.length > 0) onToggleExpand(node.path, !isOpen); 
          }} 
          className={`p-0.5 rounded cursor-pointer ${childNodes.length > 0 ? 'hover:bg-white/10' : 'opacity-0 pointer-events-none'}`}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary" />}
        </div>
        
        {isOpen ? (
          <FolderOpen className={`w-3.5 h-3.5 ${hasSelectedHighlight ? 'text-accent' : showsImageBadge ? 'text-amber-400' : 'text-warning/70'}`} />
        ) : (
          <Folder className={`w-3.5 h-3.5 ${hasSelectedHighlight ? 'text-accent' : showsImageBadge ? 'text-amber-400' : 'text-warning/70'}`} />
        )}
        
        <span 
          className={`text-xs truncate flex-1 ${
            hasSelectedHighlight ? 'text-accent font-semibold' : showsImageBadge ? 'text-txt-primary font-medium' : 'text-txt-secondary'
          }`} 
          title={node.name}
        >
          {node.name}
        </span>

        {showsImageBadge && (
          <span 
            title={isExactImageLocation 
              ? t('sidebar.exactLocationTooltip', { defaultValue: 'Enthält das aktuell ausgewählte Foto' }) 
              : t('sidebar.ancestorLocationTooltip', { defaultValue: 'Enthält Unterordner mit dem aktuell ausgewählten Foto' })
            } 
            className="flex items-center flex-shrink-0"
          >
            <Camera 
              className={`w-3 h-3 animate-pulse ${hasSelectedHighlight ? 'text-accent' : 'text-amber-400'}`} 
            />
          </span>
        )}

        <span className="text-[10px] text-txt-tertiary ml-auto font-mono flex-shrink-0">
          ({node.fileCount})
        </span>
      </div>
      
      {isOpen && childNodes.length > 0 && (
        <div className="space-y-0.5">
          {childNodes.map((child) => (
            <TreeView 
              key={child.path} 
              node={child} 
              depth={depth + 1} 
              rootFolder={rootFolder} 
              expandedMap={expandedMap}
              selectedFolderPaths={selectedFolderPaths}
              ancestorFolderPaths={ancestorFolderPaths}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onFolderClick={onFolderClick}
            />
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
  const selectedFolderPaths = useLibraryStore((s) => s.selectedFolderPaths);
  const discoveredFolders = useLibraryStore((s) => s.discoveredFolders);
  const scanState = useLibraryStore((s) => s.scanState);
  const lastImportPaths = useLibraryStore((s) => s.lastImportPaths);
  const isViewingLastImport = useLibraryStore((s) => s.isViewingLastImport);
  const setIsViewingLastImport = useLibraryStore((s) => s.setIsViewingLastImport);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const loadArchive = useLibraryStore((s) => s.loadArchive);

  const ancestorFolderPaths = useMemo<Set<string>>(() => {
    const ancestors = new Set<string>();
    if (!selectedFolderPaths || selectedFolderPaths.size === 0) return ancestors;
    for (const folder of selectedFolderPaths) {
      let cur = folder;
      while (true) {
        const slash = cur.lastIndexOf('/');
        if (slash <= 0) break;
        cur = cur.substring(0, slash);
        if (ancestors.has(cur)) break;
        ancestors.add(cur);
      }
    }
    return ancestors;
  }, [selectedFolderPaths]);

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

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [extraFolders, setExtraFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode;
    isMultiSelect: boolean;
    folderCount: number;
    topSelectedPaths: string[];
    allSelectedFolderPaths: string[];
    totalPhotoCount: number;
    rejectedPhotoCount: number;
    hasChildren: boolean;
  } | null>(null);
  const [newFolderModal, setNewFolderModal] = useState<{
    parentPath: string;
    parentName: string;
  } | null>(null);
  const [renameFolderModal, setRenameFolderModal] = useState<{
    path: string;
    name: string;
  } | null>(null);

  const handleToggleExpand = (path: string, nextState: boolean) => {
    setExpandedMap(prev => ({ ...prev, [path]: nextState }));
  };

  const [tree, setTree] = useState<TreeNode | null>(() => {
    const store = useLibraryStore.getState();
    if (!store.rootPath) return null;
    const allKnown = new Set<string>([...store.discoveredFolders, ...extraFolders]);
    return (store.images.length > 0 || allKnown.size > 0) ? buildTree(store.images, store.rootPath, allKnown) : null;
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

  const updateTreeNow = () => {
    const store = useLibraryStore.getState();
    if (rootPath) {
      const allKnown = new Set<string>([...store.discoveredFolders, ...extraFolders]);
      setTree(buildTree(store.images, rootPath, allKnown));
    }
    lastTreeUpdateRef.current = Date.now();
  };

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    const normNode = normalizePath(node.path);
    const store = useLibraryStore.getState();
    const currentSelected = store.selectedFolderPaths;
    const allImages = store.images;

    let effectiveSelected: Set<string>;

    if (!currentSelected || !currentSelected.has(normNode)) {
      // Right-clicked outside current selection -> select ONLY this folder and subtree
      const subtree = collectAllFolderPaths(node);
      effectiveSelected = new Set(subtree);
      store.setSelectedFolderPaths(effectiveSelected);
      lastClickedFolderRef.current = normNode;
    } else {
      // Right-clicked inside existing selection -> preserve active selection
      effectiveSelected = currentSelected;
    }

    const topPaths = getTopLevelSelectedPaths(effectiveSelected);
    const isMultiSelect = topPaths.length > 1;

    // Count photos and rejected photos belonging to any folder in effectiveSelected
    let totalPhotoCount = 0;
    let rejectedPhotoCount = 0;
    for (const img of allImages) {
      const p = normalizePath(img.path);
      const lastSlash = p.lastIndexOf('/');
      const dir = lastSlash > 0 ? p.substring(0, lastSlash) : p;
      if (effectiveSelected.has(dir)) {
        totalPhotoCount++;
        if (img.culling.flag === -1) {
          rejectedPhotoCount++;
        }
      }
    }

    // Check if any selected folder has children
    let anyHasChildren = false;
    if (tree) {
      if (isMultiSelect) {
        anyHasChildren = topPaths.some(p => {
          const n = findNodeInTree(tree, p);
          return n ? Object.keys(n.children).length > 0 : false;
        });
      } else {
        const n = findNodeInTree(tree, topPaths[0] || normNode);
        anyHasChildren = n ? Object.keys(n.children).length > 0 : Object.keys(node.children).length > 0;
      }
    } else {
      anyHasChildren = Object.keys(node.children).length > 0;
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      isMultiSelect,
      folderCount: topPaths.length,
      topSelectedPaths: topPaths,
      allSelectedFolderPaths: Array.from(effectiveSelected),
      totalPhotoCount: isMultiSelect ? totalPhotoCount : node.fileCount,
      rejectedPhotoCount,
      hasChildren: anyHasChildren,
    });
  };

  useEffect(() => {
    if (!rootPath) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      setTree(null);
      return;
    }

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
  }, [rootPath, imageCount, scanState, extraFolders, discoveredFolders]);

  const handleShowInFinder = async (paths: string[]) => {
    try {
      if (paths.length <= 1) {
        await invoke('show_in_finder', { path: paths[0] });
      } else {
        await invoke('show_in_finder_batch', { paths });
      }
    } catch (err) {
      console.error('Failed to reveal in Finder/Explorer:', err);
      useToastStore.getState().showError(t('folderMenu.showInFinder', 'Im Finder anzeigen') + ': ' + err);
    }
  };

  const lastClickedFolderRef = useRef<string | null>(null);

  const handleFolderClick = (e: React.MouseEvent, node: TreeNode) => {
    const normNode = normalizePath(node.path);
    const subtreePaths = collectAllFolderPaths(node);

    // 1. Shift-Click: Range Selection in visible tree
    if (e.shiftKey && tree) {
      const visibleNodes = getVisibleTreeNodes(tree, expandedMap);
      const anchor = lastClickedFolderRef.current;
      const startIdx = anchor ? visibleNodes.findIndex(n => normalizePath(n.path) === anchor) : -1;
      const endIdx = visibleNodes.findIndex(n => normalizePath(n.path) === normNode);

      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const nextSelected = new Set(selectedFolderPaths);
        for (let i = min; i <= max; i++) {
          const paths = collectAllFolderPaths(visibleNodes[i]);
          for (const p of paths) nextSelected.add(p);
        }
        useLibraryStore.getState().setSelectedFolderPaths(nextSelected);
        lastClickedFolderRef.current = normNode;
        return;
      }
    }

    // 2. Cmd-Click / Ctrl-Click: Toggle Selection (Top-level or Subfolder)
    if (e.metaKey || e.ctrlKey) {
      const isCurrentlySelected = selectedFolderPaths.has(normNode);
      const nextSelected = new Set(selectedFolderPaths);

      if (isCurrentlySelected) {
        // Deselect this folder and any of its children
        for (const p of subtreePaths) {
          nextSelected.delete(p);
        }
      } else {
        // Select this folder and its children
        for (const p of subtreePaths) {
          nextSelected.add(p);
        }
      }

      useLibraryStore.getState().setSelectedFolderPaths(nextSelected);
      lastClickedFolderRef.current = normNode;
      return;
    }

    // 3. Normal Click (no modifier key):
    // If this node (and its descendants) is ALREADY the only selection, toggle back to root/all
    const isOnlySelection = subtreePaths.length === selectedFolderPaths.size &&
      subtreePaths.every(p => selectedFolderPaths.has(p));

    if (isOnlySelection) {
      useLibraryStore.getState().setActiveFolderPath(rootPath || null);
      lastClickedFolderRef.current = null;
    } else {
      useLibraryStore.getState().setSelectedFolderPaths(new Set(subtreePaths));
      lastClickedFolderRef.current = normNode;
    }
  };

  const handleSelectAllInFolder = (node: TreeNode) => {
    const subtreePaths = collectAllFolderPaths(node);
    useLibraryStore.getState().selectAllInFolder(node.path, subtreePaths);
  };

  const handleSelectAllInMultiFolders = (topPaths: string[], allFolderPaths: string[]) => {
    useLibraryStore.getState().selectAllInFolders(topPaths, allFolderPaths);
  };

  const handleExpandAll = (targetNode: TreeNode) => {
    const updates: Record<string, boolean> = {};
    const traverse = (n: TreeNode) => {
      updates[n.path] = true;
      Object.values(n.children).forEach(traverse);
    };
    traverse(targetNode);
    setExpandedMap(prev => ({ ...prev, ...updates }));
  };

  const handleCollapseAll = (targetNode: TreeNode) => {
    const updates: Record<string, boolean> = {};
    const traverse = (n: TreeNode) => {
      updates[n.path] = false;
      Object.values(n.children).forEach(traverse);
    };
    traverse(targetNode);
    setExpandedMap(prev => ({ ...prev, ...updates }));
  };

  const handleExpandAllPaths = (paths: string[]) => {
    if (!tree) return;
    const pathSet = new Set(paths.map(p => normalizePath(p)));
    const updates: Record<string, boolean> = {};
    const traverse = (n: TreeNode, shouldExpandDescendants: boolean) => {
      const norm = normalizePath(n.path);
      const isTarget = pathSet.has(norm);
      const expandThis = isTarget || shouldExpandDescendants;
      if (expandThis) {
        updates[n.path] = true;
      }
      for (const child of Object.values(n.children)) {
        traverse(child, expandThis);
      }
    };
    traverse(tree, false);
    setExpandedMap(prev => ({ ...prev, ...updates }));
  };

  const handleCollapseAllPaths = (paths: string[]) => {
    const updates: Record<string, boolean> = {};
    for (const p of paths) {
      updates[p] = false;
    }
    setExpandedMap(prev => ({ ...prev, ...updates }));
  };

  const handleCreateSubfolder = async (parentPath: string, name: string) => {
    try {
      const createdPath = await invoke<string>('create_folder', { parentPath, name });
      useLibraryStore.getState().addDiscoveredFolders([createdPath]);
      setExtraFolders(prev => new Set([...prev, createdPath]));
      setExpandedMap(prev => ({ ...prev, [parentPath]: true }));
      useToastStore.getState().showSuccess(
        t('folderMenu.createFolderSuccess', { name, defaultValue: `Ordner „${name}“ wurde erstellt.` })
      );
      updateTreeNow();
    } catch (err: any) {
      console.error('Failed to create folder:', err);
      throw err;
    }
  };

  const handleRenameFolder = async (oldPath: string, newName: string) => {
    try {
      const newPath = await invoke<string>('rename_folder', { oldPath, newName });
      useLibraryStore.getState().renameFolderPath(oldPath, newPath);
      setExtraFolders(prev => {
        const next = new Set<string>();
        const normOld = normalizePath(oldPath);
        for (const p of prev) {
          if (normalizePath(p) === normOld) {
            next.add(newPath);
          } else {
            next.add(p);
          }
        }
        return next;
      });
      useToastStore.getState().showSuccess(
        t('folderMenu.renameFolderSuccess', { name: newName, defaultValue: `Ordner in „${newName}“ umbenannt.` })
      );
      updateTreeNow();
    } catch (err: any) {
      console.error('Failed to rename folder:', err);
      throw err;
    }
  };

  const handleDeleteRejectedInFolders = async (folderPaths: string[], isMulti: boolean) => {
    const allImages = useLibraryStore.getState().images;
    const folderSet = new Set(folderPaths.map(p => normalizeSlash(p)));

    const rejectedInFolders = allImages.filter(img => {
      const p = normalizeSlash(img.path);
      const lastSlash = p.lastIndexOf('/');
      const dir = lastSlash > 0 ? p.substring(0, lastSlash) : p;
      return folderSet.has(dir) && img.culling.flag === -1;
    });

    if (rejectedInFolders.length === 0) {
      useToastStore.getState().showInfo(t('folderMenu.noRejectedInFolder', 'Keine verworfenen Bilder in diesem Ordner vorhanden.'));
      return;
    }

    const count = rejectedInFolders.length;
    const checkPaths = [rootPath, ...folderPaths].filter(Boolean) as string[];
    const isNetwork = await invoke<boolean>('are_any_network_paths', { paths: checkPaths }).catch((err) => {
      console.error('Failed to check network path in purge rejected:', err);
      return false;
    });

    const confirmed = await useDialogStore.getState().confirmDestructive({
      title: isNetwork
        ? (isMulti
            ? t('folderDelete.multiNasTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
            : t('delete.nasConfirmTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' }))
        : t('delete.confirmTitle', { defaultValue: 'In den Papierkorb verschieben' }),
      message: isNetwork
        ? (isMulti
            ? t('folderDelete.multiNasMessage', {
                count,
                photoCount: count,
                defaultValue: `Die ${count} verworfenen Bilder in den ausgewählten Ordnern liegen auf einer Netzwerkfreigabe (NAS).\n\nDateien auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nSie werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du diese ${count} Bilder jetzt wirklich unwiderruflich löschen?`
              })
            : t('delete.nasConfirmMessage', {
                count,
                defaultValue: `Die ${count} verworfenen Bilder liegen auf einer Netzwerkfreigabe (NAS).\n\nDateien auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nSie werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du diese ${count} Bilder jetzt wirklich unwiderruflich löschen?`
              }))
        : t('delete.confirmMessage', {
            count,
            defaultValue: `Möchtest du ${count} verworfene(s) Bild(er) in den Papierkorb verschieben?`
          }),
      confirmLabel: isNetwork
        ? t('delete.nasOkLabel', { defaultValue: 'Unwiderruflich löschen' })
        : t('delete.okLabel', { defaultValue: 'In den Papierkorb' }),
      cancelLabel: t('delete.cancelLabel', { defaultValue: 'Abbrechen' })
    });

    if (confirmed) {
      try {
        const result = await invoke<{ deleted: string[]; failed: [string, string][] }>('delete_files', {
          paths: rejectedInFolders.map(i => i.path),
          toTrash: !isNetwork,
          archiveRoot: rootPath || null,
        });

        if (result.deleted.length > 0) {
          const delSet = new Set(result.deleted);
          const remaining = allImages.filter(i => !delSet.has(i.path));
          useLibraryStore.getState().setImages(remaining);
        }

        if (result.failed.length > 0) {
          const firstErr = result.failed[0][1];
          useToastStore.getState().showWarning(
            t('delete.partialFailed', {
              failed: result.failed.length,
              total: count,
              defaultValue: `${result.failed.length} von ${count} Datei(en) konnten nicht gelöscht werden: ${firstErr}`
            })
          );
        } else {
          useToastStore.getState().showSuccess(
            isNetwork
              ? t('delete.nasSuccessToast', { count: result.deleted.length, defaultValue: `${result.deleted.length} Bild(er) dauerhaft vom Netzwerklaufwerk gelöscht.` })
              : t('delete.localSuccessToast', { count: result.deleted.length, defaultValue: `${result.deleted.length} Bild(er) in den Papierkorb verschoben.` })
          );
        }
      } catch (err: any) {
        useToastStore.getState().showError(t('delete.failedError', 'Löschen fehlgeschlagen: ') + (err?.message || err));
      }
    }
  };

  const handleDeleteFolders = async (paths: string[]) => {
    const curScanState = useLibraryStore.getState().scanState;
    if (curScanState === 'scanning' || curScanState === 'connecting' || curScanState === 'paused') {
      useToastStore.getState().showWarning(
        t('folderDelete.scanActiveWarning', { defaultValue: 'Während eines laufenden Archiv-Scans können keine Ordner gelöscht werden.' })
      );
      return;
    }

    if (!rootPath) {
      useToastStore.getState().showWarning(
        t('folderMenu.noRootPath', { defaultValue: 'Kein aktives Archiv ausgewählt.' })
      );
      return;
    }

    const validPaths = paths.filter(p => normalizePath(p) !== normalizePath(rootPath));
    if (validPaths.length === 0) {
      useToastStore.getState().showWarning(
        t('folderMenu.deleteRootProtected', 'Der Hauptordner kann nicht gelöscht werden')
      );
      return;
    }

    const checkPaths = [rootPath, ...validPaths].filter(Boolean) as string[];
    const isNas = await invoke<boolean>('are_any_network_paths', { paths: checkPaths }).catch((err) => {
      console.error('Failed to check network path in delete folders:', err);
      return false;
    });
    const allImages = useLibraryStore.getState().images;
    const normTargets = validPaths.map(p => normalizeSlash(p).toLowerCase());
    const affectedImages = allImages.filter(img => {
      const normImg = normalizeSlash(img.path).toLowerCase();
      return normTargets.some(t => normImg.startsWith(t + '/') || normImg === t);
    });
    const photoCount = affectedImages.length;

    if (validPaths.length === 1) {
      const folderPath = validPaths[0];
      const folderName = normalizeSlash(folderPath).split('/').pop() || folderPath;

      const confirmed = await useDialogStore.getState().confirmDestructive({
        title: isNas
          ? t('folderDelete.nasTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
          : t('folderDelete.localTitle', { defaultValue: 'Ordner in den Papierkorb verschieben?' }),
        message: isNas
          ? t('folderDelete.nasMessage', {
              name: folderName,
              count: photoCount,
              defaultValue: `Der Ordner „${folderName}“ (${photoCount} Fotos) liegt auf einer Netzwerkfreigabe (NAS).\n\nDateien und Ordner auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nDer gesamte Ordner und alle darin enthaltenen Dateien und Unterordner werden DAUERHAFT und UNWIDERRUFLICH gelöscht.\n\nMöchtest du „${folderName}“ jetzt wirklich unwiderruflich löschen?`
            })
          : t('folderDelete.localMessage', {
              name: folderName,
              count: photoCount,
              defaultValue: `Möchtest du den Ordner „${folderName}“ (${photoCount} Fotos) und alle darin enthaltenen Dateien und Unterordner wirklich in den Papierkorb verschieben?`
            }),
        confirmLabel: isNas
          ? t('folderDelete.nasOk', { defaultValue: 'Unwiderruflich löschen' })
          : t('folderDelete.localOk', { defaultValue: 'In den Papierkorb' }),
        cancelLabel: t('folderDelete.cancel', { defaultValue: 'Abbrechen' })
      });

      if (confirmed) {
        try {
          await invoke('delete_folder', { path: folderPath, toTrash: !isNas, archiveRoot: rootPath });
          performPostFoldersDeleteCleanup([folderPath], isNas);
        } catch (err: any) {
          console.error('Failed to delete folder:', err);
          useToastStore.getState().showError(
            t('folderDelete.error', 'Löschen des Ordners fehlgeschlagen: ') + (err?.message || err)
          );
        }
      }
    } else {
      // Multi-Folder delete
      const count = validPaths.length;
      const confirmed = await useDialogStore.getState().confirmDestructive({
        title: isNas
          ? t('folderDelete.multiNasTitle', { defaultValue: '⚠️ ACHTUNG: Dauerhaftes Löschen auf NAS / Netzwerk' })
          : t('folderDelete.multiLocalTitle', { count, defaultValue: `${count} Ordner in den Papierkorb verschieben?` }),
        message: isNas
          ? t('folderDelete.multiNasMessage', {
              count,
              photoCount,
              defaultValue: `Die ${count} ausgewählten Ordner (mit insgesamt ${photoCount} Fotos) liegen ganz oder teilweise auf einer Netzwerkfreigabe (NAS).\n\nDateien und Ordner auf Netzwerklaufwerken können NICHT in den Papierkorb verschoben werden!\n\nAlle ausgewählten Ordner und alle darin enthaltenen Dateien und Unterordner werden DAUERHAFT und UNWIDERRUFLICH von der Festplatte gelöscht.\n\nMöchtest du diese ${count} Ordner jetzt wirklich unwiderruflich löschen?`
            })
          : t('folderDelete.multiLocalMessage', {
              count,
              photoCount,
              defaultValue: `Möchtest du die ${count} ausgewählten Ordner (mit insgesamt ${photoCount} Fotos) und alle darin enthaltenen Dateien und Unterordner wirklich in den Papierkorb verschieben?`
            }),
        confirmLabel: isNas
          ? t('folderDelete.nasOk', { defaultValue: 'Unwiderruflich löschen' })
          : t('folderDelete.localOk', { defaultValue: 'In den Papierkorb' }),
        cancelLabel: t('folderDelete.cancel', { defaultValue: 'Abbrechen' })
      });

      if (confirmed) {
        try {
          await invoke('delete_folders', { paths: validPaths, toTrash: !isNas, archiveRoot: rootPath });
          performPostFoldersDeleteCleanup(validPaths, isNas);
        } catch (err: any) {
          console.error('Failed to delete folders:', err);
          useToastStore.getState().showError(
            t('folderDelete.error', 'Löschen der Ordner fehlgeschlagen: ') + (err?.message || err)
          );
        }
      }
    }
  };

  const performPostFoldersDeleteCleanup = (folderPaths: string[], isNas: boolean) => {
    const normTargets = folderPaths.map(p => normalizeSlash(p).toLowerCase());
    const isUnderAny = (p: string) => {
      const norm = normalizeSlash(p).toLowerCase();
      return normTargets.some(t => norm.startsWith(t + '/') || norm === t);
    };

    const allImages = useLibraryStore.getState().images;
    const remaining = allImages.filter(img => !isUnderAny(img.path));
    useLibraryStore.getState().setImages(remaining);

    const curSelected = useLibraryStore.getState().selectedPaths;
    const nextSelected = new Set<string>();
    for (const p of curSelected) {
      if (!isUnderAny(p)) nextSelected.add(p);
    }
    useLibraryStore.getState().setSelectedPaths(nextSelected);

    setExtraFolders(prev => {
      const next = new Set<string>();
      for (const p of prev) {
        if (!isUnderAny(p)) next.add(p);
      }
      return next;
    });

    for (const fp of folderPaths) {
      useLibraryStore.getState().removeFolder(fp);
    }

    const curActive = normalizeSlash(useLibraryStore.getState().activeFolderPath || '').toLowerCase();
    if (isUnderAny(curActive)) {
      useLibraryStore.getState().setActiveFolderPath(rootPath || null);
    }

    if (folderPaths.length === 1) {
      const folderName = normalizeSlash(folderPaths[0]).split('/').pop() || folderPaths[0];
      if (isNas) {
        useToastStore.getState().showSuccess(
          t('folderDelete.nasSuccess', { name: folderName, defaultValue: `Ordner „${folderName}“ dauerhaft vom Netzwerklaufwerk gelöscht.` })
        );
      } else {
        useToastStore.getState().showSuccess(
          t('folderDelete.localSuccess', { name: folderName, defaultValue: `Ordner „${folderName}“ in den Papierkorb verschoben.` })
        );
      }
    } else {
      const count = folderPaths.length;
      if (isNas) {
        useToastStore.getState().showSuccess(
          t('folderDelete.multiNasSuccess', { count, defaultValue: `${count} Ordner dauerhaft vom Netzwerklaufwerk gelöscht.` })
        );
      } else {
        useToastStore.getState().showSuccess(
          t('folderDelete.multiLocalSuccess', { count, defaultValue: `${count} Ordner in den Papierkorb verschoben.` })
        );
      }
    }

    updateTreeNow();
  };

  const renderTree = () => {
    if (isLoading && imageCount === 0 && (!tree || Object.keys(tree.children).length === 0)) {
      return (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-txt-secondary">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-xs">{t("sidebar.scanning", "Scanning library...")}</span>
        </div>
      );
    }
    if (!tree || Object.keys(tree.children).length === 0) {
      return <div className="text-xs text-txt-tertiary text-center py-4">{t("sidebar.noFolder")}</div>;
    }
    return Object.values(tree.children).sort((a,b) => a.name.localeCompare(b.name)).map((child) => (
      <TreeView 
        key={child.path} 
        node={child} 
        depth={0} 
        rootFolder={rootPath || ''} 
        expandedMap={expandedMap}
        selectedFolderPaths={selectedFolderPaths}
        ancestorFolderPaths={ancestorFolderPaths}
        onToggleExpand={handleToggleExpand}
        onContextMenu={handleContextMenu}
        onFolderClick={handleFolderClick}
      />
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
              onContextMenu={(e) => {
                if (tree) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleContextMenu(e, tree);
                }
              }}
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

      {/* Folder Context Menu */}
      {contextMenu && (
        <FolderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isMultiSelect={contextMenu.isMultiSelect}
          folderCount={contextMenu.folderCount}
          nodePath={contextMenu.node.path}
          nodeName={contextMenu.node.name}
          isRoot={!rootPath || contextMenu.topSelectedPaths.some(p => normalizePath(p) === normalizePath(rootPath))}
          hasChildren={contextMenu.hasChildren}
          fileCount={contextMenu.totalPhotoCount}
          hasRejectedPhotos={contextMenu.rejectedPhotoCount > 0}
          rejectedCount={contextMenu.rejectedPhotoCount}
          onClose={() => setContextMenu(null)}
          onShowInFinder={() => handleShowInFinder([contextMenu.node.path])}
          onSelectAllInFolder={() => {
            if (contextMenu.isMultiSelect) {
              handleSelectAllInMultiFolders(contextMenu.topSelectedPaths, contextMenu.allSelectedFolderPaths);
            } else {
              handleSelectAllInFolder(contextMenu.node);
            }
          }}
          onExpandAll={() => {
            if (contextMenu.isMultiSelect) {
              handleExpandAllPaths(contextMenu.topSelectedPaths);
            } else {
              handleExpandAll(contextMenu.node);
            }
          }}
          onCollapseAll={() => {
            if (contextMenu.isMultiSelect) {
              handleCollapseAllPaths(contextMenu.topSelectedPaths);
            } else {
              handleCollapseAll(contextMenu.node);
            }
          }}
          onNewSubfolder={() => {
            const path = contextMenu.node.path;
            const name = contextMenu.node.name;
            setContextMenu(null);
            setNewFolderModal({ parentPath: path, parentName: name });
          }}
          onRenameFolder={() => {
            const path = contextMenu.node.path;
            const name = contextMenu.node.name;
            setContextMenu(null);
            setRenameFolderModal({ path, name });
          }}
          onDeleteRejectedInFolder={() => {
            const paths = contextMenu.allSelectedFolderPaths;
            const isMulti = contextMenu.isMultiSelect;
            setContextMenu(null);
            handleDeleteRejectedInFolders(paths, isMulti);
          }}
          onDeleteFolder={() => {
            const paths = contextMenu.topSelectedPaths;
            setContextMenu(null);
            handleDeleteFolders(paths);
          }}
        />
      )}

      {/* New Subfolder Modal */}
      {newFolderModal && (
        <NewFolderModal
          isOpen={true}
          parentPath={newFolderModal.parentPath}
          parentName={newFolderModal.parentName}
          onClose={() => setNewFolderModal(null)}
          onCreate={(name) => handleCreateSubfolder(newFolderModal.parentPath, name)}
        />
      )}

      {/* Rename Folder Modal */}
      {renameFolderModal && (
        <RenameFolderModal
          isOpen={true}
          folderPath={renameFolderModal.path}
          currentName={renameFolderModal.name}
          onClose={() => setRenameFolderModal(null)}
          onRename={(newName) => handleRenameFolder(renameFolderModal.path, newName)}
        />
      )}
    </div>
  );
}
