const fs = require('fs');

let path = 'crates/rapidready-core/src/thumbnail.rs';
let content = fs.readFileSync(path, 'utf8');

const oldCheck = `if thumb.width == thumb.height && (thumb.width == 1024 || thumb.width == 512 || thumb.width == 256) {
                continue;
            }`;

const newCheck = `// A generic macOS document icon has transparent corners.
            // RAW photos NEVER have an alpha channel (transparency).
            // If the top-left pixel is fully transparent (Alpha == 0), it is guaranteed to be a generic icon or padded frame, not the raw photo.
            if thumb.rgba.len() >= 4 && thumb.rgba[3] == 0 {
                continue;
            }`;

content = content.replace(oldCheck, newCheck);
fs.writeFileSync(path, content);
console.log('Fixed heuristic');
