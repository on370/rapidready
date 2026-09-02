const fs = require('fs');
let path = 'src/components/views/SettingsView.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '<div className="toggle-knob"></div>\n              </div>\n              <div className="px-5 py-4 flex items-center justify-between">',
  '<div className="toggle-knob"></div>\n              </div>\n            </div>\n            <div className="px-5 py-4 flex items-center justify-between">'
);

fs.writeFileSync(path, content);
