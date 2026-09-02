const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

// Update keyboard handler
const oldKeyHandler = `        case 'ArrowRight':
          if (activeImageIndex < images.length - 1) setActiveImageIndex(activeImageIndex + 1);
          break;
        case 'ArrowLeft':
          if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          break;`;

const newKeyHandler = `        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (activeImageIndex < images.length - 1) setActiveImageIndex(activeImageIndex + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          break;`;

centerContent = centerContent.replace(oldKeyHandler, newKeyHandler);

// Update flag buttons
const oldFlags = `<div className="flex items-center gap-0.5">
          <button className="w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 text-txt-tertiary">X</button>
          <button className="w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover text-txt-tertiary">U</button>
          <button className="w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 text-txt-tertiary">P</button>
        </div>`;

const newFlags = `<div className="flex items-center gap-0.5">
          <button onClick={() => handleCulling(-1, activeImage?.culling.rating || 0)} className={\`w-8 h-7 rounded-l-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-danger/20 \${activeImage?.culling.flag === -1 ? 'bg-danger text-white' : 'text-txt-tertiary'}\`}>X</button>
          <button onClick={() => handleCulling(null, activeImage?.culling.rating || 0)} className={\`w-8 h-7 flex items-center justify-center text-xs font-bold transition-all border-y border-app-border hover:bg-app-hover \${activeImage?.culling.flag === null ? 'bg-app-hover text-white' : 'text-txt-tertiary'}\`}>U</button>
          <button onClick={() => handleCulling(1, activeImage?.culling.rating || 0)} className={\`w-8 h-7 rounded-r-md flex items-center justify-center text-xs font-bold transition-all border border-app-border hover:bg-success/20 \${activeImage?.culling.flag === 1 ? 'bg-success text-white' : 'text-txt-tertiary'}\`}>P</button>
        </div>`;

centerContent = centerContent.replace(oldFlags, newFlags);

// Update star buttons
const oldStars = `<div className="flex items-center gap-0.5">
          {[1,2,3,4,5].map(s => (
            <button key={s} className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-all">
              <Star className="w-3.5 h-3.5 text-txt-tertiary" />
            </button>
          ))}
        </div>`;

const newStars = `<div className="flex items-center gap-0.5">
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => handleCulling(activeImage?.culling.flag || null, activeImage?.culling.rating === s ? 0 : s)} className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-all">
              <Star className={\`w-3.5 h-3.5 \${(activeImage?.culling.rating || 0) >= s ? 'text-warning fill-warning' : 'text-txt-tertiary'}\`} />
            </button>
          ))}
        </div>`;

centerContent = centerContent.replace(oldStars, newStars);

fs.writeFileSync(centerPath, centerContent);
console.log('Updated LibraryCenter buttons and keys');
