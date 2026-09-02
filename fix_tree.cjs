const fs = require('fs');

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

sidebarContent = sidebarContent.replace(
  'onClick={() => {\n          setIsOpen(!isOpen);\n          setActiveFolderPath(node.path);\n        }}',
  `onClick={() => {
          if (isSelected) {
            // Deselect: go back to root folder
            const rootNodePath = node.path.substring(0, node.path.indexOf(node.path.split('/')[1] || '') || node.path.length);
            // Wait, actually we can just use the root folder path from the store.
            // But since we don't have it easily here without passing it down, we can just use setViewMode or activeFolderPath logic.
            // We pass selectedFolder down!
          } else {
            setActiveFolderPath(node.path);
          }
        }}`
);

// Better way: pass selectedFolder from parent to TreeView
sidebarContent = sidebarContent.replace(
  'function TreeView({ node, depth = 0 }: { node: TreeNode, depth?: number }) {',
  'function TreeView({ node, depth = 0, rootFolder }: { node: TreeNode, depth?: number, rootFolder: string }) {'
);

sidebarContent = sidebarContent.replace(
  '<TreeView key={idx} node={child} depth={depth + 1} />',
  '<TreeView key={idx} node={child} depth={depth + 1} rootFolder={rootFolder} />'
);

sidebarContent = sidebarContent.replace(
  '<TreeView key={idx} node={child} depth={0} />',
  '<TreeView key={idx} node={child} depth={0} rootFolder={selectedFolder} />'
);

// Now fix the onClick
sidebarContent = sidebarContent.replace(
  `onClick={() => {
          setIsOpen(!isOpen);
          setActiveFolderPath(node.path);
        }}`,
  `onClick={() => {
          if (isSelected) {
            setActiveFolderPath(rootFolder);
          } else {
            setActiveFolderPath(node.path);
          }
        }}`
);

fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Fixed tree selection');
