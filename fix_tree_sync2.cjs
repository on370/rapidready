const fs = require('fs');
let path = 'src/components/views/library/LibraryLeftSidebar.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'const { activeFolderPath, setActiveFolderPath, setViewMode, images, setActiveImageIndex } = useLibraryStore();',
  'const { activeFolderPath, setActiveFolderPath, setViewMode, images, activeImageIndex, setActiveImageIndex } = useLibraryStore();'
);

fs.writeFileSync(path, content);
console.log('Fixed useLibraryStore destructuring');
