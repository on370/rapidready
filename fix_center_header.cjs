const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

// Find the header section
centerContent = centerContent.replace(
  '<h1 className="text-xl font-semibold text-txt-primary">Urlaub 2025 Mallorca</h1>',
  '<h1 className="text-xl font-semibold text-txt-primary truncate max-w-[400px]">{activeFolderPath ? activeFolderPath.split(\'/\').pop() : \'All Images\'}</h1>'
);

centerContent = centerContent.replace(
  '<span className="text-sm text-txt-tertiary">847 items • 12.4 GB</span>',
  '<span className="text-sm text-txt-tertiary">{displayedImages.length} items • {(displayedImages.reduce((acc, img) => acc + img.size, 0) / (1024*1024)).toFixed(1)} MB</span>'
);

// Auto-advance toggle
const oldAutoAdvanceBtn = `<button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-app-border bg-app-panel text-xs text-txt-secondary hover:text-txt-primary hover:border-app-border-hover transition-colors">
            <Zap className="w-3.5 h-3.5 text-warning" />
            Auto-Advance
          </button>`;
const newAutoAdvanceBtn = `<button onClick={() => setAutoAdvance(!autoAdvance)} className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors \${autoAdvance ? 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/20' : 'border-app-border bg-app-panel text-txt-secondary hover:text-txt-primary hover:border-app-border-hover'}\`}>
            <Zap className={\`w-3.5 h-3.5 \${autoAdvance ? 'text-warning fill-warning' : 'text-txt-tertiary'}\`} />
            Auto-Advance
          </button>`;
centerContent = centerContent.replace(oldAutoAdvanceBtn, newAutoAdvanceBtn);

// Delete 3 button -> Delete Rejected
const oldDeleteBtn = `<button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger/30 bg-danger/10 text-xs text-danger font-medium hover:bg-danger/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            Delete 3
          </button>`;
const newDeleteBtn = `<button onClick={() => {
            const rejected = displayedImages.filter(i => i.culling.flag === -1);
            if (rejected.length === 0) return;
            if (window.confirm(\`Move \${rejected.length} rejected images to trash?\`)) {
              invoke('delete_files', { paths: rejected.map(i => i.path), toTrash: true }).then(() => {
                // Remove from store
                const remaining = images.filter(i => i.culling.flag !== -1);
                useLibraryStore.getState().setImages(remaining);
              }).catch(console.error);
            }
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger/30 bg-danger/10 text-xs text-danger font-medium hover:bg-danger/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            Delete Rejected ({displayedImages.filter(i => i.culling.flag === -1).length})
          </button>`;
centerContent = centerContent.replace(oldDeleteBtn, newDeleteBtn);

fs.writeFileSync(centerPath, centerContent);
console.log('Fixed Center Header');
