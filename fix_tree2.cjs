const fs = require('fs');

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

const badOnClick = `        onClick={() => {
          if (isSelected) {
            // Deselect: go back to root folder
            const rootNodePath = node.path.substring(0, node.path.indexOf(node.path.split('/')[1] || '') || node.path.length);
            // Wait, actually we can just use the root folder path from the store.
            // But since we don't have it easily here without passing it down, we can just use setViewMode or activeFolderPath logic.
            // We pass selectedFolder down!
          } else {
            setActiveFolderPath(node.path);
          }
        }}`;

const goodOnClick = `        onClick={() => {
          if (isSelected) {
            setActiveFolderPath(rootFolder);
          } else {
            setActiveFolderPath(node.path);
          }
        }}`;

sidebarContent = sidebarContent.replace(badOnClick, goodOnClick);
fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Fixed tree selection properly');
