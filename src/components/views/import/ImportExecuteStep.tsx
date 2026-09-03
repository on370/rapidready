import { 
  Download, File, Terminal, CheckCircle2, Folder, 
  LayoutGrid, Rocket, RotateCcw 
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useImportStore } from '../../../stores/importStore';
import { useLibraryStore, LibraryImage } from '../../../stores/libraryStore';
import { useNavigationStore } from '../../../stores/navigationStore';

interface ImportProgress {
  files_processed: number;
  total_files: number;
  bytes_processed: number;
  total_bytes: number;
  current_file: string;
  current_file_path: string;
}

interface ImportExecuteStepProps {
  onReset?: () => void;
}

export function ImportExecuteStep({ onReset }: ImportExecuteStepProps) {
  const { t } = useTranslation('import');
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [importedPaths, setImportedPaths] = useState<string[]>([]);
  const [isOpeningRapidRaw, setIsOpeningRapidRaw] = useState(false);
  
  const hasStarted = useRef(false);
  
  const { scannedFiles, destinationDirectory, directoryTemplate, setScannedFiles, setSourceDirectory } = useImportStore();
  const { setRootPath, setImages, setLastImportPaths, setIsViewingLastImport } = useLibraryStore();
  const { setActiveView } = useNavigationStore();
  
  const selectedFiles = scannedFiles.filter(f => f.selected);

  useEffect(() => {
    if (hasStarted.current) return;
    
    if (!destinationDirectory) {
      setLogs([t('execute.noDestinationError')]);
      return;
    }
    
    hasStarted.current = true;

    if (selectedFiles.length === 0) {
      setIsComplete(true);
      return;
    }

    let unlisten: () => void;

    const startImport = async () => {
      unlisten = await listen<ImportProgress>('import_progress', (event) => {
        setProgress(event.payload);
        
        setLogs(prev => {
            const msg = `Copying ${event.payload.current_file}...`;
            if (prev[prev.length - 1] === msg) return prev;
            if (prev.length > 0 && prev[prev.length - 1].endsWith('...')) {
                const newLogs = [...prev];
                newLogs[newLogs.length - 1] = newLogs[newLogs.length - 1] + " OK";
                return [...newLogs, msg];
            }
            return [...prev, msg];
        });
      });

      try {
        const resultPaths = await invoke<string[]>('execute_import', {
          files: selectedFiles,
          destinationBase: destinationDirectory,
          template: directoryTemplate
        });
        
        setImportedPaths(resultPaths || []);

        setLogs(prev => {
            if (prev.length > 0 && prev[prev.length - 1].endsWith('...')) {
                const newLogs = [...prev];
                newLogs[newLogs.length - 1] = newLogs[newLogs.length - 1] + " OK";
                return newLogs;
            }
            return prev;
        });
        
        setIsComplete(true);
      } catch (error) {
        console.error("Import failed:", error);
        setLogs(prev => [...prev, `ERROR: ${error}`]);
      }
    };

    startImport();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const createdFolders = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of importedPaths) {
      const parent = p.substring(0, p.lastIndexOf('/'));
      map.set(parent, (map.get(parent) || 0) + 1);
    }
    return Array.from(map.entries()).map(([path, count]) => ({ path, count }));
  }, [importedPaths]);

  const handleGoToLibrary = async () => {
    if (destinationDirectory) {
      setRootPath(destinationDirectory);
      setLastImportPaths(importedPaths);
      setIsViewingLastImport(true);
      try {
        const loadedImages: LibraryImage[] = await invoke('scan_archive_directory', { path: destinationDirectory });
        setImages(loadedImages);
      } catch (e) {
        console.error("Failed to scan library after import:", e);
      }
      setActiveView('library');
    }
  };

  const handleOpenInRapidRaw = async () => {
    const targetToOpen = importedPaths[0] || createdFolders[0]?.path || destinationDirectory;
    if (targetToOpen) {
      setIsOpeningRapidRaw(true);
      try {
        await invoke('open_in_rapidraw', { path: targetToOpen });
      } catch (e) {
        console.error("Failed to open RapidRaw:", e);
      } finally {
        setIsOpeningRapidRaw(false);
      }
    }
  };

  const handleNewImport = () => {
    setScannedFiles([]);
    setSourceDirectory(null);
    if (onReset) {
      onReset();
    }
  };

  const p_files = progress ? progress.files_processed : 0;
  const t_files = progress ? progress.total_files : selectedFiles.length;
  
  const p_bytes = progress ? progress.bytes_processed : 0;
  const t_bytes = progress ? progress.total_bytes : selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const percent = t_bytes > 0 ? Math.round((p_bytes / t_bytes) * 100) : 0;

  return (
    <div className="flex-1 overflow-auto p-6 flex">
      <div className="flex-1 flex flex-col items-center max-w-2xl mx-auto w-full">
        
        {!isComplete ? (
          /* Progress State */
          <div className="w-full flex flex-col items-center gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Download className="w-8 h-8 text-accent animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-txt-primary mb-1">{t('execute.importing')}</h2>
              <p className="text-sm text-txt-secondary truncate max-w-md">{t('execute.copyingTo')} {destinationDirectory || 'Unknown'}</p>
            </div>

            {/* Main Progress Bar */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-txt-primary">{p_files} of {t_files} files</span>
                <span className="text-sm font-bold text-accent tabular-nums">{percent}%</span>
              </div>
              <div className="w-full h-3 bg-app-card rounded-full overflow-hidden border border-app-border">
                <div className="progress-fill h-full rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-txt-tertiary">
                <span>{(p_bytes / (1024 * 1024 * 1024)).toFixed(2)} of {(t_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
              </div>
            </div>

            {/* Current File */}
            <div className="w-full bg-app-card border border-app-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <File className="w-4 h-4 text-accent animate-spin" style={{ animationDuration: '2s' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-txt-primary font-medium truncate">{progress ? progress.current_file : 'Starting...'}</p>
                <p className="text-xs text-txt-tertiary truncate" title={progress ? progress.current_file_path : ''}>
                  {t('execute.copyingTo')} {progress ? progress.current_file_path : '...'}
                </p>
              </div>
            </div>

            {/* Log Area */}
            <div className="w-full flex-1 bg-app-card border border-app-border rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '150px' }}>
              <div className="px-3 py-2 border-b border-app-border flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-txt-tertiary" />
                <span className="text-xs font-medium text-txt-secondary">{t('execute.importLog')}</span>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-1 font-mono text-[11px] text-txt-tertiary flex flex-col">
                {logs.map((log, i) => (
                  <div key={i} className={`log-entry ${i === logs.length - 1 && !log.endsWith('OK') ? 'text-txt-primary' : ''}`}>{log}</div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Completion State */
          <div className="w-full flex flex-col items-center gap-6 mt-6">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4 bounce-in">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-txt-primary mb-2">{t('execute.importComplete')}</h2>
              <p className="text-sm text-txt-secondary">{importedPaths.length || t_files} {t('execute.filesImported')}</p>
              <p className="text-xs text-txt-tertiary mt-1">{(t_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB {t('execute.copied')}.</p>
            </div>

            {/* Created Target Folders Card */}
            <div className="w-full bg-app-card border border-app-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-app-border">
                <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  {t('execute.targetFolders', { count: createdFolders.length || 1 })}
                </span>
                <span className="text-xs text-txt-tertiary">
                  {importedPaths.length || t_files} {t('destination.previewFiles')}
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {createdFolders.length > 0 ? (
                  createdFolders.map(({ path, count }) => (
                    <div key={path} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <Folder className="w-4 h-4 text-warning/80 flex-shrink-0" />
                        <span className="font-mono text-txt-primary truncate" title={path}>
                          {path.replace(destinationDirectory || '', '') || path}
                        </span>
                      </div>
                      <span className="text-[11px] text-txt-tertiary flex-shrink-0 font-medium">
                        {count} {t('destination.previewFiles')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 text-xs py-1">
                    <Folder className="w-4 h-4 text-warning/80 flex-shrink-0" />
                    <span className="font-mono text-txt-primary truncate">{destinationDirectory}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex items-center gap-3 mt-2">
              <button 
                onClick={handleGoToLibrary}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-app-deepest font-semibold text-sm rounded-lg transition-all duration-150 flex items-center gap-2 shadow-lg shadow-accent/20 cursor-pointer"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>{t('execute.goToLibrary')}</span>
              </button>

              <button 
                onClick={handleOpenInRapidRaw}
                disabled={isOpeningRapidRaw}
                className="px-5 py-2.5 bg-app-card border border-app-border hover:border-app-border-hover text-txt-primary hover:bg-app-hover text-sm font-medium rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Rocket className="w-4 h-4 text-accent" />
                <span>{isOpeningRapidRaw ? 'Starting...' : t('execute.openInRapidRaw')}</span>
              </button>

              <button 
                onClick={handleNewImport}
                className="px-4 py-2.5 text-xs text-txt-tertiary hover:text-txt-primary transition-colors flex items-center gap-1.5 cursor-pointer ml-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('execute.newImport')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

