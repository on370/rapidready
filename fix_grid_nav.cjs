const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

const oldKeyHandler = `        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          break;`;

const newKeyHandler = `        case 'ArrowRight':
          e.preventDefault();
          if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          break;
        case 'ArrowDown': {
          e.preventDefault();
          const cols = 6;
          const rows = Math.ceil(displayedImages.length / cols);
          const currentRow = Math.floor(activeImageIndex / cols);
          const currentCol = activeImageIndex % cols;
          let nextRow = currentRow + 1;
          if (nextRow >= rows) nextRow = 0;
          let nextIdx = nextRow * cols + currentCol;
          if (nextIdx >= displayedImages.length) {
            nextIdx = currentRow === rows - 1 ? currentCol : displayedImages.length - 1;
          }
          setActiveImageIndex(nextIdx);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const cols = 6;
          const rows = Math.ceil(displayedImages.length / cols);
          const currentRow = Math.floor(activeImageIndex / cols);
          const currentCol = activeImageIndex % cols;
          let nextRow = currentRow - 1;
          if (nextRow < 0) nextRow = rows - 1;
          let nextIdx = nextRow * cols + currentCol;
          if (nextIdx >= displayedImages.length) {
            nextIdx = displayedImages.length - 1;
          }
          setActiveImageIndex(nextIdx);
          break;
        }`;

centerContent = centerContent.replace(oldKeyHandler, newKeyHandler);

// Add scrollIntoView effect
if (!centerContent.includes("document.getElementById('active-grid-img')")) {
  const effectBlock = `  useEffect(() => {
    if (viewMode === 'grid') {
      const el = document.getElementById('active-grid-img');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeImageIndex, viewMode]);

  useEffect(() => {`;
  centerContent = centerContent.replace('useEffect(() => {', effectBlock);
}

// Add ID to active image
const oldImgDiv = `              <div 
                key={idx} 
                className={\`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden group \${activeImageIndex === idx ? 'border-accent ring-2 ring-accent' : 'border-app-border hover:border-app-border-hover'}\`}
                onClick={() => setActiveImageIndex(idx)}
              >`;
const newImgDiv = `              <div 
                key={idx} 
                id={activeImageIndex === idx ? 'active-grid-img' : undefined}
                className={\`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden group \${activeImageIndex === idx ? 'border-accent ring-2 ring-accent' : 'border-app-border hover:border-app-border-hover'}\`}
                onClick={() => setActiveImageIndex(idx)}
              >`;
centerContent = centerContent.replace(oldImgDiv, newImgDiv);

fs.writeFileSync(centerPath, centerContent);
console.log('Fixed Grid Nav');
