const fs = require('fs');
let path = 'src/lib.rs';
let content = fs.readFileSync(path, 'utf8');

const oldCall = `match rapidready_core::thumbnail::get_preview_jpeg(path, 8) {`;
const newCall = `match rapidready_core::thumbnail::get_max_preview_jpeg(path) {`;

content = content.replace(oldCall, newCall);
fs.writeFileSync(path, content);
console.log('Fixed lib.rs');
