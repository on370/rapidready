import { 
  HardDrive, File, Database, Calendar, CheckCircle2, EyeOff, Sparkles, 
  FolderPlus, FolderInput, FolderOutput, SlidersHorizontal, ChevronDown, 
  Folder, FolderSearch, Plus, Bookmark, BookmarkCheck, Edit2, 
  Trash2, Check, RefreshCw
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import { useImportStore, ScannedFile, DATE_FORMAT_OPTIONS } from '../../../stores/importStore';
import { useSettingsStore, ArchiveLocation, ImportPreset } from '../../../stores/settingsStore';

interface DriveInfo {
  name: string;
  path: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

export function ImportSourceStep() {
  const { t } = useTranslation('import');
  
  const { 
    setSourceDirectory, sourceDirectory,
    scannedFiles, setScannedFiles, isScanning, setIsScanning,
    destinationDirectory, setDestinationDirectory, selectedLocationId,
    structureMode, setStructureMode,
    dateFormat, setDateFormat,
    customPattern, setCustomPattern,
    projectName, setProjectName,
    activePresetId, setActivePreset,
    isPresetModified, setPresetModified,
    hideImported, setHideImported
  } = useImportStore();

  const {
    locations, addLocation, removeLocation, updateLocation,
    recentPaths, addRecentPath,
    presets, addPreset, updatePreset, removePreset
  } = useSettingsStore();

  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState('');

  const destDropdownRef = useRef<HTMLDivElement>(null);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const detectedDrives = await invoke<DriveInfo[]>('get_removable_drives');
        setDrives(detectedDrives);
      } catch (error) {
        console.error("Failed to get drives:", error);
      }
    };
    
    fetchDrives();
    const interval = setInterval(fetchDrives, 2000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (destDropdownRef.current && !destDropdownRef.current.contains(e.target as Node)) {
        setIsDestDropdownOpen(false);
        setEditingLocationId(null);
      }
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setIsPresetDropdownOpen(false);
        setIsCreatingPreset(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });

      if (selectedPath && typeof selectedPath === 'string') {
        setSourceDirectory(selectedPath);
        setIsScanning(true);
        const files: ScannedFile[] = await invoke('scan_source_directory', { path: selectedPath });
        setScannedFiles(files);
      }
    } catch (error) {
      console.error("Failed to select or scan directory:", error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleBrowseDestination = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      if (selectedPath && typeof selectedPath === 'string') {
        setDestinationDirectory(selectedPath, null);
        addRecentPath(selectedPath);
        setIsDestDropdownOpen(false);
      }
    } catch (error) {
      console.error("Failed to select destination:", error);
    }
  };

  const handleAddLocation = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      if (selectedPath && typeof selectedPath === 'string') {
        const folderName = selectedPath.split(/[/\\]/).pop() || selectedPath;
        const newLoc: ArchiveLocation = {
          id: 'loc-' + Date.now(),
          name: folderName,
          path: selectedPath,
        };
        addLocation(newLoc);
        setDestinationDirectory(selectedPath, newLoc.id);
        setIsDestDropdownOpen(false);
      }
    } catch (error) {
      console.error("Failed to add location:", error);
    }
  };

  const handleBookmarkCurrentPath = () => {
    if (!destinationDirectory) return;
    const isAlreadyLocation = locations.some(l => l.path === destinationDirectory);
    if (!isAlreadyLocation) {
      const folderName = destinationDirectory.split(/[/\\]/).pop() || destinationDirectory;
      const newLoc: ArchiveLocation = {
        id: 'loc-' + Date.now(),
        name: folderName,
        path: destinationDirectory,
      };
      addLocation(newLoc);
      setDestinationDirectory(destinationDirectory, newLoc.id);
    }
  };

  const handleSelectPreset = (preset: ImportPreset) => {
    setActivePreset(preset.id, false);
    setStructureMode(preset.structureMode);
    setDateFormat(preset.dateFormat);
    setCustomPattern(preset.customPattern);
    setProjectName(preset.projectName);
    
    if (preset.locationId) {
      const loc = locations.find(l => l.id === preset.locationId);
      if (loc) {
        setDestinationDirectory(loc.path, loc.id);
      }
    } else if (preset.destinationPath) {
      setDestinationDirectory(preset.destinationPath, null);
    }
    setIsPresetDropdownOpen(false);
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

  const newFiles = scannedFiles.filter(f => !f.already_imported);
  const alreadyImportedFiles = scannedFiles.filter(f => f.already_imported);

  // Dynamic preview generator
  const generatePreview = () => {
    if (!destinationDirectory) {
      return (
        <div className="bg-app-deepest border border-app-border rounded-lg p-3 text-xs text-txt-tertiary italic">
          {t('destination.selectDestination')}
        </div>
      );
    }

    const header = (
      <div className="flex items-center gap-2 text-xs text-txt-tertiary border-b border-app-border/40 pb-2 mb-2 min-w-0">
        <span className="text-[10px] font-bold text-txt-tertiary uppercase tracking-wider flex-shrink-0">Basis:</span>
        <span className="font-mono text-txt-secondary truncate" title={destinationDirectory}>{destinationDirectory}/</span>
      </div>
    );

    if (structureMode === 'flat') {
      return (
        <div className="bg-app-deepest border border-app-border rounded-lg p-3">
          {header}
          <div className="flex items-center justify-between text-xs text-txt-tertiary italic font-sans py-0.5">
            <span>{t('destination.modeFlat')}</span>
            <span className="text-txt-tertiary ml-auto text-[11px] not-italic font-mono flex-shrink-0">({newFiles.length} {t('destination.previewFiles')})</span>
          </div>
        </div>
      );
    }

    if (structureMode === 'project') {
      const pName = projectName.trim() || 'Project_Folder';
      return (
        <div className="bg-app-deepest border border-app-border rounded-lg p-3">
          {header}
          <div className="flex items-center gap-2 text-txt-primary font-mono text-xs">
            <Folder className="w-3.5 h-3.5 text-warning/80 flex-shrink-0" />
            <span className="font-semibold text-accent truncate">{pName}/</span>
            <span className="text-txt-tertiary ml-auto text-[11px] font-sans flex-shrink-0">({newFiles.length} {t('destination.previewFiles')})</span>
          </div>
        </div>
      );
    }

    // Date or Custom Token mode
    let datesToUse: Date[] = [];
    if (newFiles.length > 0) {
      const days = new Set<string>();
      for (const f of newFiles) {
        if (f.date) {
          const dStr = f.date.split('T')[0];
          if (!days.has(dStr)) {
            days.add(dStr);
            datesToUse.push(new Date(f.date));
            if (datesToUse.length >= 3) break;
          }
        }
      }
    }
    if (datesToUse.length === 0) datesToUse = [new Date()];

    const pattern = structureMode === 'date' ? dateFormat : customPattern;

    const paths = datesToUse.map(d => {
      let p = pattern || '';
      p = p.replace(/{year}/g, d.getFullYear().toString());
      p = p.replace(/{month}/g, (d.getMonth() + 1).toString().padStart(2, '0'));
      p = p.replace(/{day}/g, d.getDate().toString().padStart(2, '0'));
      p = p.replace(/{camera}/g, "EOS_R5");
      p = p.replace(/{ext}/g, "RAW");
      return p.replace(/\\/g, '/');
    });

    return (
      <div className="bg-app-deepest border border-app-border rounded-lg p-3 font-mono text-xs">
        {header}
        <div className="space-y-1.5">
          {paths.map((sub, idx) => (
            <div key={idx} className="flex items-center gap-2 text-txt-primary">
              <Folder className="w-3.5 h-3.5 text-warning/80 flex-shrink-0" />
              <span className="font-medium truncate">{sub.endsWith('/') ? sub : sub + '/'}</span>
              <span className="text-txt-tertiary ml-auto text-[10px] opacity-70 font-sans flex-shrink-0">~files</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const activePreset = presets.find(p => p.id === activePresetId);
  const activeLocation = locations.find(l => l.id === selectedLocationId || l.path === destinationDirectory);
  const isBookmarked = !!activeLocation;

  return (
    <div className="flex-1 overflow-hidden p-6 flex gap-6">

      {/* Left Panel: Source Selection */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pr-1">
        <div className="flex items-center gap-2 mb-1">
          <FolderInput className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">{t('source.title')}</h2>
        </div>

        {/* Source Cards */}
        {sourceDirectory ? (
          <div className="bg-app-card border border-app-border rounded-xl p-4 hover:border-app-border-hover transition-colors cursor-pointer ring-1 ring-accent/30 shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.1)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-accent/5 rounded-bl-full"></div>
            
            <div className="flex items-start justify-between relative z-10">
              <div className="min-w-0 pr-4 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-semibold text-txt-primary text-base truncate">
                    {sourceDirectory.split(/[/\\]/).pop() || sourceDirectory}
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Folder className="w-3.5 h-3.5 text-txt-tertiary" />
                  <span className="text-sm font-medium text-txt-secondary truncate" title={sourceDirectory}>
                    {sourceDirectory}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-txt-tertiary">
                  <span className="flex items-center gap-1 font-medium text-txt-primary">
                    <File className="w-3 h-3 text-accent" /> 
                    {newFiles.length} {t('source.newFiles')}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3" /> 
                    {(newFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </span>
                </div>
                <div className="text-xs text-txt-tertiary mt-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {newFiles.length > 0
                    ? `${newFiles[0]?.formatted_date?.split(' ')[0] || ''} – ${newFiles[newFiles.length - 1]?.formatted_date?.split(' ')[0] || ''}`
                    : 'No dates found'}
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold uppercase tracking-wide">FOLDER</span>
              </div>
            </div>
          </div>
        ) : (
          drives.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {drives.map((drive, idx) => (
                <div 
                  key={idx}
                  onClick={() => {
                    setSourceDirectory(drive.path);
                    setIsScanning(true);
                    invoke('scan_source_directory', { path: drive.path })
                      .then((files: any) => setScannedFiles(files))
                      .catch(e => console.error(e))
                      .finally(() => setIsScanning(false));
                  }}
                  className="bg-app-card border border-app-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent hover:bg-accent/5 transition-all text-center group ring-1 ring-transparent hover:ring-accent/30"
                >
                  <div className="w-10 h-10 rounded-full bg-app-deepest flex items-center justify-center group-hover:scale-110 transition-transform">
                    <HardDrive className="w-5 h-5 text-txt-secondary group-hover:text-accent transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-txt-primary truncate max-w-[140px]" title={drive.name}>{drive.name || 'SD Card'}</h3>
                    <p className="text-[10px] text-txt-tertiary">{(drive.available_space / (1024*1024*1024)).toFixed(1)} GB free</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-app-card/30 border border-dashed border-app-border rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-80">
              <div className="w-12 h-12 rounded-full bg-app-deepest flex items-center justify-center mb-3 text-txt-tertiary">
                <HardDrive className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="font-semibold text-txt-secondary mb-1">{t('source.waitingForSd')}</h3>
              <p className="text-xs text-txt-tertiary max-w-[200px]">{t('source.waitingForSdDesc')}</p>
            </div>
          )
        )}

        {/* Already Imported Indicator */}
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-4 h-4 ${alreadyImportedFiles.length > 0 ? 'text-success' : 'text-txt-tertiary'}`} />
              <span className="text-sm text-txt-secondary">{t('source.alreadyImported')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-txt-tertiary">{t('source.hideImported')}</span>
              <div className={`toggle-track ${hideImported ? 'on' : ''}`} onClick={() => setHideImported(!hideImported)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-txt-tertiary">
              <EyeOff className="w-3.5 h-3.5" />
              <span className={alreadyImportedFiles.length > 0 ? "font-medium text-txt-secondary" : ""}>
                {alreadyImportedFiles.length} {t('source.alreadyImported')} {hideImported ? `(${t('source.hidden')})` : `(${t('source.shown')})`}
              </span>
            </div>
            <div className="w-px h-4 bg-app-border"></div>
            <div className="flex items-center gap-1.5 text-sm text-txt-tertiary">
              <span className={alreadyImportedFiles.length > 0 ? "text-txt-secondary" : ""}>
                {(alreadyImportedFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-accent">
              {newFiles.length} {t('source.newFiles')}
            </span>
            <span className="text-sm text-txt-tertiary">
              ({(newFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB)
            </span>
          </div>
        </div>

        {/* Or Select Folder */}
        <button 
          onClick={handleSelectFolder}
          disabled={isScanning}
          className="flex items-center justify-center gap-2 py-3 px-4 border border-dashed border-app-border rounded-xl text-sm text-txt-secondary hover:border-accent hover:text-accent transition-all duration-200 hover:bg-accent/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderPlus className="w-4 h-4" />
          <span>{isScanning ? t('source.scanning') : t('source.selectFolder')}</span>
        </button>
      </div>

      {/* Right Panel: Destination & Settings */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pl-1">
        <div className="flex items-center gap-2 mb-1">
          <FolderOutput className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">{t('destination.title')}</h2>
        </div>

        {/* 1. Import Profile Selector */}
        <div className="relative" ref={presetDropdownRef}>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-txt-tertiary">{t('destination.profile')}</label>
            {isPresetModified && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-accent font-medium">{t('destination.profileModified')}</span>
                {activePresetId && (
                  <button 
                    onClick={handleSavePresetChanges}
                    className="text-[10px] px-2 py-0.5 bg-accent/15 text-accent hover:bg-accent/25 rounded font-medium transition-colors"
                  >
                    {t('destination.saveProfile')}
                  </button>
                )}
                <button 
                  onClick={() => setIsCreatingPreset(true)}
                  className="text-[10px] px-2 py-0.5 bg-app-card border border-app-border hover:border-accent text-txt-secondary hover:text-txt-primary rounded transition-colors"
                >
                  {t('destination.saveAsNewProfile')}
                </button>
              </div>
            )}
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
                {presets.map(preset => (
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
                        onClick={(e) => { e.stopPropagation(); removePreset(preset.id); }}
                        className="p-1 rounded text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-app-border p-2 bg-app-panel/30">
                {isCreatingPreset ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input 
                      type="text"
                      value={newPresetName}
                      onChange={e => setNewPresetName(e.target.value)}
                      placeholder={t('destination.saveProfilePrompt')}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateNewPreset(); if (e.key === 'Escape') setIsCreatingPreset(false); }}
                      className="flex-1 bg-app-deepest border border-app-border rounded px-2 py-1 text-xs text-txt-primary outline-none focus:border-accent"
                    />
                    <button 
                      onClick={handleCreateNewPreset}
                      className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-app-deepest font-semibold text-xs rounded transition-colors"
                    >
                      {t('destination.saveProfile')}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsCreatingPreset(true); }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-txt-secondary hover:text-accent transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('destination.saveAsNewProfile')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Unified Destination Selector (In-Place Locations) */}
        <div className="relative" ref={destDropdownRef}>
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5 flex items-center justify-between">
            <span>{t('destination.targetPath')}</span>
            {destinationDirectory && (
              <button 
                onClick={handleBookmarkCurrentPath}
                className={`flex items-center gap-1 text-[11px] transition-colors ${isBookmarked ? 'text-accent' : 'text-txt-tertiary hover:text-accent'}`}
                title={isBookmarked ? t('destination.locationSaved') : t('destination.bookmarkLocation')}
              >
                {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 text-accent" /> : <Bookmark className="w-3.5 h-3.5" />}
                <span>{isBookmarked ? activeLocation?.name : t('destination.bookmarkLocation')}</span>
              </button>
            )}
          </label>

          <div 
            onClick={() => setIsDestDropdownOpen(!isDestDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-app-card border border-app-border hover:border-app-border-hover rounded-lg transition-colors cursor-pointer text-xs text-txt-primary"
          >
            <div className="flex items-center gap-2 truncate min-w-0 pr-2">
              <Folder className="w-4 h-4 text-warning/80 flex-shrink-0" />
              <div className="truncate flex flex-col text-left">
                {activeLocation && (
                  <span className="font-semibold text-txt-primary text-xs truncate">{activeLocation.name}</span>
                )}
                <span className={`truncate text-xs ${activeLocation ? 'text-txt-tertiary text-[11px]' : 'text-txt-primary'}`} title={destinationDirectory || ''}>
                  {destinationDirectory || t('destination.selectDestination')}
                </span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
          </div>

          {/* Destination Dropdown Menu */}
          {isDestDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-app-card border border-app-border rounded-lg shadow-2xl z-50 overflow-hidden text-xs py-1">
              
              {/* Saved Locations */}
              {locations.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-txt-tertiary uppercase tracking-wider bg-app-panel/50">
                    {t('destination.locationsHeader')}
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-app-border/30">
                    {locations.map(loc => (
                      <div 
                        key={loc.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-app-hover cursor-pointer transition-colors group"
                        onClick={() => {
                          setDestinationDirectory(loc.path, loc.id);
                          setIsDestDropdownOpen(false);
                        }}
                      >
                        {editingLocationId === loc.id ? (
                          <div className="flex items-center gap-1.5 flex-1 pr-2" onClick={e => e.stopPropagation()}>
                            <input 
                              type="text" 
                              value={editLocName}
                              onChange={e => setEditLocName(e.target.value)}
                              className="flex-1 bg-app-deepest border border-app-border rounded px-1.5 py-0.5 text-xs text-txt-primary outline-none focus:border-accent"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  if (editLocName.trim()) updateLocation(loc.id, editLocName.trim());
                                  setEditingLocationId(null);
                                }
                                if (e.key === 'Escape') setEditingLocationId(null);
                              }}
                            />
                            <button 
                              onClick={() => {
                                if (editLocName.trim()) updateLocation(loc.id, editLocName.trim());
                                setEditingLocationId(null);
                              }}
                              className="p-1 text-accent hover:bg-accent/10 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 pr-2">
                            <span className="font-medium text-txt-primary block truncate">{loc.name}</span>
                            <span className="text-[10px] text-txt-tertiary block truncate" title={loc.path}>{loc.path}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={async () => {
                              const newPath = await open({ directory: true });
                              if (newPath && typeof newPath === 'string') {
                                updateLocation(loc.id, loc.name, newPath);
                                if (destinationDirectory === loc.path) setDestinationDirectory(newPath, loc.id);
                              }
                            }}
                            className="p-1 rounded text-txt-tertiary hover:text-accent hover:bg-app-border/40 transition-colors"
                            title={t('destination.relink')}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => {
                              setEditingLocationId(loc.id);
                              setEditLocName(loc.name);
                            }}
                            className="p-1 rounded text-txt-tertiary hover:text-txt-primary hover:bg-app-border/40 transition-colors"
                            title={t('destination.editLocationName')}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => removeLocation(loc.id)}
                            className="p-1 rounded text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
                            title={t('destination.deleteLocation')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Paths */}
              {recentPaths.length > 0 && (
                <div className="border-t border-app-border/50">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-txt-tertiary uppercase tracking-wider bg-app-panel/50">
                    {t('destination.recentHeader')}
                  </div>
                  <div className="max-h-28 overflow-y-auto">
                    {recentPaths.map((path, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setDestinationDirectory(path, null);
                          setIsDestDropdownOpen(false);
                        }}
                        className="px-3 py-1.5 hover:bg-app-hover cursor-pointer transition-colors truncate text-txt-secondary hover:text-txt-primary"
                        title={path}
                      >
                        <span className="font-mono text-[11px] truncate block">{path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="border-t border-app-border p-1.5 bg-app-panel/40 space-y-1">
                <button 
                  onClick={handleAddLocation}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-txt-secondary hover:text-accent hover:bg-app-hover rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-accent" />
                  {t('destination.addLocation')}
                </button>
                <button 
                  onClick={handleBrowseDestination}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-txt-secondary hover:text-txt-primary hover:bg-app-hover rounded transition-colors"
                >
                  <FolderSearch className="w-3.5 h-3.5 text-txt-tertiary" />
                  {t('destination.browseOther')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Folder Structuring Options (Variante A) */}
        <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3.5">
          <label className="block text-xs font-semibold text-txt-primary uppercase tracking-wider">
            {t('destination.structuring')}
          </label>

          {/* Option 1: By Shooting Date */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
              <input 
                type="radio" 
                name="structureMode" 
                checked={structureMode === 'date'} 
                onChange={() => setStructureMode('date')}
                className="accent-accent cursor-pointer"
              />
              <span>{t('destination.modeDate')}</span>
            </label>
            {structureMode === 'date' && (
              <div className="ml-6 flex items-center gap-2">
                <select 
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent cursor-pointer w-full font-mono"
                >
                  {DATE_FORMAT_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.id})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Option 2: Custom Pattern (Tokens) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
              <input 
                type="radio" 
                name="structureMode" 
                checked={structureMode === 'custom'} 
                onChange={() => setStructureMode('custom')}
                className="accent-accent cursor-pointer"
              />
              <span>{t('destination.modeCustom')}</span>
            </label>
            {structureMode === 'custom' && (
              <div className="ml-6 space-y-2">
                <input 
                  type="text"
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  placeholder="{year}/{year}-{month}-{day}"
                  className="w-full bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs font-mono text-txt-primary focus:outline-none focus:border-accent"
                />
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="text-txt-tertiary mr-1">{t('destination.tokensHint')}</span>
                  {['{year}', '{month}', '{day}', '{camera}', '{ext}'].map(tok => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => setCustomPattern((customPattern ? customPattern + '/' : '') + tok)}
                      className="px-1.5 py-0.5 rounded bg-app-panel border border-app-border text-accent hover:bg-accent/15 transition-colors font-mono"
                    >
                      +{tok}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Option 3: Fixed Project / Event Folder */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
              <input 
                type="radio" 
                name="structureMode" 
                checked={structureMode === 'project'} 
                onChange={() => setStructureMode('project')}
                className="accent-accent cursor-pointer"
              />
              <span>{t('destination.modeProject')}</span>
            </label>
            {structureMode === 'project' && (
              <div className="ml-6">
                <input 
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t('destination.projectPlaceholder')}
                  className="w-full bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent"
                />
              </div>
            )}
          </div>

          {/* Option 4: Flat (No subfolders) */}
          <div className="space-y-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
              <input 
                type="radio" 
                name="structureMode" 
                checked={structureMode === 'flat'} 
                onChange={() => setStructureMode('flat')}
                className="accent-accent cursor-pointer"
              />
              <span>{t('destination.modeFlat')}</span>
            </label>
          </div>
        </div>

        {/* 4. Live Preview */}
        <div>
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5">{t('destination.preview')}</label>
          {generatePreview()}
        </div>
      </div>
    </div>
  );
}

