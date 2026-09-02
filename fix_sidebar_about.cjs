const fs = require('fs');
let path = 'src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'CircleHelp } from "lucide-react";',
  'CircleHelp, Copyright } from "lucide-react";'
);

const oldHelpButton = `<button
          className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary"
          onClick={() => emit('toggle-help-modal')}
        >
          <CircleHelp className="w-[18px] h-[18px]" />
          <span className="tooltip">Help</span>
        </button>`;

const newButtons = `<button
          className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary"
          onClick={() => window.dispatchEvent(new Event('open-about-modal'))}
        >
          <Copyright className="w-[18px] h-[18px]" />
          <span className="tooltip">About</span>
        </button>
        <button
          className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary"
          onClick={() => emit('toggle-help-modal')}
        >
          <CircleHelp className="w-[18px] h-[18px]" />
          <span className="tooltip">Help</span>
        </button>`;

content = content.replace(oldHelpButton, newButtons);
fs.writeFileSync(path, content);
console.log('Added About button to Sidebar');
