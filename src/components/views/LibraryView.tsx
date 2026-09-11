import { useState, useRef, useEffect } from "react";
import { LibraryLeftSidebar } from "./library/LibraryLeftSidebar";
import { LibraryCenter } from "./library/LibraryCenter";
import { LibraryInspector } from "./library/LibraryInspector";
import { useLibraryUIStore } from "../../stores/libraryUIStore";

export function LibraryView() {
  const isInspectorOpen = useLibraryUIStore((s) => s.isInspectorOpen);
  const setIsInspectorOpen = useLibraryUIStore((s) => s.setIsInspectorOpen);
  
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
        const newWidth = Math.max(160, Math.min(400, e.clientX - rect.left));
        setLeftWidth(newWidth);
      }
      
      if (isDraggingRight) {
        const newWidth = Math.max(260, Math.min(450, rect.right - e.clientX));
        setRightWidth(newWidth);
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
          className={`w-px flex-shrink-0 bg-app-border cursor-col-resize hover:bg-accent/50 transition-colors z-10 ${isDraggingLeft ? 'bg-accent' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setIsDraggingLeft(true); }}
        />
        
        {/* Center */}
        <div className="flex-1 min-w-0 flex min-h-0 bg-app-bg relative z-0">
          <LibraryCenter />
          {(isDraggingLeft || isDraggingRight) && <div className="absolute inset-0 z-50 cursor-col-resize" />}
        </div>

        {/* Right Area */}
        {isInspectorOpen && (
          <>
            {/* Right Divider */}
            <div 
              className={`w-px flex-shrink-0 bg-app-border cursor-col-resize hover:bg-accent/50 transition-colors z-10 ${isDraggingRight ? 'bg-accent' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); setIsDraggingRight(true); }}
            />
            {/* Right Sidebar */}
            <div style={{ width: rightWidth }} className="flex-shrink-0 flex min-h-0 relative">
              <LibraryInspector close={() => setIsInspectorOpen(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}