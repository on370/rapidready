const fs = require('fs');

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

sidebarContent = sidebarContent.replace(
  'import { useState } from "react";',
  `import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";`
);

sidebarContent = sidebarContent.replace(
  'const [libraryOpen, setLibraryOpen] = useState(true);',
  `const [libraryOpen, setLibraryOpen] = useState(true);
  const { setImages } = useLibraryStore();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({ directory: true });
      if (selected && !Array.isArray(selected)) {
        setSelectedFolder(selected);
        const images: LibraryImage[] = await invoke('scan_archive_directory', { path: selected });
        setImages(images);
      }
    } catch (e) {
      console.error(e);
    }
  };`
);

const oldFolderSelect = `<div className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
                <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
                <span className="text-txt-primary truncate">/Volumes/Photos/Archiv</span>
                <ChevronDown className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
              </div>`;

const newFolderSelect = `<div onClick={handleSelectFolder} className="flex items-center bg-app-card border border-app-border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-app-border-hover transition-colors">
                <Folder className="w-3.5 h-3.5 text-txt-tertiary mr-1.5 flex-shrink-0" />
                <span className="text-txt-primary truncate" title={selectedFolder || "Select Folder..."}>{selectedFolder || "Select Folder..."}</span>
                <Plus className="w-3 h-3 text-txt-tertiary ml-auto flex-shrink-0" />
              </div>`;
sidebarContent = sidebarContent.replace(oldFolderSelect, newFolderSelect);

fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Done LibraryLeftSidebar.tsx');
