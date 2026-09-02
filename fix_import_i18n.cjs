const fs = require('fs');

let pathEN = 'src/locales/en/help.json';
let contentEN = JSON.parse(fs.readFileSync(pathEN, 'utf8'));
contentEN.tooltip.inspector = "Displays metadata and a preview for the file selected in the tree.";
contentEN.tooltip.inspectorTitle = "File Inspector";
fs.writeFileSync(pathEN, JSON.stringify(contentEN, null, 2));

let pathDE = 'src/locales/de/help.json';
let contentDE = JSON.parse(fs.readFileSync(pathDE, 'utf8'));
contentDE.tooltip.inspector = "Zeigt Metadaten und eine Vorschau für die im Baum ausgewählte Datei an.";
contentDE.tooltip.inspectorTitle = "Datei-Inspektor";
fs.writeFileSync(pathDE, JSON.stringify(contentDE, null, 2));

console.log('Added inspector translations');
