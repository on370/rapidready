const fs = require('fs');

let storePath = 'src/stores/libraryStore.ts';
let storeContent = fs.readFileSync(storePath, 'utf8');

if (!storeContent.includes('rootPath')) {
  storeContent = storeContent.replace(
    'images: LibraryImage[];',
    `images: LibraryImage[];
  rootPath: string | null;
  setRootPath: (path: string | null) => void;`
  );
  storeContent = storeContent.replace(
    'images: [],',
    `images: [],
  rootPath: null,
  setRootPath: (path) => set({ rootPath: path }),`
  );
  fs.writeFileSync(storePath, storeContent);
}

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

sidebarContent = sidebarContent.replace(
  'const { images, setImages, setActiveFolderPath, setViewMode } = useLibraryStore();\n  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);',
  'const { images, setImages, setActiveFolderPath, setViewMode, rootPath, setRootPath } = useLibraryStore();'
);

// We must replace setSelectedFolder(selected) with setRootPath(selected)
sidebarContent = sidebarContent.replace(
  'setSelectedFolder(selected);',
  'setRootPath(selected);'
);

sidebarContent = sidebarContent.replace(
  'if (!selectedFolder || images.length === 0) return null;\n    return buildTree(images, selectedFolder);',
  'if (!rootPath || images.length === 0) return null;\n    return buildTree(images, rootPath);'
);

sidebarContent = sidebarContent.replace(
  '[images, selectedFolder]',
  '[images, rootPath]'
);

sidebarContent = sidebarContent.replace(
  'rootFolder={selectedFolder || \'\'}',
  'rootFolder={rootPath || \'\'}'
);

sidebarContent = sidebarContent.replace(
  'title={selectedFolder || "Select Folder..."}',
  'title={rootPath || "Select Folder..."}'
);

sidebarContent = sidebarContent.replace(
  '{selectedFolder ? selectedFolder.split(\'/\').pop() : "Select Folder..."}',
  '{rootPath ? rootPath.split(\'/\').pop() : "Select Folder..."}'
);

fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Fixed Persistence');
