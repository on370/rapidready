const fs = require('fs');

let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

sidebarContent = sidebarContent.replace(
  '<div className="section-body" style={{ maxHeight: \'800px\' }}>',
  '<div className={`section-body ${!libraryOpen ? "hidden" : ""}`}>'
);
sidebarContent = sidebarContent.replace(
  '<div className="section-body p-2 space-y-0.5" style={{ maxHeight: \'500px\' }}>',
  '<div className={`section-body p-2 space-y-0.5 ${!collectionsOpen ? "hidden" : ""}`}>'
);

sidebarContent = sidebarContent.replace(
  '<div className={`section-collapsible ${!collectionsOpen ? \'collapsed\' : \'\'}`}>',
  '<div className="flex flex-col flex-shrink-0">'
);
sidebarContent = sidebarContent.replace(
  '<div className={`section-collapsible ${!libraryOpen ? \'collapsed\' : \'\'}`}>',
  '<div className="flex flex-col">'
);

fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Fixed tree clipping');
