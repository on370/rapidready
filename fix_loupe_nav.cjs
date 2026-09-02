const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

const oldKeyHandler = `        case 'ArrowRight':
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

const newKeyHandler = `        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          if (viewMode === 'loupe') {
            if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
          } else {
            if (e.key === 'ArrowRight') {
              if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
            } else {
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
            }
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          if (viewMode === 'loupe') {
            if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          } else {
            if (e.key === 'ArrowLeft') {
              if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
            } else {
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
            }
          }
          break;
        }`;

centerContent = centerContent.replace(oldKeyHandler, newKeyHandler);
fs.writeFileSync(centerPath, centerContent);
console.log('Fixed Loupe Nav');
