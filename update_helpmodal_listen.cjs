const fs = require('fs');

let path = 'src/components/ui/HelpModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add import
content = content.replace(
  "import { useTranslation } from 'react-i18next';",
  "import { useTranslation } from 'react-i18next';\nimport { listen } from '@tauri-apps/api/event';"
);

// Add listener
const oldListen = `  useEffect(() => {
    // We will add the Tauri listener here when the native menu is configured
    // For now, this placeholder handles frontend-only triggers
  }, []);`;
  
const newListen = `  useEffect(() => {
    const unlisten = listen('toggle-help-modal', () => {
      setIsOpen(prev => !prev);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);`;

content = content.replace(oldListen, newListen);

fs.writeFileSync(path, content);
console.log('Updated HelpModal to listen to Tauri');
