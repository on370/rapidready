import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Folder, AlertTriangle, AlertCircle, ChevronDown, 
  Check, FolderSearch, Bookmark
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { useImportStore } from '../../../../stores/importStore';
import { useSettingsStore, ArchiveLocation } from '../../../../stores/settingsStore';
import { normalizePath } from '../../../../utils/image';

export const DestinationInfoBar = React.memo(function DestinationInfoBar() {
  const { t } = useTranslation('import');
  const { destinationDirectory, setDestinationDirectory, selectedLocationId } = useImportStore();
  const { locations, addRecentPath } = useSettingsStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const uniqueLocations = useMemo(() => {
    const seen = new Set<string>();
    return locations.filter((loc) => {
      const key = normalizePath(loc.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [locations]);

  const activeLocation = uniqueLocations.find(
    (l) => l.id === selectedLocationId || (destinationDirectory && normalizePath(l.path) === normalizePath(destinationDirectory))
  );

  const isDefaultPictures = 
    activeLocation?.id === 'default-pictures' || 
    selectedLocationId === 'default-pictures' ||
    (destinationDirectory && destinationDirectory.toLowerCase().endsWith('/pictures')) ||
    (destinationDirectory && destinationDirectory.toLowerCase().endsWith('\\pictures'));

  const handleSelectLocation = (loc: ArchiveLocation) => {
    setDestinationDirectory(loc.path, loc.id, true);
    addRecentPath(loc.path);
    setIsDropdownOpen(false);
  };

  const handleBrowseNewFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      if (selectedPath && typeof selectedPath === 'string') {
        const existing = uniqueLocations.find((l) => normalizePath(l.path) === normalizePath(selectedPath));
        if (existing) {
          setDestinationDirectory(existing.path, existing.id, true);
        } else {
          setDestinationDirectory(selectedPath, null, true);
        }
        addRecentPath(selectedPath);
        setIsDropdownOpen(false);
      }
    } catch (err) {
      console.error('Failed to browse new destination:', err);
    }
  };

  return (
    <div className="relative flex-shrink-0" ref={dropdownRef}>
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all duration-200 ${
        !destinationDirectory 
          ? 'bg-danger/10 border-danger/40 shadow-xs' 
          : isDefaultPictures
            ? 'bg-warning/10 border-warning/40 shadow-xs'
            : 'bg-app-card border-app-border'
      }`}>
        {/* Left: Destination Path & Status Badges */}
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            !destinationDirectory
              ? 'bg-danger/20 text-danger'
              : isDefaultPictures
                ? 'bg-warning/20 text-warning'
                : 'bg-accent/15 text-accent'
          }`}>
            {!destinationDirectory ? (
              <AlertCircle className="w-4 h-4" />
            ) : isDefaultPictures ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Folder className="w-4 h-4" />
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                {t('preview.destinationLabel', 'Importziel:')}
              </span>

              {activeLocation && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-app-deepest text-txt-primary border border-app-border">
                  <Bookmark className="w-2.5 h-2.5 text-accent" />
                  {activeLocation.name}
                </span>
              )}

              {/* Warning/Notice Badges */}
              {!destinationDirectory && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-danger/20 text-danger border border-danger/30">
                  <AlertCircle className="w-3 h-3" />
                  {t('preview.noDestination', 'Kein Zielverzeichnis festgelegt!')}
                </span>
              )}

              {destinationDirectory && isDefaultPictures && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-warning/20 text-warning border border-warning/30">
                  <AlertTriangle className="w-3 h-3" />
                  {t('preview.defaultPicturesWarning', 'Standard-Bilderordner aktiv (Ziel prüfen)')}
                </span>
              )}
            </div>

            <div className="text-xs text-txt-primary font-mono truncate mt-0.5" title={destinationDirectory || ''}>
              {destinationDirectory || (
                <span className="text-danger italic font-sans">{t('preview.noDestinationHint', 'Bitte vor dem Import ein Verzeichnis auswählen')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Change Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all duration-150 cursor-pointer shadow-xs ${
              !destinationDirectory 
                ? 'bg-danger text-white border-danger hover:bg-danger/90'
                : isDefaultPictures
                  ? 'bg-warning/20 text-warning border-warning/40 hover:bg-warning/30'
                  : 'bg-app-card border-app-border text-txt-secondary hover:text-txt-primary hover:bg-app-hover hover:border-app-border-hover'
            }`}
            title={t('preview.changeDestination', 'Importziel ändern oder überprüfen')}
          >
            <FolderSearch className="w-3.5 h-3.5" />
            <span>{t('preview.changeDestination', 'Ziel ändern')}</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Destination Selection Dropdown */}
      {isDropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-app-panel border border-app-border rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider border-b border-app-border mb-1">
            {t('preview.savedLocations', 'Gespeicherte Locations')}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 py-1">
            {uniqueLocations.map((loc) => {
              const isSelected = destinationDirectory && normalizePath(loc.path) === normalizePath(destinationDirectory);
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer group ${
                    isSelected ? 'bg-accent/15 text-accent font-medium' : 'text-txt-primary hover:bg-app-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-accent' : 'text-txt-tertiary'}`} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{loc.name}</div>
                      <div className="text-[10px] text-txt-tertiary truncate font-mono">{loc.path}</div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-app-border pt-1 mt-1">
            <button
              type="button"
              onClick={handleBrowseNewFolder}
              className="w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2 text-xs text-txt-secondary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer font-medium"
            >
              <FolderSearch className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span>{t('preview.browseOther', 'Anderen Ordner wählen…')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
