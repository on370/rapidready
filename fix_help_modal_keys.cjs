const fs = require('fs');
let path = 'src/components/ui/HelpModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update JS logic
content = content.replace(
  "if ((e.metaKey && e.key === '?') || e.key === 'F1') {",
  "if ((e.metaKey && e.key === '/') || e.key === 'F1') {"
);

// Update UI text
content = content.replace(
  "<ShortcutRow description=\"Show this Help\" keys={['Cmd', '?']} />",
  "<ShortcutRow description=\"Show this Help\" keys={['Cmd', '/']} />"
);

fs.writeFileSync(path, content);
console.log('Fixed HelpModal keys');
