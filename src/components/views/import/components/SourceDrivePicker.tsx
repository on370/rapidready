import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderInput, HardDrive, Folder, RefreshCw, File, Database, Calendar, 
  CheckCircle2, EyeOff, Sparkles, FolderPlus 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useImportStore, ScannedFile } from '../../../../stores/importStore';

interface ScanProgress {
  current: number;
  total: number;
  percent: number;
  current_file: string;
}

interface DriveInfo {
  name: string;
  path: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

export const SourceDrivePicker = React.memo(function SourceDrivePicker() {
  const { t } = useTranslation('import');

  const { 
    setSourceDirectory, sourceDirectory,
    scannedFiles, setScannedFiles, isScanning, setIsScanning,
    scanProgress, setScanProgress,
    hideImported, setHideImported
  } = useImportStore();

  const [drives, setDrives] = useState<DriveInfo[]>([]);

  // Polling for removable drives with auto-reset upon disconnect
  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const detectedDrives = await invoke<DriveInfo[]>('get_removable_drives');
        setDrives(detectedDrives);

        // Auto-Reset: If currently selected source was an external drive/volume that is now unplugged
        if (sourceDirectory) {
          const isDrivePath = sourceDirectory.startsWith('/Volumes/') || /^[A-Za-z]:[\\/]/.test(sourceDirectory);
          if (isDrivePath || detectedDrives.some((d) => sourceDirectory.startsWith(d.path))) {
            const exists = await invoke<boolean>('check_path_exists', { path: sourceDirectory }).catch(() => false);
            if (!exists) {
              setSourceDirectory(null);
              setScannedFiles([]);
              setScanProgress(null);
              setIsScanning(false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to get drives:", error);
      }
    };
    
    fetchDrives();
    const interval = setInterval(fetchDrives, 1500);
    return () => clearInterval(interval);
  }, [sourceDirectory, setSourceDirectory, setScannedFiles, setIsScanning, setScanProgress]);

  // Central scan function with watchdog inactivity protection
  const scanPath = async (path: string) => {
    if (isScanning) return;
    setSourceDirectory(path);
    setScannedFiles([]);
    setScanProgress(null);
    setIsScanning(true);

    let watchdogTimer: any = null;
    let unlistenFn: any = null;

    // Reset inactivity watchdog: triggers only if 20 seconds pass without ANY progress event
    const resetWatchdog = (reject: (reason?: any) => void) => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        reject(new Error(t('source.scanTimeout')));
      }, 20000);
    };

