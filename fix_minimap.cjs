const fs = require('fs');

let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

const overlay = `
      {/* Minimap overlay */}
      {isZoomed && (
        <div className="absolute bottom-6 right-6 w-32 h-24 bg-black/50 border border-white/20 rounded shadow-lg overflow-hidden flex items-center justify-center pointer-events-none z-50">
          <img src={src} className="max-w-full max-h-full opacity-50" />
          {/* Viewport indicator box (approximate) */}
          <div 
            className="absolute border border-accent/80 bg-accent/10"
            style={{
              width: '40%',
              height: '40%',
              transform: \`translate(\${-position.x * 0.05}px, \${-position.y * 0.05}px)\`
            }}
          />
        </div>
      )}
`;

content = content.replace(
  '<img',
  overlay + '\n      <img'
);

fs.writeFileSync(path, content);
console.log('Added minimap to ZoomableImage');
