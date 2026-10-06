import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { normalizePath } from '../utils/image';

export type AlbumItem = Album | AlbumGroup;

export interface Album {
  type: 'album';
  id: string;
  name: string;
  icon?: string;
  libraryRoot?: string;
  images: string[];
}

export interface AlbumGroup {
  type: 'group';
  id: string;
  name: string;
  icon?: string;
  libraryRoot?: string;
  children: AlbumItem[];
}

export type ExportResizeMode =
  | { mode: 'original' }
  | { mode: 'longEdge'; value: number }
  | { mode: 'custom'; value: { width: number; height: number } };

export interface CollectionExportOptions {
  albumId: string;
  destinationDir: string;
  filenamePrefix: string;
  digits: number;
  preserveOriginalName: boolean;
  resizeMode: ExportResizeMode;
  jpegQuality: number;
  synthesizeExifDates: boolean;
  isSequential: boolean;
}

export interface ExportProgress {
  current: number;
  total: number;
  filename: string;
}

interface CollectionsStore {
  collectionsTree: AlbumItem[];
  activeCollectionId: string | null;
  activeCollectionName: string | null;
  expandedGroups: Set<string>;
  isLoading: boolean;

  // Active in-memory drag state for 100% reliable DnD across components
  draggedPhotoPaths: string[] | null;
  setDraggedPhotoPaths: (paths: string[] | null) => void;

  // Export Modal state
  isExportModalOpen: boolean;
  exportTarget: Album | null;

  // Actions
  loadCollections: () => Promise<void>;
  selectCollection: (id: string | null, name?: string | null) => void;
  toggleGroup: (id: string) => void;
  createCollection: (name: string, parentId?: string | null, isGroup?: boolean, icon?: string, libraryRoot?: string | null) => Promise<AlbumItem | null>;
  renameCollection: (id: string, newName: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addToCollection: (albumId: string, paths: string[]) => Promise<void>;
  removeFromCollection: (albumId: string, paths: string[]) => Promise<void>;
  pruneDeletedPaths: (deletedPaths: string[]) => void;
  pruneCollectionsByLibrary: (libraryRoot: string) => Promise<void>;
  reorderImages: (albumId: string, newOrder: string[]) => Promise<void>;
  sortCollectionByExif: (albumId: string) => Promise<void>;

  openExportModal: (collection: Album) => void;
  closeExportModal: () => void;
  exportCollection: (options: CollectionExportOptions) => Promise<number>;
  cancelExport: () => Promise<void>;
}

export const useCollectionsStore = create<CollectionsStore>((set, get) => ({
  collectionsTree: [],
  activeCollectionId: null,
  activeCollectionName: null,
  expandedGroups: new Set<string>(),
  isLoading: false,

  draggedPhotoPaths: null,
  setDraggedPhotoPaths: (paths) => set({ draggedPhotoPaths: paths }),

  isExportModalOpen: false,
  exportTarget: null,

  loadCollections: async () => {
    try {
      set({ isLoading: true });
      const tree = await invoke<AlbumItem[]>('get_collections');
      set({ collectionsTree: tree, isLoading: false });
    } catch (err) {
      console.error('Failed to load collections:', err);
      set({ isLoading: false });
    }
  },

  selectCollection: (id: string | null, name?: string | null) => {
    set({
      activeCollectionId: id,
      activeCollectionName: name || null,
    });
  },

  toggleGroup: (id: string) => {
    set((state) => {
      const next = new Set(state.expandedGroups);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedGroups: next };
    });
  },

  createCollection: async (name: string, parentId: string | null = null, isGroup = false, icon?: string, libraryRoot?: string | null) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('create_collection_item', {
        parentId,
        name,
        isGroup,
        icon: icon || null,
        libraryRoot: libraryRoot || null,
      });
      set({ collectionsTree: updatedTree });
      const findByName = (items: AlbumItem[]): AlbumItem | null => {
        for (const item of items) {
          if (item.name === name) return item;
          if (item.type === 'group' && item.children) {
            const found = findByName(item.children);
            if (found) return found;
          }
        }
        return null;
      };
      return findByName(updatedTree);
    } catch (err) {
      console.error('Failed to create collection item:', err);
      throw err;
    }
  },

