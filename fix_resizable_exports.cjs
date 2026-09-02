const fs = require('fs');

let viewPath = 'src/components/views/LibraryView.tsx';
let viewContent = fs.readFileSync(viewPath, 'utf8');

viewContent = viewContent.replace(
  'import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";',
  'import { Group, Panel, Separator } from "react-resizable-panels";'
);

viewContent = viewContent.replace(/<PanelGroup/g, '<Group');
viewContent = viewContent.replace(/<\/PanelGroup>/g, '</Group>');
viewContent = viewContent.replace(/direction="horizontal"/g, 'orientation="horizontal"');

viewContent = viewContent.replace(/<PanelResizeHandle/g, '<Separator');
viewContent = viewContent.replace(/<\/PanelResizeHandle>/g, '</Separator>');

fs.writeFileSync(viewPath, viewContent);
console.log('Fixed resizable exports');
