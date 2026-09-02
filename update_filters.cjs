const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

centerContent = centerContent.replace(
  `    if (filterMode === 'rated') return img.culling.rating > 0;`,
  `    if (filterMode.startsWith('rated')) {
      const minStars = parseInt(filterMode.replace('rated', '')) || 1;
      return img.culling.rating >= minStars;
    }`
);

const oldButtons = `<div className="flex items-center gap-1 text-[11px]">
          <button onClick={() => setFilterMode('rated')} className={\`filter-pill px-2 py-1 rounded-md font-medium \${filterMode === 'rated' ? 'bg-warning/15 text-warning' : 'text-txt-tertiary hover:bg-app-hover'}\`}>≥1★</button>
        </div>`;

const newButtons = `<div className="flex items-center gap-1 text-[11px]">
          {[1,2,3,4,5].map(stars => (
            <button key={stars} onClick={() => setFilterMode('rated'+stars)} className={\`filter-pill px-2 py-1 rounded-md font-medium \${filterMode === 'rated'+stars ? 'bg-warning/15 text-warning' : 'text-txt-tertiary hover:bg-app-hover'}\`}>≥{stars}★</button>
          ))}
        </div>`;

centerContent = centerContent.replace(oldButtons, newButtons);
fs.writeFileSync(centerPath, centerContent);
console.log('Fixed filters and stars');