  renameCollection: async (id: string, newName: string) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('rename_collection_item', {
        targetId: id,
        newName,
      });
      set((state) => ({
        collectionsTree: updatedTree,
        activeCollectionName: state.activeCollectionId === id ? newName : state.activeCollectionName,
      }));
    } catch (err) {
      console.error('Failed to rename collection:', err);
      throw err;
    }
  },

  deleteCollection: async (id: string) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('delete_collection_item', {
        targetId: id,
      });
      set((state) => ({
        collectionsTree: updatedTree,
        activeCollectionId: state.activeCollectionId === id ? null : state.activeCollectionId,
        activeCollectionName: state.activeCollectionId === id ? null : state.activeCollectionName,
      }));
    } catch (err) {
      console.error('Failed to delete collection:', err);
      throw err;
    }
  },

  addToCollection: async (albumId: string, paths: string[]) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('add_to_collection', {
        albumId,
        paths,
      });
      set({ collectionsTree: updatedTree });
    } catch (err) {
      console.error('Failed to add to collection:', err);
      throw err;
    }
  },

  removeFromCollection: async (albumId: string, paths: string[]) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('remove_from_collection', {
        albumId,
        paths,
      });
      set({ collectionsTree: updatedTree });
    } catch (err) {
      console.error('Failed to remove from collection:', err);
      throw err;
    }
  },

  pruneDeletedPaths: (deletedPaths: string[]) => {
    if (!deletedPaths || deletedPaths.length === 0) return;
    const normDeleted = new Set(deletedPaths.map(p => normalizePath(p)));
    const pruneNode = (items: AlbumItem[]): AlbumItem[] => {
      return items.map((item) => {
        if (item.type === 'album') {
          return {
            ...item,
            images: item.images.filter(img => !normDeleted.has(normalizePath(img))),
          };
        }
        return {
          ...item,
          children: pruneNode(item.children),
        };
      });
    };
    set((state) => ({ collectionsTree: pruneNode(state.collectionsTree) }));
  },

  pruneCollectionsByLibrary: async (libraryRoot: string) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('prune_collections_by_library', {
        libraryRoot,
      });
      set({ collectionsTree: updatedTree });
    } catch (err) {
      console.error('Failed to prune collections by library:', err);
      throw err;
    }
  },

  reorderImages: async (albumId: string, newOrder: string[]) => {
    // Optimistic UI update
    set((state) => {
      const updateImages = (nodes: AlbumItem[]): AlbumItem[] => {
        return nodes.map((node) => {
          if (node.type === 'album') {
            if (node.id === albumId) {
              return { ...node, images: newOrder };
            }
            return node;
          }
          return { ...node, children: updateImages(node.children) };
        });
      };
      return { collectionsTree: updateImages(state.collectionsTree) };
    });

    try {
      const updatedTree = await invoke<AlbumItem[]>('reorder_collection_images', {
        albumId,
        newOrder,
      });
      set({ collectionsTree: updatedTree });
    } catch (err) {
      console.error('Failed to persist image reordering:', err);
      // Revert from backend if failed
      get().loadCollections();
    }
  },

  sortCollectionByExif: async (albumId: string) => {
    try {
      const updatedTree = await invoke<AlbumItem[]>('sort_collection_by_exif', {
        targetId: albumId,
      });
      set({ collectionsTree: updatedTree });
    } catch (err) {
      console.error('Failed to sort collection by EXIF:', err);
      throw err;
    }
  },

  openExportModal: (collection: Album) => {
    set({ isExportModalOpen: true, exportTarget: collection });
  },

  closeExportModal: () => {
    set({ isExportModalOpen: false, exportTarget: null });
  },

  exportCollection: async (options: CollectionExportOptions) => {
    return await invoke<number>('export_collection', { options });
  },

  cancelExport: async () => {
    await invoke('cancel_collection_export');
  },
}));

// Helper to count images in an AlbumItem
export function getAlbumImageCount(item: AlbumItem): number {
  if (item.type === 'album') {
    return item.images ? item.images.length : 0;
  }
  if (item.type === 'group' && item.children) {
    return item.children.reduce((acc, child) => acc + getAlbumImageCount(child), 0);
  }
  return 0;
}

