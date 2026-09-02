const fs = require('fs');
let path = 'src/components/views/library/LibraryLeftSidebar.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldRender = `  if (!node.isDir) {
    return (
      <div 
        className={\`flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left hover:bg-app-hover\`}
        style={{ paddingLeft: \`\${depth * 12 + 8}px\` }}`;

const newRender = `  if (!node.isDir) {
    const isActiveImage = images[activeImageIndex]?.path === node.image?.path;
    return (
      <div 
        className={\`flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left \${isActiveImage ? 'bg-accent/20 text-accent font-medium' : 'hover:bg-app-hover text-txt-secondary'}\`}
        style={{ paddingLeft: \`\${depth * 12 + 8}px\` }}`;

content = content.replace(oldRender, newRender);

// Also need to scroll the active item into view. It's best done with a simple ref + useEffect, 
// but since the tree can be long, auto-scrolling on every arrow press might be annoying if they're browsing Grid.
// For now, the user just requested it to be selected/highlighted. We can add a ref later if requested.

fs.writeFileSync(path, content);
console.log('Fixed tree selection sync');
