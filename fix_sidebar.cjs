const fs = require('fs');

let path = 'src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add CircleHelp
content = content.replace(
  'import { Download, LayoutGrid, ShieldCheck, Clock, Settings } from "lucide-react";',
  'import { Download, LayoutGrid, ShieldCheck, Clock, Settings, CircleHelp } from "lucide-react";\nimport { emit } from "@tauri-apps/api/event";'
);

// Add the button above settings
const oldSettings = '{/* Bottom: Settings */}\n      <NavButton view="settings" icon={Settings} label="Settings" />';
const newSettings = `<div className="flex flex-col gap-1">
        <button
          className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary"
          onClick={() => emit('toggle-help-modal')}
        >
          <CircleHelp className="w-[18px] h-[18px]" />
          <span className="tooltip">Help</span>
        </button>
        {/* Bottom: Settings */}
        <NavButton view="settings" icon={Settings} label="Settings" />
      </div>`;

content = content.replace(oldSettings, newSettings);

fs.writeFileSync(path, content);
console.log('Fixed Sidebar with Help icon');
