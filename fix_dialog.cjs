const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

if (!centerContent.includes('import { ask } from "@tauri-apps/plugin-dialog"')) {
  centerContent = centerContent.replace(
    'import { invoke } from "@tauri-apps/api/core";',
    'import { invoke } from "@tauri-apps/api/core";\nimport { ask } from "@tauri-apps/plugin-dialog";'
  );
}

const oldConfirm = `if (window.confirm(\`Move \${rejected.length} rejected images to trash?\`)) {
              invoke('delete_files', { paths: rejected.map(i => i.path), toTrash: true }).then(() => {
                const remaining = images.filter(i => i.culling.flag !== -1);
                useLibraryStore.getState().setImages(remaining);
              }).catch(console.error);
            }`;

const newConfirm = `ask(\`Move \${rejected.length} rejected images to the OS Trash?\`, {
              title: 'Confirm Delete',
              kind: 'warning',
              okLabel: 'Move to Trash',
              cancelLabel: 'Cancel'
            }).then(confirmed => {
              if (confirmed) {
                invoke('delete_files', { paths: rejected.map(i => i.path), to_trash: true }).then(() => {
                  const remaining = images.filter(i => i.culling.flag !== -1);
                  useLibraryStore.getState().setImages(remaining);
                }).catch(err => {
                  console.error(err);
                  alert('Failed to move to trash: ' + err);
                });
              }
            });`;

// Wait, the onClick was synchronous. ask() returns a promise.
const oldOnClick = `onClick={() => {
            const rejected = displayedImages.filter(i => i.culling.flag === -1);
            if (rejected.length === 0) return;
            if (window.confirm(\`Move \${rejected.length} rejected images to trash?\`)) {
              invoke('delete_files', { paths: rejected.map(i => i.path), toTrash: true }).then(() => {
                const remaining = images.filter(i => i.culling.flag !== -1);
                useLibraryStore.getState().setImages(remaining);
              }).catch(console.error);
            }
          }}`;

const newOnClick = `onClick={() => {
            const rejected = displayedImages.filter(i => i.culling.flag === -1);
            if (rejected.length === 0) return;
            ask(\`Move \${rejected.length} rejected images to the OS Trash?\`, {
              title: 'Confirm Delete',
              kind: 'warning',
              okLabel: 'Move to Trash',
              cancelLabel: 'Cancel' // Default is Cancel, so safe!
            }).then(confirmed => {
              if (confirmed) {
                invoke('delete_files', { paths: rejected.map(i => i.path), to_trash: true }).then(() => {
                  const remaining = images.filter(i => i.culling.flag !== -1);
                  useLibraryStore.getState().setImages(remaining);
                }).catch(err => {
                  console.error(err);
                  alert('Failed to move to trash: ' + err);
                });
              }
            });
          }}`;

centerContent = centerContent.replace(oldOnClick, newOnClick);
fs.writeFileSync(centerPath, centerContent);
console.log('Fixed Frontend Dialog');
