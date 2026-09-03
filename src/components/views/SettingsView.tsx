import { useTranslation } from "react-i18next";
import { Settings, Folder, Plus, Globe, Settings2, Trash2, Edit2, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../stores/settingsStore";
import { useLibraryStore } from "../../stores/libraryStore";


function EditableItem({ 
  icon: Icon, 
  name, 
  subtitle, 
  onSave, 
  onRemove 
}: { 
  icon: any, 
  name: string, 
  subtitle: string, 
  onSave: (val: string) => void, 
  onRemove: () => void 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (val.trim()) {
      onSave(val.trim());
    } else {
      setVal(name);
    }
    setIsEditing(false);
  };

  return (
    <div className="px-5 py-3 flex items-center gap-3 hover:bg-app-hover transition-colors group">
      <Icon className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col">
        {isEditing ? (
          <input 
            ref={inputRef}
            type="text" 
            value={val} 
            onChange={e => setVal(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if(e.key === 'Enter') handleSave(); if(e.key === 'Escape') { setVal(name); setIsEditing(false); } }}
            className="bg-app-deepest border border-app-border rounded px-1.5 py-0.5 text-sm text-txt-primary focus:outline-none focus:border-accent"
          />
        ) : (
          <span className="text-sm font-medium text-txt-primary block truncate">{name}</span>
        )}
        <span className="text-xs text-txt-tertiary block truncate mt-0.5">{subtitle}</span>
      </div>
      
      {!isEditing && (
        <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-border/50 opacity-0 group-hover:opacity-100 transition-all">
          <Edit2 className="w-4 h-4" />
        </button>
      )}
      {isEditing && (
        <button onClick={handleSave} className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-all">
          <Check className="w-4 h-4" />
        </button>
      )}
      
      <button onClick={onRemove} className="p-1.5 rounded-lg text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export function SettingsView() {
  const { t, i18n } = useTranslation('settings');
  const { invertScrollZoom, setInvertScrollZoom } = useLibraryStore();
  const {
    autoDetect, setAutoDetect,
    verifyCopy, setVerifyCopy,
    deleteSource, setDeleteSource,
    launchSystem, setLaunchSystem,
    openRapidRaw, setOpenRapidRaw,
    startupView, setStartupView,
    locations, addLocation, removeLocation, updateLocation,
    presets, addPreset, removePreset, updatePreset
  } = useSettingsStore();

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

        {/* Archive Locations Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">{t('locations.title')}</h3>
            <p className="text-xs text-txt-secondary mt-0.5">{t('locations.subtitle')}</p>
          </div>
          <div className="divide-y divide-app-border">
            {locations.length === 0 ? (
              <div className="px-5 py-4 text-sm text-txt-tertiary text-center">{t('locations.noLocations')}</div>
            ) : (
              locations.map((loc) => (
                <EditableItem 
                  key={loc.id}
                  icon={Folder}
                  name={loc.name}
                  subtitle={loc.path}
                  onSave={(newName) => updateLocation(loc.id, newName)}
                  onRemove={() => removeLocation(loc.id)}
                />
              ))
            )}
          </div>
          <div className="px-5 py-3 border-t border-app-border">
            <button 
              onClick={async () => {
                const selected = await open({ directory: true });
                if (selected && typeof selected === 'string') {
                  const defaultName = selected.split('/').pop() || selected;
                  addLocation({ id: Date.now().toString(), name: defaultName, path: selected });
                }
              }}
              className="flex items-center gap-2 text-xs font-semibold text-txt-secondary hover:text-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('locations.add')}
            </button>
          </div>
        </div>

        {/* Import Presets Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border">
            <h3 className="text-sm font-semibold text-txt-primary">{t('presets.title')}</h3>
            <p className="text-xs text-txt-secondary mt-0.5">{t('presets.subtitle')}</p>
          </div>
          <div className="divide-y divide-app-border">
            {presets.length === 0 ? (
              <div className="px-5 py-4 text-sm text-txt-tertiary text-center">{t('presets.noPresets')}</div>
            ) : (
              presets.map((preset) => (
                <EditableItem 
                  key={preset.id}
                  icon={Settings2}
                  name={preset.name}
                  subtitle={`Mode: ${preset.structureMode}`}
                  onSave={(newName) => updatePreset(preset.id, { name: newName })}
                  onRemove={() => removePreset(preset.id)}
                />
              ))
            )}
          </div>
          <div className="px-5 py-3 border-t border-app-border">
            <button 
              onClick={() => {
                addPreset({ 
                  id: Date.now().toString(), 
                  name: "New Workflow", 
                  locationId: null,
                  structureMode: 'date',
                  dateFormat: 'YYYY/YYYY-MM-DD',
                  customPattern: '{year}/{year}-{month}-{day}',
                  projectName: '',
                });
              }}
              className="flex items-center gap-2 text-xs font-semibold text-txt-secondary hover:text-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('presets.add')}
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
              <div className={`toggle-track ${autoDetect ? 'on' : ''}`} onClick={() => setAutoDetect(!autoDetect)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.verifyCopy.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.verifyCopy.desc')}</p>
              </div>
              <div className={`toggle-track ${verifyCopy ? 'on' : ''}`} onClick={() => setVerifyCopy(!verifyCopy)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.deleteSource.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.deleteSource.desc')}</p>
              </div>
              <div className={`toggle-track ${deleteSource ? 'on' : ''}`} onClick={() => setDeleteSource(!deleteSource)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.startupView.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.startupView.desc')}</p>
              </div>
              <div className={`toggle-track ${startupView === 'library' ? 'on' : ''}`} onClick={() => setStartupView(startupView === 'library' ? 'import' : 'library')}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.launchSystem.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.launchSystem.desc')}</p>
              </div>
              <div className={`toggle-track ${launchSystem ? 'on' : ''}`} onClick={() => setLaunchSystem(!launchSystem)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.invertScrollZoom.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.invertScrollZoom.desc')}</p>
              </div>
              <div className={`toggle-track ${invertScrollZoom ? 'on' : ''}`} onClick={() => setInvertScrollZoom(!invertScrollZoom)}>
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
            <div className={`toggle-track ${openRapidRaw ? 'on' : ''}`} onClick={() => setOpenRapidRaw(!openRapidRaw)}>
              <div className="toggle-knob"></div>
            </div>
          </div>
        </div>

        </div>
    </div>
  );
}