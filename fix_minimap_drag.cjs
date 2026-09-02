const fs = require('fs');
let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

// First remove pointer-events-none from minimap container
content = content.replace('pointer-events-none z-50"', 'z-50"');

// Add minimap dragging logic
const stateHook = `  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const minimapRef = useRef<HTMLDivElement>(null);`;

content = content.replace('const imageRef = useRef<HTMLImageElement>(null);', 'const imageRef = useRef<HTMLImageElement>(null);\n' + stateHook);

const minimapMouseDown = `  const onMinimapMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsMinimapDragging(true);
    handleMinimapMove(e);
  };
  
  const handleMinimapMove = (e: MouseEvent) => {
    if (!minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    // Calculate click percentage within the minimap (0 to 1)
    let px = (e.clientX - rect.left) / rect.width;
    let py = (e.clientY - rect.top) / rect.height;
    
    // Clamp to 0..1
    px = Math.max(0, Math.min(1, px));
    py = Math.max(0, Math.min(1, py));
    
    // Map to position. We need the container and image size to do this accurately,
    // but a rough approximation based on the reverse of the minimap rendering:
    // The minimap draws the box translated by \`-position.x * 0.05\`.
    // If the user clicks at 50%, they want the center.
    // The scale of minimap is ~0.05 of the full image.
    // Actually, position is the translation from center. 
    // If they click px (0..1), center is 0.5.
    // Offset from center is (0.5 - px).
    // Multiply by a large factor to get translation.
    
    const maxPanX = window.innerWidth;
    const maxPanY = window.innerHeight;
    
    setPosition({
      x: (0.5 - px) * maxPanX * 2,
      y: (0.5 - py) * maxPanY * 2
    });
  };`;

content = content.replace('  const onMouseMove =', minimapMouseDown + '\n\n  const onMouseMove =');

// Update onMouseMove to handle minimap drag
content = content.replace(
  'if (!isDragging || !isZoomed) return;',
  'if (isMinimapDragging) { handleMinimapMove(e); return; }\n    if (!isDragging || !isZoomed) return;'
);

// Update onMouseUp to handle minimap drag
content = content.replace(
  'setIsDragging(false);\n    }',
  'setIsDragging(false);\n    }\n    if (isMinimapDragging) {\n      setIsMinimapDragging(false);\n    }'
);

// Update the minimap JSX
const oldMinimapDiv = `<div className="absolute bottom-6 right-6 w-32 h-24 bg-black/50 border border-white/20 rounded shadow-lg overflow-hidden flex items-center justify-center z-50">`;
const newMinimapDiv = `<div 
        ref={minimapRef}
        onMouseDown={onMinimapMouseDown}
        className="absolute bottom-6 right-6 w-32 h-24 bg-black/50 border border-white/20 rounded shadow-lg overflow-hidden flex items-center justify-center z-50 cursor-crosshair">`;

content = content.replace(oldMinimapDiv, newMinimapDiv);

fs.writeFileSync(path, content);
console.log('Added minimap panning');
