const fs = require('fs');

let pathModal = 'src/components/ui/HelpModal.tsx';
let contentModal = fs.readFileSync(pathModal, 'utf8');

// Fix lucide-react imports
contentModal = contentModal.replace(
  "import { X, Command, Shift, ArrowUp, ArrowDown } from 'lucide-react';",
  "import { X, Command, ArrowBigUp } from 'lucide-react';"
);
contentModal = contentModal.replace(
  "k === 'Shift' ? <Shift className=\"w-3 h-3 inline\" /> : k}",
  "k === 'Shift' ? <ArrowBigUp className=\"w-3 h-3 inline\" /> : k}"
);

fs.writeFileSync(pathModal, contentModal);

let pathApp = 'src/App.tsx';
let contentApp = fs.readFileSync(pathApp, 'utf8');

// I might have replaced the wrong div earlier, let's see.
// The error says "HelpModal is declared but its value is never read."
// Let's manually ensure it's added.
if (!contentApp.includes("<HelpModal />")) {
  contentApp = contentApp.replace('    </div>\n  );\n}\n\nexport default App;', '      <HelpModal />\n    </div>\n  );\n}\n\nexport default App;');
  fs.writeFileSync(pathApp, contentApp);
}

console.log('Fixed HelpModal issues');
