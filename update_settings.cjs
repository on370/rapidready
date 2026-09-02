const fs = require('fs');

let path = 'src/components/views/SettingsView.tsx';
let content = fs.readFileSync(path, 'utf8');

const importRegex = /import \{ useState \} from "react";/g;
content = content.replace(importRegex, 'import { useState } from "react";\nimport { useLibraryStore } from "../../stores/libraryStore";');

const oldState = `const [openRapidRaw, setOpenRapidRaw] = useState(true);`;
const newState = `const [openRapidRaw, setOpenRapidRaw] = useState(true);
  const { invertScrollZoom, setInvertScrollZoom } = useLibraryStore();`;
content = content.replace(oldState, newState);

const oldGenSectionEnd = `</div>
          </div>
        </div>`;
const newGenSectionEnd = `  <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">Invert scroll wheel for zoom</p>
                <p className="text-xs text-txt-tertiary">Reverse the direction of the scroll wheel when zooming in Loupe view</p>
              </div>
              <div className={\`toggle-track \${invertScrollZoom ? 'on' : ''}\`} onClick={() => setInvertScrollZoom(!invertScrollZoom)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>`;
content = content.replace(oldGenSectionEnd, newGenSectionEnd);

fs.writeFileSync(path, content);
console.log('Updated SettingsView.tsx');
