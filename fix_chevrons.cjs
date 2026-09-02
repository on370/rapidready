const fs = require('fs');
let sidebarPath = 'src/components/views/library/LibraryLeftSidebar.tsx';
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

sidebarContent = sidebarContent.replace(
  '<ChevronDown className="w-3.5 h-3.5 text-txt-tertiary section-chevron" />',
  '<ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform ${!collectionsOpen ? "-rotate-90" : ""}`} />'
);

sidebarContent = sidebarContent.replace(
  '<ChevronDown className="w-3.5 h-3.5 text-txt-tertiary section-chevron" />',
  '<ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform ${!libraryOpen ? "-rotate-90" : ""}`} />'
);

fs.writeFileSync(sidebarPath, sidebarContent);
console.log('Fixed chevrons');
