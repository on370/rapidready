const fs = require('fs');

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
sidebarContent = sidebarContent.replace(
  'className="w-[250px] flex-shrink-0 border-r border-app-border bg-app-panel flex flex-col min-h-0 overflow-hidden"',
  'className="w-full h-full bg-app-panel flex flex-col min-h-0 overflow-hidden"'
);
fs.writeFileSync(sidebarPath, sidebarContent);

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');
centerContent = centerContent.replace(
  'className="flex-1 flex flex-col min-w-0 bg-app-bg"',
  'className="w-full h-full flex flex-col min-w-0 bg-app-bg"'
);
fs.writeFileSync(centerPath, centerContent);

let inspectorPath = 'src/components/views/library/LibraryInspector.tsx';
let inspectorContent = fs.readFileSync(inspectorPath, 'utf8');
inspectorContent = inspectorContent.replace(
  'className="w-80 flex-shrink-0 border-l border-app-border bg-app-panel flex flex-col overflow-y-auto"',
  'className="w-full h-full bg-app-panel flex flex-col min-h-0 overflow-y-auto"'
);
fs.writeFileSync(inspectorPath, inspectorContent);

console.log('Fixed panel widths');
