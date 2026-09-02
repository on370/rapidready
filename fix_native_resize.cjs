const fs = require('fs');

let viewPath = 'src/components/views/LibraryView.tsx';
let viewContent = `import { useState, useRef, useEffect } from "react";
import { LibraryLeftSidebar } from "./library/LibraryLeftSidebar";
import { LibraryCenter } from "./library/LibraryCenter";
import { LibraryInspector } from "./library/LibraryInspector";

export function LibraryView() {
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'loupe'>('grid');
  
  // Sidebar widths
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(320);
  
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      if (isDraggingLeft) {
        const newWidth = e.clientX - rect.left;
        if (newWidth >= 150 && newWidth <= 450) {
          setLeftWidth(newWidth);
        }
      }
      
      if (isDraggingRight) {
        const newWidth = rect.right - e.clientX;
        if (newWidth >= 200 && newWidth <= 500) {
          setRightWidth(newWidth);
        }
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  return (
    <div className="flex-1 w-full overflow-hidden flex flex-col min-h-0" ref={containerRef}>
      <div className="flex h-full w-full min-w-0 flex-1">
        {/* Left Sidebar */}
        <div style={{ width: leftWidth }} className="flex-shrink-0 flex min-h-0 relative">
          <LibraryLeftSidebar />
        </div>
        
        {/* Left Divider */}
        <div 
          className={\`w-1.5 flex-shrink-0 bg-app-border cursor-col-resize hover:bg-accent/50 transition-colors z-10 \${isDraggingLeft ? 'bg-accent' : ''}\`}
          onMouseDown={(e) => { e.preventDefault(); setIsDraggingLeft(true); }}
        />
        
        {/* Center */}
        <div className="flex-1 min-w-0 flex min-h-0 bg-app-bg relative z-0">
          <LibraryCenter 
            viewMode={viewMode} 
            setViewMode={setViewMode} 
            toggleInspector={() => setInspectorVisible(!inspectorVisible)} 
          />
          {(isDraggingLeft || isDraggingRight) && <div className="absolute inset-0 z-50 cursor-col-resize" />}
        </div>

        {/* Right Area */}
        {inspectorVisible && (
          <>
            {/* Right Divider */}
            <div 
              className={\`w-1.5 flex-shrink-0 bg-app-border cursor-col-resize hover:bg-accent/50 transition-colors z-10 \${isDraggingRight ? 'bg-accent' : ''}\`}
              onMouseDown={(e) => { e.preventDefault(); setIsDraggingRight(true); }}
            />
            {/* Right Sidebar */}
            <div style={{ width: rightWidth }} className="flex-shrink-0 flex min-h-0 relative">
              <LibraryInspector close={() => setInspectorVisible(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}`;
fs.writeFileSync(viewPath, viewContent);
console.log('Fixed native resize');
