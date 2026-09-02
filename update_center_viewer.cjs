const fs = require('fs');

let path = 'src/components/views/library/LibraryCenter.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
content = content.replace(
  'import { useLibraryStore } from "../../../stores/libraryStore";',
  'import { useLibraryStore } from "../../../stores/libraryStore";\nimport { ZoomableImage } from "./ZoomableImage";'
);

// 2. Fix KeyBindings
content = content.replace(
  `        case ' ':
          setViewMode(viewMode === 'grid' ? 'loupe' : 'grid');
          e.preventDefault();
          break;`,
  `        case 'e':
        case 'E':
        case 'Enter':
          setViewMode('loupe');
          e.preventDefault();
          break;
        case 'g':
        case 'G':
        case 'Escape':
          setViewMode('grid');
          e.preventDefault();
          break;`
);

// 3. Replace the Loupe img with ZoomableImage and Preload logic
const oldLoupe = `{activeImage ? (
              <img src={\`rr-image://localhost\${activeImage.path}\`} className="max-w-full max-h-full object-contain" />
            ) : null}`;

const newLoupe = `{activeImage ? (
              <>
                <ZoomableImage src={\`rr-image://localhost\${activeImage.path}?fullres=true\`} alt={activeImage.name} />
                
                {/* Preloading Previous and Next Full-Res images to avoid loading lag */}
                {activeImageIndex > 0 && (
                  <img src={\`rr-image://localhost\${displayedImages[activeImageIndex - 1].path}?fullres=true\`} className="hidden" />
                )}
                {activeImageIndex < displayedImages.length - 1 && (
                  <img src={\`rr-image://localhost\${displayedImages[activeImageIndex + 1].path}?fullres=true\`} className="hidden" />
                )}
              </>
            ) : null}`;

content = content.replace(oldLoupe, newLoupe);

fs.writeFileSync(path, content);
console.log('Updated LibraryCenter for Viewer Engine');
