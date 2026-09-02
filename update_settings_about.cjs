const fs = require('fs');

let path = 'src/components/views/SettingsView.tsx';
let content = fs.readFileSync(path, 'utf8');

// Remove the About Section entirely
const aboutStart = '{/* About Section */}';
const aboutEnd = '</div>\n    </div>\n  );\n}';

const startIndex = content.indexOf(aboutStart);
const endIndex = content.indexOf(aboutEnd);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + '</div>\n    </div>\n  );\n}';
  fs.writeFileSync(path, content);
  console.log('Removed About from Settings');
} else {
  console.log('Could not find About section');
}
