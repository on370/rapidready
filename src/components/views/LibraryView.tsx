import { useState, useRef, useEffect } from "react";
import { LibraryLeftSidebar } from "./library/LibraryLeftSidebar";
import { LibraryCenter } from "./library/LibraryCenter";
import { LibraryInspector } from "./library/LibraryInspector";
import { useLibraryUIStore } from "../../stores/libraryUIStore";
import { ExportCollectionModal } from "./library/components/ExportCollectionModal";

export function LibraryView() {
  const isInspectorOpen = useLibraryUIStore((s) => s.isInspectorOpen);
  const setIsInspectorOpen = useLibraryUIStore((s) => s.setIsInspectorOpen);
  
  const MIN_CENTER_WIDTH = 400;
  const MIN_LEFT_WIDTH = 180;
  const MAX_LEFT_WIDTH = 380;
  const MIN_RIGHT_WIDTH = 260;
  const MAX_RIGHT_WIDTH = 420;

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
      const containerWidth = rect.width;
      const currentRight = isInspectorOpen ? rightWidth : 0;
      
      if (isDraggingLeft) {
        const maxAllowedLeft = Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, containerWidth - currentRight - MIN_CENTER_WIDTH));
        const newWidth = Math.max(MIN_LEFT_WIDTH, Math.min(maxAllowedLeft, e.clientX - rect.left));
        setLeftWidth(newWidth);
      }
      
      if (isDraggingRight) {
        const maxAllowedRight = Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, containerWidth - leftWidth - MIN_CENTER_WIDTH));
        const newWidth = Math.max(MIN_RIGHT_WIDTH, Math.min(maxAllowedRight, rect.right - e.clientX));
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
  }, [isDraggingLeft, isDraggingRight, leftWidth, rightWidth, isInspectorOpen]);

  // Keep sidebars within limits on window resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width <= 0) continue;
        const currentRight = isInspectorOpen ? rightWidth : 0;
        const totalNeeded = leftWidth + currentRight + MIN_CENTER_WIDTH;
        if (totalNeeded > width) {
          const overflow = totalNeeded - width;
          setLeftWidth((cur) => Math.max(MIN_LEFT_WIDTH, cur - overflow));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [leftWidth, rightWidth, isInspectorOpen]);

  return (
    <div className="flex-1 w-full overflow-hidden flex flex-col min-h-0" ref={containerRef}>
      <div className="flex h-full w-full min-w-0 flex-1">
        {/* Left Sidebar */}
        <div style={{ width: leftWidth }} className="flex-shrink-0 flex min-h-0 relative">
          <LibraryLeftSidebar />
        </div>
        
        {/* Left Divider */}
        <div 
          className="relative w-px flex-shrink-0 group cursor-col-resize z-20 select-none"
          onMouseDown={(e) => { e.preventDefault(); setIsDraggingLeft(true); }}
        >
          {/* 7px hit-area & subtle RapidRAW hover track */}
          <div 
            className={`absolute inset-y-0 -left-[3px] -right-[3px] transition-colors rounded-[1px] group-hover:bg-white/[0.08] ${
              isDraggingLeft ? 'bg-white/[0.15]' : ''
            }`}
          />
          {/* Sharp 1px center line */}
          <div 
            className={`absolute inset-y-0 left-0 w-px transition-colors ${
              isDraggingLeft ? 'bg-white/70' : 'bg-app-border group-hover:bg-app-border-hover'
            }`} 
          />
        </div>
        
        {/* Center */}
        <div className="flex-1 min-w-[400px] flex min-h-0 bg-app-bg relative z-0">
          <LibraryCenter />
          {(isDraggingLeft || isDraggingRight) && <div className="absolute inset-0 z-50 cursor-col-resize" />}
        </div>

        {/* Right Area */}
        {isInspectorOpen && (
          <>
            {/* Right Divider */}
            <div 
              className="relative w-px flex-shrink-0 group cursor-col-resize z-20 select-none"
              onMouseDown={(e) => { e.preventDefault(); setIsDraggingRight(true); }}
            >
              {/* 7px hit-area & subtle RapidRAW hover track */}
              <div 
                className={`absolute inset-y-0 -left-[3px] -right-[3px] transition-colors rounded-[1px] group-hover:bg-white/[0.08] ${
                  isDraggingRight ? 'bg-white/[0.15]' : ''
                }`}
              />
              {/* Sharp 1px center line */}
              <div 
                className={`absolute inset-y-0 left-0 w-px transition-colors ${
                  isDraggingRight ? 'bg-white/70' : 'bg-app-border group-hover:bg-app-border-hover'
                }`} 
              />
            </div>
            {/* Right Sidebar */}
            <div style={{ width: rightWidth }} className="flex-shrink-0 flex min-h-0 relative">
              <LibraryInspector close={() => setIsInspectorOpen(false)} />
            </div>
          </>
        )}
      </div>
      <ExportCollectionModal />
    </div>
  );
}