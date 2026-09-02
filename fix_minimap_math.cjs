const fs = require('fs');

let path = 'src/components/views/library/ZoomableImage.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldMath = `// Viewport ratio
       const ratioX = Math.min(1, cW / iW);
       const ratioY = Math.min(1, cH / iH);
       mmWidth = \`\${ratioX * 100}%\`;
       mmHeight = \`\${ratioY * 100}%\`;
       
       // Max translations
       const maxTx = Math.max(0, (iW - cW) / 2);
       const maxTy = Math.max(0, (iH - cH) / 2);
       
       // Map position (-maxTx to +maxTx) to minimap (-50% to +50% remaining space)
       if (maxTx > 0) {
           const panPctX = -position.x / maxTx; // -1 to 1
           mmTx = panPctX * (1 - ratioX) * 50; // percent
       }
       if (maxTy > 0) {
           const panPctY = -position.y / maxTy; // -1 to 1
           mmTy = panPctY * (1 - ratioY) * 50; // percent
       }`;

const newMath = `// Viewport ratio using natural sizes to avoid DOM state lag
       const iW_nat = imageRef.current.naturalWidth * scale;
       const iH_nat = imageRef.current.naturalHeight * scale;
       
       const ratioX = Math.min(1, cW / iW_nat);
       const ratioY = Math.min(1, cH / iH_nat);
       mmWidth = \`\${ratioX * 100}%\`;
       mmHeight = \`\${ratioY * 100}%\`;
       
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
       }`;

content = content.replace(oldMath, newMath);

// Update clampAndSetPosition and handleMinimapMove to use naturalWidth/naturalHeight as well!
const oldClamp = `const imgW = imgRect.width;
    const imgH = imgRect.height;`;
const newClamp = `const imgW = imageRef.current.naturalWidth * scale;
    const imgH = imageRef.current.naturalHeight * scale;`;

// Replace both occurrences (in clampAndSetPosition and handleMinimapMove)
content = content.split(oldClamp).join(newClamp);


// Fix the JSX for minimap indicator
const oldIndicator = `style={{
              width: mmWidth,
              height: mmHeight,
              transform: \`translate(\${mmTx}%, \${mmTy}%)\`
            }}`;

const newIndicator = `style={{
              width: mmWidth,
              height: mmHeight,
              left: \`\${mmTx}%\`,
              top: \`\${mmTy}%\`
            }}`;

content = content.replace(oldIndicator, newIndicator);

fs.writeFileSync(path, content);
console.log('Fixed minimap math');
