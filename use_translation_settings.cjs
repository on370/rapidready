const fs = require('fs');
let path = 'src/components/views/SettingsView.tsx';
let content = fs.readFileSync(path, 'utf8');

const importStr = `import { useTranslation } from "react-i18next";\nimport { Settings, Folder, Plus, Zap, Globe } from "lucide-react";\nimport { useState } from "react";\nimport { useLibraryStore } from "../../stores/libraryStore";`;

content = content.replace(/import \{ Settings.*/, importStr);
content = content.replace(/import \{ useState \} from "react";\nimport \{ useLibraryStore \} from "\.\.\/\.\.\/stores\/libraryStore";\n/, '');

const oldFunc = `export function SettingsView() {
  const { invertScrollZoom, setInvertScrollZoom } = useLibraryStore();`;
const newFunc = `export function SettingsView() {
  const { t, i18n } = useTranslation('settings');
  const { invertScrollZoom, setInvertScrollZoom } = useLibraryStore();`;

content = content.replace(oldFunc, newFunc);

// Now I will run a huge regex/replace to swap texts, but it's easier to rewrite SettingsView.tsx completely with translations since I know its exact structure.
const newContent = `import { useTranslation } from "react-i18next";
import { Settings, Folder, Plus, Zap, Globe } from "lucide-react";
import { useState } from "react";
import { useLibraryStore } from "../../stores/libraryStore";

export function SettingsView() {
  const { t, i18n } = useTranslation('settings');
  const { invertScrollZoom, setInvertScrollZoom } = useLibraryStore();
  const [autoDetect, setAutoDetect] = useState(true);
  const [verifyCopy, setVerifyCopy] = useState(true);
  const [deleteSource, setDeleteSource] = useState(false);
  const [launchSystem, setLaunchSystem] = useState(false);
  const [openRapidRaw, setOpenRapidRaw] = useState(true);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-app-card border border-app-border flex items-center justify-center">
              <Settings className="w-6 h-6 text-txt-secondary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-txt-primary">{t('title')}</h2>
              <p className="text-sm text-txt-secondary">{t('subtitle')}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-app-card border border-app-border rounded-lg px-3 py-1.5">
            <Globe className="w-4 h-4 text-txt-tertiary" />
            <select 
              className="bg-transparent text-sm text-txt-primary focus:outline-none cursor-pointer"
              value={i18n.language.startsWith('de') ? 'de' : 'en'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
        </div>

        {/* Archives Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">{t('archives.title')}</h3>
          </div>
          <div className="divide-y divide-app-border">
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0" title="OK"></span>
              <Folder className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
              <span className="text-sm text-txt-primary flex-1 truncate">/Volumes/Photos/Archiv</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">Default</span>
              <button className="text-xs text-txt-tertiary hover:text-danger transition-colors">Remove</button>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-app-border">
            <button className="flex items-center gap-2 text-xs text-txt-tertiary hover:text-accent transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t('archives.add')}
            </button>
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">{t('general.title')}</h3>
          </div>
          <div className="divide-y divide-app-border">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.autoDetect.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.autoDetect.desc')}</p>
              </div>
              <div className={\`toggle-track \${autoDetect ? 'on' : ''}\`} onClick={() => setAutoDetect(!autoDetect)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.verifyCopy.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.verifyCopy.desc')}</p>
              </div>
              <div className={\`toggle-track \${verifyCopy ? 'on' : ''}\`} onClick={() => setVerifyCopy(!verifyCopy)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.deleteSource.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.deleteSource.desc')}</p>
              </div>
              <div className={\`toggle-track \${deleteSource ? 'on' : ''}\`} onClick={() => setDeleteSource(!deleteSource)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.launchSystem.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.launchSystem.desc')}</p>
              </div>
              <div className={\`toggle-track \${launchSystem ? 'on' : ''}\`} onClick={() => setLaunchSystem(!launchSystem)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.invertScrollZoom.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.invertScrollZoom.desc')}</p>
              </div>
              <div className={\`toggle-track \${invertScrollZoom ? 'on' : ''}\`} onClick={() => setInvertScrollZoom(!invertScrollZoom)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>

        {/* RapidRaw Integration */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">{t('rapidraw.title')}</h3>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-txt-primary">{t('rapidraw.openAfterImport.title')}</p>
              <p className="text-xs text-txt-tertiary">{t('rapidraw.openAfterImport.desc')}</p>
            </div>
            <div className={\`toggle-track \${openRapidRaw ? 'on' : ''}\`} onClick={() => setOpenRapidRaw(!openRapidRaw)}>
              <div className="toggle-knob"></div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="bg-app-card border border-app-border rounded-xl p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-app-deepest" />
            </div>
            <h3 className="text-lg font-bold text-txt-primary">RapidReady</h3>
            <p className="text-xs text-txt-secondary mt-1">Version 0.1.0-alpha (Build 20250726)</p>
            <p className="text-xs text-txt-tertiary mt-2">{t('about.subtitle')}</p>
            <p className="text-xs text-txt-tertiary mt-0.5">{t('about.license')} · © 2025</p>
            <div className="flex items-center gap-4 mt-4">
              <button className="text-xs text-accent hover:text-accent-hover transition-colors">{t('about.repo')}</button>
              <span className="text-txt-tertiary">·</span>
              <button className="text-xs text-accent hover:text-accent-hover transition-colors">{t('about.author')}</button>
              <span className="text-txt-tertiary">·</span>
              <button className="text-xs text-accent hover:text-accent-hover transition-colors">{t('about.report')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}`;

fs.writeFileSync(path, newContent);
console.log('Rewrote SettingsView.tsx with translations and language switcher');