// Helper to find an album by id in the tree
export function findAlbumById(tree: AlbumItem[], id: string): Album | null {
  for (const item of tree) {
    if (item.type === 'album' && item.id === id) {
      return item;
    }
    if (item.type === 'group') {
      const found = findAlbumById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Helper to find all albums in the tree that contain any of the given image paths
export function findAlbumsContainingPaths(
  tree: AlbumItem[],
  paths: string[]
): Array<{ id: string; name: string; count: number; matchCount: number }> {
  if (!paths || paths.length === 0) return [];
  const normTargets = new Set(paths.map(p => normalizePath(p)));
  const result: Array<{ id: string; name: string; count: number; matchCount: number }> = [];

  function search(items: AlbumItem[], prefix = '') {
    for (const item of items) {
      if (item.type === 'album') {
        let matchCount = 0;
        for (const imgPath of item.images) {
          if (normTargets.has(normalizePath(imgPath))) {
            matchCount++;
          }
        }
        if (matchCount > 0) {
          result.push({
            id: item.id,
            name: prefix ? `${prefix} / ${item.name}` : item.name,
            count: item.images.length,
            matchCount,
          });
        }
      } else if (item.type === 'group' && item.children) {
        search(item.children, prefix ? `${prefix} / ${item.name}` : item.name);
      }
    }
  }

  search(tree);
  return result;
}

// Determines if an album or group belongs to the specified library root
export function isAlbumInLibrary(item: AlbumItem, rootPath: string | null): boolean {
  if (!rootPath) return true;
  const normRoot = normalizePath(rootPath);
  const prefix = normRoot.endsWith('/') ? normRoot : normRoot + '/';

  if (item.type === 'album') {
    // 1. Explicit libraryRoot assignment
    if (item.libraryRoot) {
      return normalizePath(item.libraryRoot) === normRoot;
    }
    // 2. Dynamic check from image paths
    if (item.images && item.images.length > 0) {
      return item.images.some((img) => {
        const norm = normalizePath(img);
        return norm.startsWith(prefix) || norm === normRoot;
      });
    }
    // 3. Empty album without libraryRoot (unassigned from RapidRAW): show so user can populate
    return true;
  }

  if (item.type === 'group') {
    if (item.libraryRoot && normalizePath(item.libraryRoot) === normRoot) {
      return true;
    }
    if (item.children && item.children.length > 0) {
      return item.children.some((child) => isAlbumInLibrary(child, rootPath));
    }
    // Empty group without libraryRoot
    return !item.libraryRoot;
  }

  return true;
}

// Filters the collections tree to only items belonging to the current library
export function filterCollectionsForLibrary(items: AlbumItem[], rootPath: string | null): AlbumItem[] {
  if (!rootPath) return items;
  const normRoot = normalizePath(rootPath);

  const result: AlbumItem[] = [];

  for (const item of items) {
    if (item.type === 'album') {
      if (isAlbumInLibrary(item, rootPath)) {
        result.push(item);
      }
    } else if (item.type === 'group') {
      const filteredChildren = filterCollectionsForLibrary(item.children || [], rootPath);
      const isGroupRootMatch = item.libraryRoot && normalizePath(item.libraryRoot) === normRoot;
      const isUnassignedEmpty = !item.libraryRoot && (!item.children || item.children.length === 0);

      if (filteredChildren.length > 0 || isGroupRootMatch || isUnassignedEmpty) {
        result.push({
          ...item,
          children: filteredChildren,
        });
      }
    }
  }

  return result;
}

// Counts images in an AlbumItem that belong to the specified library
export function getAlbumImageCountForLibrary(item: AlbumItem, rootPath: string | null): number {
  if (!rootPath) return getAlbumImageCount(item);
  const normRoot = normalizePath(rootPath);
  const prefix = normRoot.endsWith('/') ? normRoot : normRoot + '/';

  if (item.type === 'album') {
    if (!item.images || item.images.length === 0) return 0;
    let count = 0;
    for (const img of item.images) {
      const norm = normalizePath(img);
      if (norm.startsWith(prefix) || norm === normRoot) {
        count++;
      }
    }
    return count;
  }

  if (item.type === 'group' && item.children) {
    return item.children.reduce((acc, child) => acc + getAlbumImageCountForLibrary(child, rootPath), 0);
  }

  return 0;
}

// Counts collections (albums and groups) in the tree belonging to the specified library path
export function countCollectionsInLibrary(items: AlbumItem[], libraryPath: string): number {
  const normLib = normalizePath(libraryPath);
  const prefix = normLib.endsWith('/') ? normLib : normLib + '/';
  let count = 0;

  function walk(nodes: AlbumItem[]) {
    for (const node of nodes) {
      if (node.type === 'album') {
        const matchesRoot = node.libraryRoot && normalizePath(node.libraryRoot) === normLib;
        const matchesImages = node.images && node.images.length > 0 && node.images.some((img) => {
          const norm = normalizePath(img);
          return norm.startsWith(prefix) || norm === normLib;
        });
        if (matchesRoot || matchesImages) {
          count++;
        }
      } else if (node.type === 'group') {
        const matchesRoot = node.libraryRoot && normalizePath(node.libraryRoot) === normLib;
        if (matchesRoot) {
          count++;
        }
        if (node.children) {
          walk(node.children);
        }
      }
    }
  }

  walk(items);
  return count;
}

