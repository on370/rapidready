const fs = require('fs');

let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'className="transition-transform duration-200 select-none"',
  'className={`select-none ${!isDragging ? "transition-transform duration-200" : ""}`}'
);

fs.writeFileSync(path, content);
console.log('Fixed ZoomableImage dragging classes');
