const fs = require('fs');
let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

const hook = `
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;
      
      if (e.key === ' ') {
        e.preventDefault();
        setIsZoomed(prev => !prev);
        if (isZoomed) {
          setPosition({ x: 0, y: 0 });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);
`;

content = content.replace('// Reset state when image changes', hook + '\n\n  // Reset state when image changes');

fs.writeFileSync(path, content);
console.log('Added space listener to ZoomableImage');
