import { useTranslation } from "react-i18next";
import { Settings, Folder, Plus, Globe, Settings2, Trash2, Edit2, Check, MapPin, Sparkles, RefreshCw, ArrowUpRight, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettingsStore } from "../../stores/settingsStore";
import { useLibraryUIStore } from "../../stores/libraryUIStore";
import { useUpdateStore } from "../../stores/updateStore";
import { isCurrentBeta } from "../../services/updateService";
import buildInfo from "../../build-info.json";


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
  const { invertScrollZoom, setInvertScrollZoom } = useLibraryUIStore();
  const {
    /* Unconnected/dummy toggles hidden for MVP:
    autoDetect, setAutoDetect,
    verifyCopy, setVerifyCopy,
    deleteSource, setDeleteSource,
    launchSystem, setLaunchSystem,
    */
    openRapidRaw, setOpenRapidRaw,
    startupView, setStartupView,
    gpsMapProvider, setGpsMapProvider,
    checkForUpdates, setCheckForUpdates,
    includeBetaUpdates, setIncludeBetaUpdates,
    locations, addLocation, removeLocation, updateLocation,
    presets, addPreset, removePreset, updatePreset
  } = useSettingsStore();
  const { isChecking, lastCheckResult, checkNow } = useUpdateStore();

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
          
          <div className="relative flex items-center gap-2 bg-app-card border border-app-border rounded-lg px-3 py-1.5 hover:border-app-border-hover transition-colors">
            <Globe className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
            <select 
              className="bg-app-card text-sm text-txt-primary focus:outline-none cursor-pointer appearance-none pr-6 font-medium"
              style={{ colorScheme: 'dark' }}
              value={i18n.language.startsWith('de') ? 'de' : 'en'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="en" className="bg-[#1c1c21] text-[#e8e8ec]" style={{ backgroundColor: '#1c1c21', color: '#e8e8ec' }}>English</option>
              <option value="de" className="bg-[#1c1c21] text-[#e8e8ec]" style={{ backgroundColor: '#1c1c21', color: '#e8e8ec' }}>Deutsch</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary absolute right-2.5 pointer-events-none" />
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
                  dateFormat: '{year}/{year}-{month}-{day}',
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
            {/* Hidden for MVP: autoDetect, verifyCopy, deleteSource
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
            */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.startupView.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.startupView.desc')}</p>
              </div>
              <div className={`toggle-track ${startupView === 'import' ? 'on' : ''}`} onClick={() => setStartupView(startupView === 'import' ? 'library' : 'import')}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            {/* Hidden for MVP: launchSystem
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('general.launchSystem.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('general.launchSystem.desc')}</p>
              </div>
              <div className={`toggle-track ${launchSystem ? 'on' : ''}`} onClick={() => setLaunchSystem(!launchSystem)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
            */}
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

        {/* View GPS Location in */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                <MapPin className="w-4 h-4 text-txt-secondary" />
                {t('gps.title')}
              </h3>
              <p className="text-xs text-txt-secondary mt-0.5">{t('gps.subtitle')}</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group select-none">
              <input
                type="radio"
                name="gpsMapProvider"
                value="google"
                checked={gpsMapProvider === 'google'}
                onChange={() => setGpsMapProvider('google')}
                className="w-4 h-4 text-accent border-app-border focus:ring-accent focus:ring-offset-0 bg-transparent cursor-pointer accent-accent"
              />
              <span className="text-sm text-txt-primary group-hover:text-accent transition-colors font-medium">
                {t('gps.googleMaps')}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group select-none">
              <input
                type="radio"
                name="gpsMapProvider"
                value="osm"
                checked={gpsMapProvider === 'osm'}
                onChange={() => setGpsMapProvider('osm')}
                className="w-4 h-4 text-accent border-app-border focus:ring-accent focus:ring-offset-0 bg-transparent cursor-pointer accent-accent"
              />
              <span className="text-sm text-txt-primary group-hover:text-accent transition-colors font-medium">
                {t('gps.openStreetMap')}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-not-allowed opacity-40 select-none">
              <input
                type="radio"
                name="gpsMapProvider"
                value="internal"
                disabled
                className="w-4 h-4 text-accent border-app-border bg-transparent cursor-not-allowed"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-txt-tertiary">
                  {t('gps.internalViewer')}
                </span>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-txt-tertiary border border-app-border px-1.5 py-0.2 rounded">
                  {t('gps.comingSoon')}
                </span>
              </div>
            </label>
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

        {/* Software Updates Section */}
        <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-app-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-txt-secondary" />
              <div>
                <h3 className="text-sm font-semibold text-txt-primary">{t('updates.title')}</h3>
                <p className="text-xs text-txt-secondary mt-0.5">{t('updates.subtitle')}</p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-txt-tertiary bg-app-deepest px-2 py-0.5 rounded border border-app-border">
              v{buildInfo.version} (Build {buildInfo.buildNumber})
            </span>
          </div>

          <div className="divide-y divide-app-border">
            {/* Switch 1: Automatically check for updates */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-txt-primary">{t('updates.checkAutomatically.title')}</p>
                <p className="text-xs text-txt-tertiary">{t('updates.checkAutomatically.desc')}</p>
              </div>
              <div 
                className={`toggle-track ${checkForUpdates ? 'on' : ''}`} 
                onClick={() => setCheckForUpdates(!checkForUpdates)}
              >
                <div className="toggle-knob"></div>
              </div>
            </div>

            {/* Switch 2: Include beta releases */}
            <div className={`px-5 py-4 flex items-center justify-between transition-opacity ${
              (!checkForUpdates || !isCurrentBeta) ? 'opacity-40 cursor-not-allowed select-none' : ''
            }`}>
              <div>
                <p className="text-sm text-txt-primary">{t('updates.includeBeta.title')}</p>
                <p className="text-xs text-txt-tertiary">
                  {!isCurrentBeta 
                    ? t('updates.includeBeta.onlyBetaNotice') 
                    : t('updates.includeBeta.desc')}
                </p>
              </div>
              <div 
                className={`toggle-track ${(checkForUpdates && isCurrentBeta && includeBetaUpdates) ? 'on' : ''} ${
                  (!checkForUpdates || !isCurrentBeta) ? 'pointer-events-none' : 'cursor-pointer'
                }`} 
                onClick={() => {
                  if (checkForUpdates && isCurrentBeta) {
                    setIncludeBetaUpdates(!includeBetaUpdates);
                  }
                }}
              >
                <div className="toggle-knob"></div>
              </div>
            </div>

            {/* Manual Check Button & Result */}
            <div className="px-5 py-4 flex items-center justify-between bg-app-deepest/30">
              <div className="text-xs">
                {isChecking ? (
                  <span className="text-txt-secondary flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                    {t('updates.checking')}
                  </span>
                ) : lastCheckResult?.hasUpdate && lastCheckResult.latestRelease ? (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('updates.updateAvailable', { tag: lastCheckResult.latestRelease.tag_name })}
                    </span>
                    <button
                      onClick={() => openUrl(lastCheckResult.latestRelease!.html_url)}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-accent text-white hover:bg-accent/90 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>{t('updates.download')}</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                ) : lastCheckResult && !lastCheckResult.hasUpdate && !lastCheckResult.error ? (
                  <span className="text-success flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('updates.upToDate', { version: buildInfo.version })}
                  </span>
                ) : lastCheckResult?.error ? (
                  <span className="text-danger flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('updates.checkError', { error: lastCheckResult.error })}
                  </span>
                ) : (
                  <span className="text-txt-tertiary">
                    {t('updates.currentVersion', { version: buildInfo.version, build: buildInfo.buildNumber })}
                  </span>
                )}
              </div>

              <button
                disabled={isChecking}
                onClick={() => checkNow(true)}
                className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-hover text-xs font-medium text-txt-primary flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{t('updates.checkNow')}</span>
              </button>
            </div>
          </div>
        </div>

        </div>
    </div>
  );
}