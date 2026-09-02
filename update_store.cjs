const fs = require('fs');

let storePath = 'src/stores/libraryStore.ts';
let storeContent = fs.readFileSync(storePath, 'utf8');

// Add activeFolderPath
if (!storeContent.includes('activeFolderPath')) {
  storeContent = storeContent.replace(
    'activeImageIndex: number;',
    `activeImageIndex: number;
  activeFolderPath: string | null;
  setActiveFolderPath: (path: string | null) => void;`
  );

  storeContent = storeContent.replace(
    'activeImageIndex: 0,',
    `activeImageIndex: 0,
  activeFolderPath: null,
  setActiveFolderPath: (path) => set({ activeFolderPath: path }),`
  );
}

fs.writeFileSync(storePath, storeContent);
console.log('Updated libraryStore.ts');
