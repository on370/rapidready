const fs = require('fs');
let path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add import
content = content.replace(
  'import { SettingsView } from "./components/views/SettingsView";',
  'import { SettingsView } from "./components/views/SettingsView";\nimport { HelpModal } from "./components/ui/HelpModal";'
);

// Add component to layout
content = content.replace(
  '      </div>\n    </div>',
  '      </div>\n      <HelpModal />\n    </div>'
);

fs.writeFileSync(path, content);
console.log('Added HelpModal to App.tsx');
