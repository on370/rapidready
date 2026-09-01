import { HardDrive, File, Database, Calendar, CheckCircle2, EyeOff, Sparkles, FolderPlus, FolderInput, FolderOutput, SlidersHorizontal, ChevronDown, Pencil, Info, Folder, FolderSearch, Save, Plus, X, Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useImportStore, ScannedFile } from '../../../stores/importStore';

export function ImportSourceStep() {
    const { 
    setSourceDirectory, sourceDirectory,
    scannedFiles, setScannedFiles, isScanning, setIsScanning,
    destinationDirectory, setDestinationDirectory,
    directoryTemplate, setDirectoryTemplate,
    hideImported, setHideImported
  } = useImportStore();

  const [isTemplateLocked, setIsTemplateLocked] = useState(true);

  const handleSelectDestination = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      if (selectedPath && typeof selectedPath === 'string') {
        setDestinationDirectory(selectedPath);
      }
    } catch (error) {
      console.error("Failed to select destination:", error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });

      if (selectedPath && typeof selectedPath === 'string') {
        setSourceDirectory(selectedPath);
        setIsScanning(true);
        
        // Scan the directory using Rust backend
        const files: ScannedFile[] = await invoke('scan_source_directory', { path: selectedPath });
        
        // Exclude the 'selected' property here since Zustand store will add it
        setScannedFiles(files);
      }
    } catch (error) {
      console.error("Failed to select or scan directory:", error);
    } finally {
      setIsScanning(false);
    }
  };
  const newFiles = scannedFiles.filter(f => !f.already_imported);
  const alreadyImportedFiles = scannedFiles.filter(f => f.already_imported);


  

  // Helper to generate a quick dynamic preview based on template and dates
  const generatePreview = () => {
    let datesToUse: Date[] = [];
    if (newFiles.length > 0) {
      // Find up to 3 unique days
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
    
    if (datesToUse.length === 0) {
      datesToUse = [new Date()]; // Fallback to today
    }

    const paths = datesToUse.map(d => {
      let p = directoryTemplate || '';
      p = p.replace(/{year}/g, d.getFullYear().toString());
      p = p.replace(/{month}/g, (d.getMonth() + 1).toString().padStart(2, '0'));
      p = p.replace(/{day}/g, d.getDate().toString().padStart(2, '0'));
      p = p.replace(/{camera}/g, "Camera");
      p = p.replace(/{ext}/g, "RAW");
      return p.replace(/\\/g, '/');
    });


    return (
      <div className="bg-app-deepest border border-app-border rounded-lg p-3 font-mono text-xs">
        {paths.map((path, idx) => (
          <div key={idx} className="flex items-center gap-1.5 text-txt-secondary mb-1">
            <Folder className="w-3.5 h-3.5 text-warning/70" />
            <span>{path.endsWith('/') ? path : path + '/'}</span>
            <span className="text-txt-tertiary ml-1 opacity-50">~files</span>
          </div>
        ))}
      </div>
    );
  };


  return (
    <div className="flex-1 overflow-hidden p-6 flex gap-6">

      
      {/* Left Panel: Source Selection */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pr-1">
        <div className="flex items-center gap-2 mb-1">
          <FolderInput className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Source</h2>
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
                    {newFiles.length} new files
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
          <div className="bg-app-card/30 border border-dashed border-app-border rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-80">
            <div className="w-12 h-12 rounded-full bg-app-deepest flex items-center justify-center mb-3 text-txt-tertiary">
              <HardDrive className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-txt-secondary mb-1">No source detected</h3>
            <p className="text-xs text-txt-tertiary max-w-[200px]">Insert an SD card or select a folder below to begin import.</p>
          </div>
        )}

        {/* Already Imported Indicator */}
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-4 h-4 ${alreadyImportedFiles.length > 0 ? 'text-success' : 'text-txt-tertiary'}`} />
              <span className="text-sm text-txt-secondary">Already imported</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-txt-tertiary">Hide imported</span>
              <div className={`toggle-track ${hideImported ? 'on' : ''}`} onClick={() => setHideImported(!hideImported)}>
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-txt-tertiary">
              <EyeOff className="w-3.5 h-3.5" />
              <span className={alreadyImportedFiles.length > 0 ? "font-medium text-txt-secondary" : ""}>
                {alreadyImportedFiles.length} already imported {hideImported ? '(hidden)' : '(shown)'}
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
              {newFiles.length} new files
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
          <span>{isScanning ? 'Scanning...' : 'Or select folder…'}</span>
        </button>
      </div>

      {/* Right Panel: Destination & Settings */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pl-1">
        <div className="flex items-center gap-2 mb-1">
          <FolderOutput className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Destination</h2>
        </div>

        {/* Import Profile */}
        <div>
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5">Import Profile</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-app-card border border-app-border rounded-lg px-3 py-2 hover:border-app-border-hover transition-colors cursor-pointer justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <span className="text-sm text-txt-primary font-medium">Standard</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary" />
            </div>
            <button className="px-2 py-2 bg-app-card border border-app-border rounded-lg hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-1.5" title="Edit Profile">
              <Pencil className="w-3.5 h-3.5 text-txt-secondary" />
            </button>
          </div>
          <p className="text-[10px] text-txt-tertiary mt-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Profile defines default format, destination & settings
          </p>
        </div>

        {/* Path Input */}
        <div className="inherited-field ml-2.5">
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5 flex items-center gap-1.5">
            Destination Path
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-app-card border border-app-border rounded-lg px-3 py-2 hover:border-app-border-hover transition-colors overflow-hidden">
              <Folder className="w-4 h-4 text-txt-tertiary mr-2 flex-shrink-0" />
              <span className={`text-sm truncate ${destinationDirectory ? 'text-txt-primary' : 'text-txt-tertiary italic'}`}>
                {destinationDirectory || 'Select destination...'}
              </span>
            </div>
            <button 
              onClick={handleSelectDestination}
              className="px-3 py-2 bg-app-card border border-app-border rounded-lg hover:bg-app-hover hover:border-app-border-hover transition-all duration-150"
            >
              <FolderSearch className="w-4 h-4 text-txt-secondary" />
            </button>
          </div>
        </div>

        {/* Directory Format Template */}
        <div className="inherited-field ml-2.5">
          <label className="block text-xs font-medium text-txt-tertiary mb-1.5 flex items-center gap-1.5">
            Directory Format
          </label>
          <div className="flex gap-2">
            <div className={`flex-1 flex items-center bg-app-card border border-app-border rounded-lg px-3 py-2 transition-colors font-mono ${isTemplateLocked ? 'opacity-70' : 'focus-within:border-accent hover:border-app-border-hover'}`}>
              <input 
                type="text"
                value={directoryTemplate}
                onChange={(e) => setDirectoryTemplate(e.target.value)}
                disabled={isTemplateLocked}
                className={`bg-transparent border-none outline-none text-sm w-full ${isTemplateLocked ? 'text-txt-tertiary' : 'text-txt-primary'}`}
                placeholder="{year}/{year}-{month}-{day}"
              />
            </div>
            <button 
              onClick={() => setIsTemplateLocked(!isTemplateLocked)}
              className={`px-3 py-2 bg-app-card border border-app-border rounded-lg hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 ${!isTemplateLocked ? 'text-accent border-accent/30 bg-accent/5' : 'text-txt-secondary'}`}
              title={isTemplateLocked ? "Unlock to edit" : "Lock format"}
            >
              {isTemplateLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-txt-tertiary mt-1.5">Tokens: <code className="text-accent/70">{'{year}'}</code> <code className="text-accent/70">{'{month}'}</code> <code className="text-accent/70">{'{day}'}</code> <code className="text-accent/70">{'{camera}'}</code> <code className="text-accent/70">{'{ext}'}</code></p>
        </div>

        {/* Save as new profile */}
        <button className="flex items-center gap-1.5 text-xs text-accent/70 hover:text-accent transition-colors ml-2.5">
          <Save className="w-3 h-3" />
          Save as new Profile…
        </button>

        {/* Collection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-txt-tertiary">Add to Collection</label>
            <button className="w-5 h-5 rounded flex items-center justify-center hover:bg-app-hover transition-colors">
              <Plus className="w-3.5 h-3.5 text-txt-tertiary" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="collection-chip inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo/15 border border-indigo/30 rounded-lg text-xs font-medium text-indigo-hover cursor-default">
              <Folder className="w-3 h-3" />
              Urlaub 2025 Mallorca
              <button className="hover:text-danger transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
            <button className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-app-border rounded-lg text-xs text-txt-tertiary hover:border-accent hover:text-accent transition-all">
              <Plus className="w-3 h-3" />
              Add…
            </button>
          </div>
        </div>

        {/* Live Preview: Directory Structure */}
        <div className="mt-1">
          <label className="block text-xs font-medium text-txt-tertiary mb-2">Preview</label>
          {generatePreview()}
        </div>
      </div>
    </div>
  );
}
