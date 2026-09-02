const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

// Add imports
centerContent = centerContent.replace(
  'import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, Camera, ChevronLeft, ChevronRight } from "lucide-react";',
  `import { LayoutGrid, Scan, PanelRight, Zap, Star, Trash2, Camera, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useLibraryStore } from "../../../stores/libraryStore";
import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";`
);

// Replace hardcoded mock thumbnails
const oldGrid = `{/* Mocking a few thumbnails */}
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-[3/2] rounded-lg border border-app-border thumb-placeholder cursor-pointer" style={{ background: \`linear-gradient(135deg, #1a4a6e, #2d7aac)\` }}>
                <div className="flex flex-col items-center gap-1">
                  <Camera className="w-6 h-6 text-white/20" />
                  <span className="text-[10px] text-white/40">IMG_450{i}.cr3</span>
                </div>
              </div>
            ))}`;

const newGrid = `{images.map((img, idx) => (
              <div 
                key={idx} 
                className={\`aspect-[3/2] rounded-lg border cursor-pointer relative overflow-hidden group \${activeImageIndex === idx ? 'border-accent ring-2 ring-accent' : 'border-app-border hover:border-app-border-hover'}\`}
                onClick={() => setActiveImageIndex(idx)}
              >
                <img src={\`rr-image://localhost\${img.path}?scale=1\`} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.culling.flag === 1 && <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                  {img.culling.flag === -1 && <div className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-[10px] font-bold text-white">X</div>}
                </div>
                {img.culling.rating > 0 && (
                  <div className="absolute bottom-1 left-1 flex">
                     {Array.from({length: img.culling.rating}).map((_, i) => <Star key={i} className="w-3 h-3 text-warning fill-warning" />)}
                  </div>
                )}
                {img.culling.flag === -1 && <div className="absolute inset-0 bg-danger/20 pointer-events-none" />}
              </div>
            ))}`;

centerContent = centerContent.replace(oldGrid, newGrid);

// Replace Loupe mock
const oldLoupe = `{/* Content Area */}
      {viewMode === 'grid' ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-6 gap-3">
            {images.map((img, idx) => (`;

const oldLoupeInner = `          <div className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative">
            <div className="thumb-placeholder rounded-xl w-4/5 aspect-[3/2]" style={{ background: \`linear-gradient(135deg, #1a4a6e, #2d7aac)\` }}>
              <div className="flex flex-col items-center gap-3">
                <Camera className="w-16 h-16 text-white/15" />
                <span className="text-sm text-white/25 font-medium">IMG_4501.cr3</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0">
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors">
              <ChevronLeft className="w-4 h-4 text-txt-secondary" />
            </button>
            <div className="flex items-center gap-4 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">IMG_4501.cr3</span>
              <span>1 / 16</span>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors">
              <ChevronRight className="w-4 h-4 text-txt-secondary" />
            </button>
          </div>`;

const newLoupeInner = `          <div className="flex-1 flex items-center justify-center bg-app-deepest p-6 min-h-0 relative">
            {activeImage ? (
              <img src={\`rr-image://localhost\${activeImage.path}?scale=4\`} className="max-w-full max-h-full object-contain" />
            ) : null}
            {activeImage?.culling.flag === -1 && <div className="absolute inset-0 bg-danger/10 pointer-events-none" />}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-app-border bg-app-panel/80 flex-shrink-0">
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors" onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}>
              <ChevronLeft className="w-4 h-4 text-txt-secondary" />
            </button>
            <div className="flex items-center gap-4 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">{activeImage?.name}</span>
              <span>{images.length > 0 ? activeImageIndex + 1 : 0} / {images.length}</span>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-app-hover transition-colors" onClick={() => setActiveImageIndex(Math.min(images.length - 1, activeImageIndex + 1))}>
              <ChevronRight className="w-4 h-4 text-txt-secondary" />
            </button>
          </div>`;
centerContent = centerContent.replace(oldLoupeInner, newLoupeInner);

// Inject zustand state and keyboard listeners at the top of the component
centerContent = centerContent.replace(
  'export function LibraryCenter({ viewMode, setViewMode, toggleInspector }: LibraryCenterProps) {',
  `export function LibraryCenter({ viewMode, setViewMode, toggleInspector }: LibraryCenterProps) {
  const { images, activeImageIndex, setActiveImageIndex, autoAdvance, setAutoAdvance, updateCullingState } = useLibraryStore();
  const activeImage = images[activeImageIndex];

  const handleCulling = useCallback((flag: number | null, rating: number) => {
    if (!activeImage) return;
    
    // Update local state instantly
    updateCullingState(activeImageIndex, { flag, rating });
    
    // Persist to sidecar
    invoke('set_culling_state', { 
      path: activeImage.path,
      flag,
      rating,
      color: null
    }).catch(console.error);

    if (autoAdvance && activeImageIndex < images.length - 1) {
      setActiveImageIndex(activeImageIndex + 1);
    }
  }, [activeImage, activeImageIndex, autoAdvance, images.length, setActiveImageIndex, updateCullingState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;

      switch(e.key) {
        case 'ArrowRight':
          if (activeImageIndex < images.length - 1) setActiveImageIndex(activeImageIndex + 1);
          break;
        case 'ArrowLeft':
          if (activeImageIndex > 0) setActiveImageIndex(activeImageIndex - 1);
          break;
        case 'p':
        case 'P':
          handleCulling(1, activeImage?.culling.rating || 0);
          break;
        case 'x':
        case 'X':
          handleCulling(-1, activeImage?.culling.rating || 0);
          break;
        case 'u':
        case 'U':
          handleCulling(null, activeImage?.culling.rating || 0);
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          handleCulling(activeImage?.culling.flag || null, parseInt(e.key));
          break;
        case ' ':
          setViewMode(viewMode === 'grid' ? 'loupe' : 'grid');
          e.preventDefault();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImageIndex, images.length, handleCulling, viewMode, setViewMode]);
`
);

fs.writeFileSync(centerPath, centerContent);
console.log('Done LibraryCenter.tsx');
