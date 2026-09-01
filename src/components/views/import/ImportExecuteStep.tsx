import { Download, File, Terminal, CheckCircle2, FolderCheck, Plus } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useImportStore } from '../../../stores/importStore';

interface ImportProgress {
  files_processed: number;
  total_files: number;
  bytes_processed: number;
  total_bytes: number;
  current_file: string;
  current_file_path: string;
}

export function ImportExecuteStep() {
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const hasStarted = useRef(false);
  
  const { scannedFiles, destinationDirectory, directoryTemplate } = useImportStore();
  const selectedFiles = scannedFiles.filter(f => f.selected);

  useEffect(() => {
    if (hasStarted.current) return;
    
    if (!destinationDirectory) {
      setLogs(["ERROR: No destination directory selected. Cannot proceed."]);
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
        
        // Add log entry (only if the file is new or it's the first event for it)
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
        await invoke('execute_import', {
          files: selectedFiles,
          destinationBase: destinationDirectory,
          template: directoryTemplate
        });
        
        // Final log ok
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
        console.error("Import failed:", error); alert("Import Error: " + error);
        setLogs(prev => [...prev, `ERROR: ${error}`]);
      }
    };

    startImport();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Use dummy progress if not provided yet, but keep the UI structure
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
              <h2 className="text-xl font-bold text-txt-primary mb-1">Importing Files</h2>
              <p className="text-sm text-txt-secondary truncate max-w-md">Copying to {destinationDirectory || 'Unknown'}</p>
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
                  Copying to {progress ? progress.current_file_path : '...'}
                </p>
              </div>
            </div>

            {/* Log Area */}
            <div className="w-full flex-1 bg-app-card border border-app-border rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '150px' }}>
              <div className="px-3 py-2 border-b border-app-border flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-txt-tertiary" />
                <span className="text-xs font-medium text-txt-secondary">Import Log</span>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-1 font-mono text-[11px] text-txt-tertiary flex flex-col-reverse">
                {/* Reversing logs to show newest at bottom but keeping scroll simple for demo by just rendering them and flex-col-reverse or normal. Actually flex-col-reverse makes newest at bottom if we reverse the array. Let's just map normally and auto-scroll later if needed, or use a trick: */}
                <div className="flex flex-col">
                  {logs.map((log, i) => (
                    <div key={i} className={`log-entry ${i === logs.length - 1 && !log.endsWith('OK') ? 'text-txt-primary' : ''}`}>{log}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Completion State */
          <div className="w-full flex flex-col items-center gap-6 mt-10">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4 bounce-in">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-txt-primary mb-2">Import Complete</h2>
              <p className="text-sm text-txt-secondary">{t_files} files imported successfully</p>
              <p className="text-xs text-txt-tertiary mt-1">{(t_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB copied.</p>
            </div>

            <div className="w-full bg-app-card border border-app-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <FolderCheck className="w-5 h-5 text-success flex-shrink-0" />
                <span className="text-sm text-txt-primary truncate">Saved to <span className="font-mono text-accent" title={destinationDirectory || ''}>{destinationDirectory}</span></span>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button 
                className="px-6 py-2.5 bg-app-card border border-app-border rounded-lg text-sm font-medium text-txt-primary hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-2"
                onClick={() => window.location.reload()}
              >
                <Plus className="w-4 h-4" />
                New Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
