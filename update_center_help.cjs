const fs = require('fs');

let path = 'src/components/views/library/LibraryCenter.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add import
content = content.replace(
  'import { ZoomableImage } from "./ZoomableImage";',
  'import { ZoomableImage } from "./ZoomableImage";\nimport { HelpPopover } from "../ui/HelpPopover";'
);

// Add HelpPopover before the Inspector toggle
const targetStr = '<div className="w-px h-5 bg-app-border mx-1"></div>';
content = content.replace(targetStr, targetStr + '\n          <HelpPopover viewMode={viewMode} />');

fs.writeFileSync(path, content);
console.log('Added HelpPopover to LibraryCenter');
