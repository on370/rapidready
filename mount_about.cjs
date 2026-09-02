const fs = require('fs');

let path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'import { HelpModal } from "./components/ui/HelpModal";',
  'import { HelpModal } from "./components/ui/HelpModal";\nimport { AboutModal } from "./components/ui/AboutModal";'
);

content = content.replace(
  '<HelpModal />',
  '<HelpModal />\n      <AboutModal />'
);

fs.writeFileSync(path, content);
console.log('Mounted AboutModal');
