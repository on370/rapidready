const fs = require('fs');
let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

// Replace the hardcoded Browsable file tree
const oldTree = `{/* Browsable file tree */}
            <div className="p-2 space-y-0.5">
              <div className="tree-item">
                <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer">
                  <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary tree-chevron" />
                  <Folder className="w-4 h-4 text-warning" />
                  <span className="text-sm text-txt-primary font-medium">2025</span>
                </div>
                <div className="tree-children ml-4 pl-3 border-l border-app-border space-y-0.5 mt-0.5">
                  <button className="lib-folder-item w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer text-left bg-app-hover">
                    <Folder className="w-3.5 h-3.5 text-warning/70" />
                    <span className="text-xs text-txt-secondary">2025-07-20</span>
                    <span className="text-[10px] text-txt-tertiary ml-auto">(32)</span>
                  </button>
                  <button className="lib-folder-item w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer text-left">
                    <Folder className="w-3.5 h-3.5 text-warning/70" />
                    <span className="text-xs text-txt-secondary">2025-07-19</span>
                    <span className="text-[10px] text-txt-tertiary ml-auto">(61)</span>
                  </button>
                </div>
              </div>
            </div>`;

const newTree = `{/* Browsable file tree */}
            <div className="p-2 space-y-0.5">
              {Array.from(new Set(useLibraryStore.getState().images.map(img => img.path.substring(0, img.path.lastIndexOf('/'))))).map((dir, idx) => {
                const dirName = dir.split('/').pop();
                const count = useLibraryStore.getState().images.filter(img => img.path.startsWith(dir)).length;
                return (
                  <button key={idx} className="lib-folder-item w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer text-left">
                    <Folder className="w-3.5 h-3.5 text-warning/70" />
                    <span className="text-xs text-txt-secondary truncate flex-1" title={dir}>{dirName}</span>
                    <span className="text-[10px] text-txt-tertiary ml-auto">({count})</span>
                  </button>
                );
              })}
            </div>`;

sidebarContent = sidebarContent.replace(oldTree, newTree);
fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Updated Left Sidebar tree');
