import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Folder, FolderSearch, Plus, ChevronDown, Bookmark, BookmarkCheck, 
  Edit2, Trash2, Check, RefreshCw 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useImportStore } from '../../../../stores/importStore';
import { useSettingsStore, ArchiveLocation } from '../../../../stores/settingsStore';
import { normalizePath } from '../../../../utils/image';

export const DestinationSelector = React.memo(function DestinationSelector() {
  const { t } = useTranslation('import');

  const {
    destinationDirectory,
    setDestinationDirectory,
    selectedLocationId,
  } = useImportStore();

  const {
    locations,
    addLocation,
    removeLocation,
    updateLocation,
    recentPaths,
    addRecentPath,
  } = useSettingsStore();

  const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState('');
  const destDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (destDropdownRef.current && !destDropdownRef.current.contains(e.target as Node)) {
        setIsDestDropdownOpen(false);
        setEditingLocationId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const uniqueLocations = useMemo(() => {
    const seen = new Set<string>();
    return locations.filter((loc) => {
      const key = normalizePath(loc.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [locations]);

  // Auto-initialize default destination to user's Pictures directory on fresh install
  useEffect(() => {
    if (!destinationDirectory) {
      if (uniqueLocations.length > 0) {
        setDestinationDirectory(uniqueLocations[0].path, uniqueLocations[0].id, false);
      } else {
        invoke<string>('get_default_pictures_dir')
          .then((picDir) => {
            if (picDir) {
              const existing = uniqueLocations.find((l) => normalizePath(l.path) === normalizePath(picDir));
              if (existing) {
                setDestinationDirectory(existing.path, existing.id, false);
              } else {
                const defaultName = t('destination.defaultPicturesName', 'Pictures');
                const defaultLoc: ArchiveLocation = {
                  id: 'default-pictures',
                  name: defaultName,
                  path: picDir,
                };
                addLocation(defaultLoc);
                setDestinationDirectory(picDir, defaultLoc.id, false);
              }
            }
          })
          .catch((err) => {
            console.error('Failed to get default pictures dir:', err);
          });
      }
    }
  }, [destinationDirectory, uniqueLocations, setDestinationDirectory, addLocation, t]);

  const activeLocation = uniqueLocations.find(
    (l) => l.id === selectedLocationId || (destinationDirectory && normalizePath(l.path) === normalizePath(destinationDirectory))
  );
  const isBookmarked = !!activeLocation;

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
      console.error('Failed to select destination:', error);
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
      console.error('Failed to add location:', error);
    }
  };

  const handleBookmarkCurrentPath = () => {
    if (!destinationDirectory) return;
    const isAlreadyLocation = uniqueLocations.some((l) => normalizePath(l.path) === normalizePath(destinationDirectory));
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

  return (
    <div className="relative" ref={destDropdownRef}>
      <label className="block text-xs font-medium text-txt-tertiary mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span>{t('destination.targetPath')}</span>
          {!destinationDirectory && (
            <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.2 rounded font-semibold border border-warning/20">
              {t('destination.required', 'Erforderlich')}
            </span>
          )}
        </span>
        {destinationDirectory && (
          <button 
            onClick={handleBookmarkCurrentPath}
            className={`flex items-center gap-1 text-[11px] transition-colors cursor-pointer ${isBookmarked ? 'text-accent' : 'text-txt-tertiary hover:text-accent'}`}
            title={isBookmarked ? t('destination.locationSaved') : t('destination.bookmarkLocation')}
          >
            {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 text-accent" /> : <Bookmark className="w-3.5 h-3.5" />}
            <span>{isBookmarked ? activeLocation?.name : t('destination.bookmarkLocation')}</span>
          </button>
        )}
      </label>

      <div 
        onClick={() => setIsDestDropdownOpen(!isDestDropdownOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 bg-app-card border rounded-lg transition-colors cursor-pointer text-xs text-txt-primary ${
          !destinationDirectory 
            ? 'border-warning/60 ring-1 ring-warning/30 hover:border-warning' 
            : 'border-app-border hover:border-app-border-hover'
        }`}
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
          {uniqueLocations.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-bold text-txt-tertiary uppercase tracking-wider bg-app-panel/50">
                {t('destination.locationsHeader')}
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-app-border/30">
                {uniqueLocations.map((loc) => (
                  <div 
                    key={loc.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-app-hover cursor-pointer transition-colors group"
                    onClick={() => {
                      setDestinationDirectory(loc.path, loc.id);
                      setIsDestDropdownOpen(false);
                    }}
                  >
                    {editingLocationId === loc.id ? (
                      <div className="flex items-center gap-1.5 flex-1 pr-2" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="text" 
                          value={editLocName}
                          onChange={(e) => setEditLocName(e.target.value)}
                          className="flex-1 bg-app-deepest border border-app-border rounded px-1.5 py-0.5 text-xs text-txt-primary outline-none focus:border-accent"
                          autoFocus
                          onKeyDown={(e) => {
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
                          className="p-1 text-accent hover:bg-accent/10 rounded cursor-pointer"
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

                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={async () => {
                          const newPath = await open({ directory: true });
                          if (newPath && typeof newPath === 'string') {
                            updateLocation(loc.id, loc.name, newPath);
                            if (destinationDirectory === loc.path) setDestinationDirectory(newPath, loc.id);
                          }
                        }}
                        className="p-1 rounded text-txt-tertiary hover:text-accent hover:bg-app-border/40 transition-colors cursor-pointer"
                        title={t('destination.relink')}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => {
                          setEditingLocationId(loc.id);
                          setEditLocName(loc.name);
                        }}
                        className="p-1 rounded text-txt-tertiary hover:text-txt-primary hover:bg-app-border/40 transition-colors cursor-pointer"
                        title={t('destination.editLocationName')}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => removeLocation(loc.id)}
                        className="p-1 rounded text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
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
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-txt-secondary hover:text-accent hover:bg-app-hover rounded transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              {t('destination.addLocation')}
            </button>
            <button 
              onClick={handleBrowseDestination}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-txt-secondary hover:text-txt-primary hover:bg-app-hover rounded transition-colors cursor-pointer"
            >
              <FolderSearch className="w-3.5 h-3.5 text-txt-tertiary" />
              {t('destination.browseOther')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
