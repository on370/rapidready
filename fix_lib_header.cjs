const fs = require('fs');

let headerPath = 'src/components/views/library/LibraryHeader.tsx';
let headerContent = fs.readFileSync(headerPath, 'utf8');

headerContent = headerContent.replace(
  'import { Filter, SlidersHorizontal, Trash2 } from "lucide-react";',
  `import { Filter, SlidersHorizontal, Trash2 } from "lucide-react";
import { useLibraryStore } from "../../../stores/libraryStore";`
);

headerContent = headerContent.replace(
  'export function LibraryHeader() {',
  `export function LibraryHeader() {
  const { activeFolderPath, images } = useLibraryStore();
  const displayed = activeFolderPath ? images.filter(img => img.path.startsWith(activeFolderPath)) : images;
  const name = activeFolderPath ? activeFolderPath.split('/').pop() : 'All Images';
  const sizeBytes = displayed.reduce((acc, img) => acc + img.size, 0);
  const sizeStr = sizeBytes > 1024 * 1024 * 1024 
    ? (sizeBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    : (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';
`
);

headerContent = headerContent.replace(
  '<h1 className="text-xl font-semibold text-txt-primary">Urlaub 2025 Mallorca</h1>',
  '<h1 className="text-xl font-semibold text-txt-primary truncate max-w-[400px]">{name}</h1>'
);

headerContent = headerContent.replace(
  '<span className="text-sm text-txt-tertiary">847 items • 12.4 GB</span>',
  '<span className="text-sm text-txt-tertiary">{displayed.length} items • {sizeStr}</span>'
);

fs.writeFileSync(headerPath, headerContent);
console.log('Fixed LibraryHeader');
