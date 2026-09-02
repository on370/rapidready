const fs = require('fs');

let shellPath = 'src/components/layout/AppShell.tsx';
let shellContent = fs.readFileSync(shellPath, 'utf8');

shellContent = shellContent.replace(
  '<TitleBar />',
  '<TitleBar activeView={activeView} />'
);
fs.writeFileSync(shellPath, shellContent);

let titlePath = 'src/components/layout/TitleBar.tsx';
let titleContent = fs.readFileSync(titlePath, 'utf8');

titleContent = titleContent.replace(
  'export function TitleBar() {',
  `import { ViewType } from "./Sidebar";
export function TitleBar({ activeView }: { activeView?: ViewType }) {
  const titles = {
    import: "Media Importer",
    library: "Library & Culling",
    health: "Archive Health",
    history: "Import History",
    settings: "Settings"
  };
  const title = activeView ? titles[activeView] : "RapidReady";
`
);

titleContent = titleContent.replace(
  '<div id="view-title" className="text-xs text-txt-tertiary">Media Importer</div>',
  '<div id="view-title" className="text-xs text-txt-tertiary">{title}</div>'
);

fs.writeFileSync(titlePath, titleContent);
console.log('Fixed TitleBar');
