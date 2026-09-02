const fs = require('fs');
let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

// We will inject getFitScale function and update onWheel / handleKeyDown

const newMethods = `  const getFitScale = () => {
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
  };`;

// Replace handleKeyDown logic
const oldKeyLogic = `      if (e.key === '+' || e.key === '=') {
        if (isZoomed) setScale(s => Math.min(s + 0.5, 5));
      }
      if (e.key === '-' || e.key === '_') {
        if (isZoomed) setScale(s => Math.max(s - 0.5, 1));
      }`;

const newKeyLogic = `      if (e.key === '+' || e.key === '=') {
        performZoomIn(0.5);
      }
      if (e.key === '-' || e.key === '_') {
        performZoomOut(0.5);
      }`;

// Replace onWheel logic
const oldWheel = `  const onWheel = (e: WheelEvent) => {
    if (!isZoomed) return;
    e.preventDefault();
    const isZoomIn = invertScrollZoom ? e.deltaY > 0 : e.deltaY < 0;
    if (isZoomIn) {
      setScale(s => Math.min(s + 0.2, 5));
    } else {
      setScale(s => Math.max(s - 0.2, 1));
    }
  };`;

const newWheel = `  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const isZoomIn = invertScrollZoom ? e.deltaY > 0 : e.deltaY < 0;
    if (isZoomIn) {
      performZoomIn(0.15); // Smooth scrolling step
    } else {
      performZoomOut(0.15);
    }
  };`;

// Insert the new methods before toggleZoom
content = content.replace('  const toggleZoom =', newMethods + '\n\n  const toggleZoom =');
content = content.replace(oldKeyLogic, newKeyLogic);
content = content.replace(oldWheel, newWheel);

fs.writeFileSync(path, content);
console.log('Fixed zoom range to Fit');
