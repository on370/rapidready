const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

const oldButtons = `<div className="flex items-center gap-1">
          <button className="filter-pill px-2 py-1 rounded-md bg-accent/15 text-accent font-medium">All</button>
          <button className="filter-pill px-2 py-1 rounded-md text-txt-tertiary hover:bg-app-hover font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>Picks
          </button>
        </div>
        <div className="w-px h-4 bg-app-border"></div>
        <div className="flex items-center gap-1">
          <button className="filter-pill px-2 py-1 rounded-md text-txt-tertiary hover:bg-app-hover font-medium">≥1★</button>
        </div>`;

const newButtons = `<div className="flex items-center gap-1 text-[11px]">
          <button onClick={() => setFilterMode('all')} className={\`filter-pill px-2 py-1 rounded-md font-medium \${filterMode === 'all' ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:bg-app-hover'}\`}>All</button>
          <button onClick={() => setFilterMode('picks')} className={\`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 \${filterMode === 'picks' ? 'bg-success/15 text-success' : 'text-txt-tertiary hover:bg-app-hover'}\`}>
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>Picks
          </button>
          <button onClick={() => setFilterMode('rejected')} className={\`filter-pill px-2 py-1 rounded-md font-medium flex items-center gap-1 \${filterMode === 'rejected' ? 'bg-danger/15 text-danger' : 'text-txt-tertiary hover:bg-app-hover'}\`}>
            <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>Rejected
          </button>
        </div>
        <div className="w-px h-4 bg-app-border"></div>
        <div className="flex items-center gap-1 text-[11px]">
          <button onClick={() => setFilterMode('rated')} className={\`filter-pill px-2 py-1 rounded-md font-medium \${filterMode === 'rated' ? 'bg-warning/15 text-warning' : 'text-txt-tertiary hover:bg-app-hover'}\`}>≥1★</button>
        </div>`;

centerContent = centerContent.replace(oldButtons, newButtons);
fs.writeFileSync(centerPath, centerContent);
console.log('Fixed Filters again');
