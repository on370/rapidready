const fs = require('fs');

let path = 'src/stores/libraryStore.ts';
let content = fs.readFileSync(path, 'utf8');

const oldInterface = `  activeFolderPath: string | null;
  setActiveImageIndex: (index: number) => void;`;
const newInterface = `  activeFolderPath: string | null;
  setActiveImageIndex: (index: number) => void;
  invertScrollZoom: boolean;
  setInvertScrollZoom: (invert: boolean) => void;`;

const oldState = `  activeFolderPath: null,
  setActiveImageIndex: (index) => set({ activeImageIndex: index }),`;
const newState = `  activeFolderPath: null,
  setActiveImageIndex: (index) => set({ activeImageIndex: index }),
  invertScrollZoom: false,
  setInvertScrollZoom: (invertScrollZoom) => set({ invertScrollZoom }),`;

content = content.replace(oldInterface, newInterface);
content = content.replace(oldState, newState);

fs.writeFileSync(path, content);
console.log('Updated libraryStore.ts');
