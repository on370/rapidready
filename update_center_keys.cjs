const fs = require('fs');

let path = 'src/components/views/library/LibraryCenter.tsx';
let content = fs.readFileSync(path, 'utf8');

const keysHookStr = `        case 'e':
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
          break;`;

const newKeysHookStr = `        case 'e':
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
          break;
        case ' ':
          e.preventDefault();
          if (e.shiftKey) {
             if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          } else {
             if (activeImageIndex < displayedImages.length - 1) setActiveImageIndex(activeImageIndex + 1);
          }
          break;`;

content = content.replace(keysHookStr, newKeysHookStr);

fs.writeFileSync(path, content);
console.log('Updated LibraryCenter keys');
