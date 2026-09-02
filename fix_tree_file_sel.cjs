const fs = require('fs');

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

// Update TreeView to highlight selected file
sidebarContent = sidebarContent.replace(
  'const isSelected = activeFolderPath === node.path;',
  `const isSelected = activeFolderPath === node.path;
  const isFileSelected = !node.isDir && images[useLibraryStore.getState().activeImageIndex]?.path === node.image?.path;`
);

const oldFileNode = `<div 
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
      </div>`;

const newFileNode = `<div 
        className={\`flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left \${isFileSelected ? 'bg-accent/20' : 'hover:bg-app-hover'}\`}
        style={{ paddingLeft: \`\${depth * 12 + 8}px\` }}
        onClick={(e) => {
          e.stopPropagation();
          // Keep the current folder filter if it already contains this file, otherwise set to parent
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
        <ImageIcon className={\`w-3.5 h-3.5 flex-shrink-0 \${isFileSelected ? 'text-accent' : 'text-txt-tertiary'}\`} />
        <span className={\`text-xs truncate flex-1 \${isFileSelected ? 'text-accent font-semibold' : 'text-txt-secondary'}\`} title={node.name}>{node.name}</span>
      </div>`;

sidebarContent = sidebarContent.replace(oldFileNode, newFileNode);
fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Fixed Tree File Selection');
