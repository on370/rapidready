const fs = require('fs');
let path = 'src/main.tsx';
let content = fs.readFileSync(path, 'utf8');

// Insert import if not exists
if (!content.includes("import './i18n';")) {
  content = "import './i18n';\n" + content;
  fs.writeFileSync(path, content);
  console.log('Added i18n to main.tsx');
}
