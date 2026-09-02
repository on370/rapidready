const fs = require('fs');

const hookContent = `import { useState, useCallback, useEffect } from 'react';

export function useResizable(
  initialWidth: number,
  minWidth: number,
  maxWidth: number
) {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // For left sidebar: e.clientX is roughly the width
      // We'll let the user pass the calc logic or just assume left sidebar for now.
      // Actually, better to just return the generic drag handler
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);

  return { width, startDrag, isDragging, setWidth, setIsDragging };
}
`;
// Actually, let's just implement the drag inline in LibraryView!
