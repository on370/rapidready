const fs = require('fs');

let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

const importRegex = /import \{ useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent \} from 'react';/;
content = content.replace(importRegex, 'import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent } from "react";\nimport { useLibraryStore } from "../../../stores/libraryStore";');

const oldStart = `export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);`;
const newStart = `export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  const { invertScrollZoom } = useLibraryStore();
  const [scale, setScale] = useState(1);`;
content = content.replace(oldStart, newStart);

const oldWheel = `  const onWheel = (e: WheelEvent) => {
    if (!isZoomed) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale(s => Math.min(s + 0.2, 5));
    } else {
      setScale(s => Math.max(s - 0.2, 1));
    }
  };`;
const newWheel = `  const onWheel = (e: WheelEvent) => {
    if (!isZoomed) return;
    e.preventDefault();
    const isZoomIn = invertScrollZoom ? e.deltaY > 0 : e.deltaY < 0;
    if (isZoomIn) {
      setScale(s => Math.min(s + 0.2, 5));
    } else {
      setScale(s => Math.max(s - 0.2, 1));
    }
  };`;
content = content.replace(oldWheel, newWheel);

fs.writeFileSync(path, content);
console.log('Updated ZoomableImage.tsx to use invertScrollZoom');
