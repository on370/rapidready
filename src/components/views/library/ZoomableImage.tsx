import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent } from "react";
import { useLibraryStore } from "../../../stores/libraryStore";

interface ZoomableImageProps {
  src: string;
  alt: string;
}

export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const { invertScrollZoom } = useLibraryStore();
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const startDragPos = useRef({ x: 0, y: 0 });

  // Reset state when image changes
  useEffect(() => {
    setIsZoomed(false);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        toggleZoom();
      }
      if (e.key === '+' || e.key === '=') {
        performZoomIn(0.5);
      }
      if (e.key === '-' || e.key === '_') {
        performZoomOut(0.5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  const getFitScale = () => {
    if (!containerRef.current || !imageRef.current) return 1;
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const iW = imageRef.current.naturalWidth;
    const iH = imageRef.current.naturalHeight;
    if (!iW || !iH) return 1;
    return Math.min(1, Math.min(cW / iW, cH / iH)); // Cap at 1 so fit scale isn't larger than native
  };

  const performZoomIn = (amount: number) => {
    if (!isZoomed) {
      setIsZoomed(true);
      setScale(getFitScale() + amount);
    } else {
      setScale(s => Math.min(s + amount, 5));
    }
  };

  const performZoomOut = (amount: number) => {
    if (!isZoomed) return;
    const fitScale = getFitScale();
    setScale(s => {
      const next = s - amount;
      if (next <= fitScale) {
        setIsZoomed(false);
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  };

  const toggleZoom = (e?: ReactMouseEvent) => {
    if (isZoomed) {
      setIsZoomed(false);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setIsZoomed(true);
      setScale(1); // 1 is 100% native resolution
      if (e && containerRef.current && imageRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left - rect.width / 2;
        const clickY = e.clientY - rect.top - rect.height / 2;
        clampAndSetPosition(-clickX, -clickY);
      } else {
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  const clampAndSetPosition = (x: number, y: number) => {
    if (!containerRef.current || !imageRef.current) return;
    const contRect = containerRef.current.getBoundingClientRect();
    
    // Max translation depends on image dimensions and scale
    // If the image is smaller than container, translation is 0
    // If larger, max translation is (imgSize * scale - contSize) / 2
    
    // We assume the image displays at its natural size when zoomed, 
    // multiplied by our explicit scale factor.
    // The browser calculates actual bounding rect size for us!
    const imgW = imageRef.current.naturalWidth * scale;
    const imgH = imageRef.current.naturalHeight * scale;
    
    const maxTx = Math.max(0, (imgW - contRect.width) / 2);
    const maxTy = Math.max(0, (imgH - contRect.height) / 2);

    setPosition({
      x: Math.max(-maxTx, Math.min(maxTx, x)),
      y: Math.max(-maxTy, Math.min(maxTy, y))
    });
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (!isZoomed) {
      toggleZoom(e);
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    startDragPos.current = { 
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const onMinimapMouseDown = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsMinimapDragging(true);
    handleMinimapMove(e);
  };
  
  const handleMinimapMove = (e: ReactMouseEvent | MouseEvent) => {
    if (!minimapRef.current || !containerRef.current || !imageRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    
    let px = (e.clientX - rect.left) / rect.width;
    let py = (e.clientY - rect.top) / rect.height;
    
    px = Math.max(0, Math.min(1, px));
    py = Math.max(0, Math.min(1, py));
    
    // Center is 0.5. If px = 0.5, we want translation 0.
    // If px = 0, we want translation maxTx.
    // If px = 1, we want translation -maxTx.
    const contRect = containerRef.current.getBoundingClientRect();
    const imgW = imageRef.current.getBoundingClientRect().width;
    const imgH = imageRef.current.getBoundingClientRect().height;
    
    const maxTx = Math.max(0, (imgW - contRect.width) / 2);
    const maxTy = Math.max(0, (imgH - contRect.height) / 2);
    
    setPosition({
      x: (0.5 - px) * maxTx * 2,
      y: (0.5 - py) * maxTy * 2
    });
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    if (isMinimapDragging) { 
      handleMinimapMove(e); 
      return; 
    }
    if (!isDragging || !isZoomed) return;
    
    clampAndSetPosition(
      e.clientX - startDragPos.current.x,
      e.clientY - startDragPos.current.y
    );
  };

  const onMouseUp = () => {
    setIsDragging(false);
    setIsMinimapDragging(false);
  };
  
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const isZoomIn = invertScrollZoom ? e.deltaY > 0 : e.deltaY < 0;
    if (isZoomIn) {
      performZoomIn(0.15); // Smooth scrolling step
    } else {
      performZoomOut(0.15);
    }
  };

  // Calculate minimap indicator size and position
  let mmWidth = "100%";
  let mmHeight = "100%";
  let mmTx = 0;
  let mmTy = 0;
  
  if (isZoomed && containerRef.current && imageRef.current) {
     const cW = containerRef.current.clientWidth;
     const cH = containerRef.current.clientHeight;
     const iW = imageRef.current.clientWidth * scale;
     const iH = imageRef.current.clientHeight * scale;
     
     if (iW > 0 && iH > 0) {
       // Viewport ratio using natural sizes to avoid DOM state lag
       const iW_nat = imageRef.current.naturalWidth * scale;
       const iH_nat = imageRef.current.naturalHeight * scale;
       
       const ratioX = Math.min(1, cW / iW_nat);
       const ratioY = Math.min(1, cH / iH_nat);
       mmWidth = `${ratioX * 100}%`;
       mmHeight = `${ratioY * 100}%`;
       
       // Max translations
       const maxTx = Math.max(0, (iW_nat - cW) / 2);
       const maxTy = Math.max(0, (iH_nat - cH) / 2);
       
       // position.x goes from maxTx (left edge) to -maxTx (right edge).
       // We map this to panPct (0 to 1).
       if (maxTx > 0) {
           const panPctX = (maxTx - position.x) / (2 * maxTx); // 0 to 1
           mmTx = panPctX * (1 - ratioX) * 100;
       } else {
           mmTx = (1 - ratioX) * 50; // centered
       }
       
       if (maxTy > 0) {
           const panPctY = (maxTy - position.y) / (2 * maxTy); // 0 to 1
           mmTy = panPctY * (1 - ratioY) * 100;
       } else {
           mmTy = (1 - ratioY) * 50; // centered
       }
     }
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden flex items-center justify-center bg-app-deepest"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      {isZoomed && (
        <div 
          ref={minimapRef}
          onMouseDown={onMinimapMouseDown}
          className="absolute bottom-6 right-6 w-32 h-24 bg-black/50 border border-white/20 rounded shadow-lg overflow-hidden flex items-center justify-center z-50 cursor-crosshair"
        >
          <img src={src} className="max-w-full max-h-full opacity-50 pointer-events-none" />
          <div 
            className="absolute border border-accent bg-accent/20 pointer-events-none"
            style={{
              width: mmWidth,
              height: mmHeight,
              left: `${mmTx}%`,
              top: `${mmTy}%`
            }}
          />
        </div>
      )}

      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onMouseDown={onMouseDown}
        className={`select-none ${!isDragging ? "transition-transform duration-200" : ""}`}
        style={{
          cursor: isZoomed ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          transform: isZoomed 
            ? `translate(${position.x}px, ${position.y}px) scale(${scale})` 
            : 'scale(1)',
          maxWidth: isZoomed ? 'none' : '100%',
          maxHeight: isZoomed ? 'none' : '100%',
          objectFit: isZoomed ? 'none' : 'contain',
        }}
        draggable={false}
      />
    </div>
  );
}