    try {
      const scanPromise = new Promise<ScannedFile[]>(async (resolve, reject) => {
        resetWatchdog(reject);

        try {
          unlistenFn = await listen<ScanProgress>('scan_progress', (event) => {
            setScanProgress(event.payload);
            resetWatchdog(reject);
          });

          const result = await invoke<ScannedFile[]>('scan_source_directory', { path });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      const files = await scanPromise;
      setScannedFiles(files);
    } catch (error: any) {
      console.error("Failed to scan directory:", error);
      alert(error.message || String(error));
      setSourceDirectory(null);
      setScannedFiles([]);
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (unlistenFn) unlistenFn();
      setIsScanning(false);
    }
  };

  const handleSelectFolder = async () => {
    if (isScanning) return;
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });

      if (selectedPath && typeof selectedPath === 'string') {
        scanPath(selectedPath);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  const newFiles = useMemo(() => scannedFiles.filter((f) => !f.already_imported), [scannedFiles]);
  const alreadyImportedFiles = useMemo(() => scannedFiles.filter((f) => f.already_imported), [scannedFiles]);

  const pairStats = useMemo(() => {
    const RAW_EXTS = new Set(["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2"]);
    const JPG_EXTS = new Set(["jpg", "jpeg"]);
    const stems = new Map<string, { raw: boolean; jpg: boolean }>();
    for (const f of newFiles) {
      const lastSlash = Math.max(f.path.lastIndexOf('/'), f.path.lastIndexOf('\\'));
      const dir = lastSlash !== -1 ? f.path.substring(0, lastSlash) : '';
      const dotIdx = f.name.lastIndexOf('.');
      const stem = dotIdx !== -1 ? f.name.substring(0, dotIdx) : f.name;
      const ext = dotIdx !== -1 ? f.name.substring(dotIdx + 1).toLowerCase() : '';
      const key = `${dir}:::${stem.toLowerCase()}`;
      if (!stems.has(key)) stems.set(key, { raw: false, jpg: false });
      const e = stems.get(key)!;
      if (RAW_EXTS.has(ext)) e.raw = true;
      if (JPG_EXTS.has(ext)) e.jpg = true;
    }
    let pairs = 0;
    for (const e of stems.values()) {
      if (e.raw && e.jpg) pairs++;
    }
    const totalPhotos = stems.size;
    return { pairs, totalPhotos };
  }, [newFiles]);

  const isRemovableSource = sourceDirectory ? (
    drives.some((d) => sourceDirectory.startsWith(d.path)) || sourceDirectory.startsWith('/Volumes/')
  ) : false;

  return (
    <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pr-1">
      <div className="flex items-center gap-2 mb-1">
        <FolderInput className="w-4 h-4 text-txt-secondary" />
        <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">{t('source.title')}</h2>
      </div>

      {/* Source Cards */}
      {sourceDirectory ? (
        <div className="bg-app-card border border-app-border rounded-xl p-4 ring-1 ring-accent/30 shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-accent/5 rounded-bl-full"></div>
          
          <div className="flex items-start justify-between relative z-10">
            <div className="min-w-0 pr-4 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="font-semibold text-txt-primary text-base truncate">
                  {sourceDirectory.split(/[/\\]/).pop() || sourceDirectory}
                </h3>
                <span className={`w-2 h-2 rounded-full ${isScanning ? 'bg-warning animate-ping' : 'bg-success animate-pulse'}`}></span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                {isRemovableSource ? <HardDrive className="w-3.5 h-3.5 text-txt-tertiary" /> : <Folder className="w-3.5 h-3.5 text-txt-tertiary" />}
                <span className="text-sm font-medium text-txt-secondary truncate" title={sourceDirectory}>
                  {sourceDirectory}
                </span>
              </div>

              {isScanning ? (
                <div className="space-y-2 py-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-accent font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                      <span>
                        {scanProgress && scanProgress.total > 0
                          ? `${scanProgress.current} von ${scanProgress.total} Dateien`
                          : t('source.readingCard')}
                      </span>
                    </div>
                    {scanProgress && scanProgress.total > 0 && (
                      <span className="font-mono text-[11px] text-accent font-bold">
                        {Math.round(scanProgress.percent)}%
                      </span>
                    )}
                  </div>

                  {/* True live moving progress bar */}
                  <div className="w-full bg-app-deepest h-2 rounded-full overflow-hidden border border-app-border">
                    <div 
                      className="bg-accent h-full rounded-full transition-all duration-150 ease-out shadow-[0_0_8px_rgba(var(--accent-color-rgb),0.5)]"
                      style={{ width: `${Math.max(3, Math.min(100, scanProgress?.percent ?? 0))}%` }}
                    ></div>
                  </div>

                  <div className="text-[11px] text-txt-tertiary flex items-center justify-between gap-2">
                    <span className="truncate max-w-[260px] font-mono text-[10px]">
                      {scanProgress?.current_file ? scanProgress.current_file : t('source.readingCardDesc')}
                    </span>
                    {scanProgress && scanProgress.total > 0 && (
                      <span className="flex-shrink-0 text-[10px] opacity-75">
                        {scanProgress.total - scanProgress.current} verbleibend
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 text-xs text-txt-tertiary">
                    <span className="flex items-center gap-1 font-medium text-txt-primary">
                      <File className="w-3 h-3 text-accent" /> 
                      {pairStats.pairs > 0 ? (
                        <span>
                          {pairStats.totalPhotos} Fotos ({newFiles.length} Dateien · {pairStats.pairs} Paare)
                        </span>
                      ) : (
                        <span>
                          {newFiles.length} {t('source.newFiles')}
                        </span>
                      )}
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
                </>
              )}
            </div>
            <div className="flex-shrink-0">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide ${
                isRemovableSource ? 'bg-warning/15 text-warning border border-warning/30' : 'bg-accent/15 text-accent border border-accent/30'
              }`}>
                {isRemovableSource ? <HardDrive className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
                <span>{isRemovableSource ? t('source.badgeSdCard') : t('source.badgeFolder')}</span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        drives.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {drives.map((drive, idx) => (
              <button 
                key={idx}
                disabled={isScanning}
                onClick={() => scanPath(drive.path)}
                className="bg-app-card border border-app-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent hover:bg-accent/5 transition-all text-center group ring-1 ring-transparent hover:ring-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full bg-app-deepest flex items-center justify-center group-hover:scale-110 transition-transform">
                  {isScanning && sourceDirectory === drive.path ? (
                    <RefreshCw className="w-5 h-5 text-accent animate-spin" />
                  ) : (
                    <HardDrive className="w-5 h-5 text-txt-secondary group-hover:text-accent transition-colors" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-txt-primary truncate max-w-[140px]" title={drive.name}>{drive.name || t('source.sdCardDefault')}</h3>
                  <p className="text-[10px] text-txt-tertiary">{t('source.gbFree', { size: (drive.available_space / (1024*1024*1024)).toFixed(1) })}</p>
                </div>
              </button>
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
            <div className={`toggle-track ${hideImported ? 'on' : ''} ${isScanning ? 'opacity-40 pointer-events-none' : ''}`} onClick={() => !isScanning && setHideImported(!hideImported)}>
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
          {isScanning ? (
            <span className="text-sm font-medium text-txt-tertiary italic flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {scanProgress && scanProgress.total > 0
                ? `${scanProgress.current} / ${scanProgress.total} (${Math.round(scanProgress.percent)}%)`
                : t('source.scanning')}
            </span>
          ) : (
            <>
              <span className="text-sm font-semibold text-accent">
                {pairStats.pairs > 0 ? t('source.pairStats', { total: pairStats.totalPhotos, pairs: pairStats.pairs }) : `${newFiles.length} ${t('source.newFiles')}`}
              </span>
              <span className="text-sm text-txt-tertiary">
                ({(newFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB)
              </span>
            </>
          )}
        </div>
      </div>

      {/* Or Select Folder */}
      <button 
        onClick={handleSelectFolder}
        disabled={isScanning}
        className="flex items-center justify-center gap-2 py-3 px-4 border border-dashed border-app-border rounded-xl text-sm text-txt-secondary hover:border-accent hover:text-accent transition-all duration-200 hover:bg-accent/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
      >
        <FolderPlus className="w-4 h-4" />
        <span>{isScanning ? t('source.scanning') : t('source.selectFolder')}</span>
      </button>
    </div>
  );
});
