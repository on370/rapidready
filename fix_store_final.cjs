const fs = require('fs');
let path = 'src/stores/libraryStore.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'updateCullingState: (index: number, partialState: Partial<CullingState>) => void;\n}',
  'updateCullingState: (index: number, partialState: Partial<CullingState>) => void;\n  invertScrollZoom: boolean;\n  setInvertScrollZoom: (b: boolean) => void;\n}'
);

content = content.replace(
  '    return { images: newImages };\n  })\n}));',
  '    return { images: newImages };\n  }),\n  invertScrollZoom: false,\n  setInvertScrollZoom: (invertScrollZoom) => set({ invertScrollZoom })\n}));'
);

fs.writeFileSync(path, content);
