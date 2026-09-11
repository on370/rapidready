import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronDown, Trash2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImportStore } from '../../../../stores/importStore';
import { useSettingsStore, ImportPreset } from '../../../../stores/settingsStore';

export const ImportProfileHeader = React.memo(function ImportProfileHeader() {
  const { t } = useTranslation('import');

  const {
    activePresetId,
    setActivePreset,
    applyPreset,
    isPresetModified,
    setPresetModified,
    structureMode,
    dateFormat,
    customPattern,
    projectName,
    destinationDirectory,
    selectedLocationId,
  } = useImportStore();

  const {
    presets,
    addPreset,
    updatePreset,
    removePreset,
    locations,
  } = useSettingsStore();

  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setIsPresetDropdownOpen(false);
        setIsCreatingPreset(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activePreset = presets.find((p) => p.id === activePresetId);

  const handleSelectPreset = (preset: ImportPreset) => {
    let resolvedPath: string | null = null;
    let resolvedLocId: string | null = null;

    if (preset.locationId) {
      const loc = locations.find((l) => l.id === preset.locationId);
      if (loc) {
        resolvedPath = loc.path;
        resolvedLocId = loc.id;
      } else if (preset.destinationPath) {
        resolvedPath = preset.destinationPath;
        resolvedLocId = null;
      }
    } else if (preset.destinationPath) {
      resolvedPath = preset.destinationPath;
      resolvedLocId = null;
    }

    applyPreset(preset, resolvedPath, resolvedLocId);
    setIsPresetDropdownOpen(false);
    setIsCreatingPreset(false);
    setNewPresetName('');
  };

  const handleRemovePreset = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removePreset(presetId);
    if (activePresetId === presetId) {
      const remaining = presets.filter((p) => p.id !== presetId);
      const fallback = remaining.find((p) => p.id === 'default-std') || remaining[0];
      if (fallback) {
        handleSelectPreset(fallback);
      }
    }
  };

  const handleSavePresetChanges = () => {
    if (!activePresetId) return;
    updatePreset(activePresetId, {
      structureMode,
      dateFormat,
      customPattern,
      projectName,
      destinationPath: destinationDirectory,
      locationId: selectedLocationId,
    });
    setPresetModified(false);
  };

  const handleCreateNewPreset = () => {
    if (!newPresetName.trim()) return;
    const newId = 'preset-' + Date.now();
    const newP: ImportPreset = {
      id: newId,
      name: newPresetName.trim(),
      locationId: selectedLocationId,
      destinationPath: destinationDirectory,
      structureMode,
      dateFormat,
      customPattern,
      projectName,
    };
    addPreset(newP);
    setActivePreset(newId, false);
    setIsCreatingPreset(false);
    setNewPresetName('');
    setIsPresetDropdownOpen(false);
  };

  return (
    <div className="relative" ref={presetDropdownRef}>
      <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
        <label className="block text-xs font-medium text-txt-tertiary">{t('destination.profile')}</label>
        {isCreatingPreset && !isPresetDropdownOpen ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input 
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder={t('destination.newProfilePlaceholder', 'Profilname...')}
              autoFocus
              onKeyDown={(e) => { 
                if (e.key === 'Enter') handleCreateNewPreset(); 
                if (e.key === 'Escape') { 
                  setIsCreatingPreset(false); 
                  setNewPresetName(''); 
                } 
              }}
              className="bg-app-deepest border border-accent rounded px-2 py-0.5 text-xs text-txt-primary outline-none focus:ring-1 focus:ring-accent w-36 placeholder:text-txt-tertiary"
            />
            <button 
              onClick={handleCreateNewPreset}
              disabled={!newPresetName.trim()}
              className="text-[10px] px-2 py-0.5 bg-accent hover:bg-accent-hover text-app-deepest font-semibold rounded transition-colors disabled:opacity-40 cursor-pointer"
            >
              {t('destination.saveProfile')}
            </button>
            <button 
              onClick={() => { setIsCreatingPreset(false); setNewPresetName(''); }}
              className="text-[10px] px-1.5 py-0.5 text-txt-tertiary hover:text-txt-primary rounded transition-colors cursor-pointer"
              title="Cancel"
            >
              ✕
            </button>
          </div>
        ) : isPresetModified ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-accent font-medium">{t('destination.profileModified')}</span>
            {activePresetId && activePreset && (
              <button 
                onClick={handleSavePresetChanges}
                className="text-[10px] px-2 py-0.5 bg-accent/15 text-accent hover:bg-accent/25 rounded font-medium transition-colors cursor-pointer"
              >
                {t('destination.saveProfile')}
              </button>
            )}
            <button 
              onClick={() => {
                setIsPresetDropdownOpen(false);
                setIsCreatingPreset(true);
              }}
              className="text-[10px] px-2 py-0.5 bg-app-card border border-app-border hover:border-accent text-txt-secondary hover:text-txt-primary rounded transition-colors cursor-pointer"
            >
              {t('destination.saveAsNewProfile')}
            </button>
          </div>
        ) : null}
      </div>

      <div 
        onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-app-card border border-app-border hover:border-app-border-hover rounded-lg transition-colors cursor-pointer text-xs text-txt-primary"
      >
        <div className="flex items-center gap-2 truncate">
          <SlidersHorizontal className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="truncate font-medium">{activePreset?.name || 'Custom'}</span>
          {isPresetModified && <span className="text-accent text-[10px]">*</span>}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
      </div>

      {/* Preset Dropdown Menu */}
      {isPresetDropdownOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-app-card border border-app-border rounded-lg shadow-2xl z-50 overflow-hidden text-xs py-1">
          <div className="max-h-48 overflow-y-auto divide-y divide-app-border/40">
            {presets.map((preset) => (
              <div 
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="flex items-center justify-between px-3 py-2 hover:bg-app-hover cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <SlidersHorizontal className={`w-3.5 h-3.5 ${preset.id === activePresetId ? 'text-accent' : 'text-txt-tertiary'}`} />
                  <span className={`truncate ${preset.id === activePresetId ? 'text-accent font-medium' : 'text-txt-primary'}`}>
                    {preset.name}
                  </span>
                </div>
                {preset.id !== 'default-std' && (
                  <button 
                    onClick={(e) => handleRemovePreset(preset.id, e)}
                    className="p-1 rounded text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-app-border p-2 bg-app-panel/30">
            {isCreatingPreset ? (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <input 
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder={t('destination.newProfilePlaceholder', 'Profilname...')}
                  autoFocus
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') handleCreateNewPreset(); 
                    if (e.key === 'Escape') {
                      setIsCreatingPreset(false);
                      setNewPresetName('');
                    }
                  }}
                  className="flex-1 bg-app-deepest border border-accent rounded px-2 py-1 text-xs text-txt-primary outline-none focus:ring-1 focus:ring-accent placeholder:text-txt-tertiary"
                />
                <button 
                  onClick={handleCreateNewPreset}
                  disabled={!newPresetName.trim()}
                  className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-app-deepest font-semibold text-xs rounded transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {t('destination.saveProfile')}
                </button>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setIsCreatingPreset(false); 
                    setNewPresetName(''); 
                  }}
                  className="px-1.5 py-1 text-txt-tertiary hover:text-txt-primary text-xs rounded transition-colors cursor-pointer"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsCreatingPreset(true); }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-txt-secondary hover:text-accent transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('destination.saveAsNewProfile')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
