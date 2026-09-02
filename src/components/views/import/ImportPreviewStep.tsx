import { GitBranch, Folder, ChevronDown, MousePointerClick, Camera, CheckCircle2, Filter, X, Info } from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useImportStore, ScannedFile } from '../../../stores/importStore';

export function ImportPreviewStep() {
  const { t } = useTranslation("help");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsHelpOpen(false);
      }
    };
    if (isHelpOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isHelpOpen]);
  const [selectedFile, setSelectedFile] = useState<ScannedFile | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const { scannedFiles, toggleFileSelection, toggleGroupSelection, hideImported } = useImportStore();

  const groupedFiles = useMemo(() => {
    const groups: Record<string, typeof scannedFiles> = {};
    const visibleFiles = hideImported ? scannedFiles.filter(f => !f.already_imported) : scannedFiles;
    
    for (const file of visibleFiles) {
      const dateKey = file.formatted_date ? file.formatted_date.split(' ')[0] : 'Unknown Date';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(file);
    }
    return groups;
  }, [scannedFiles, hideImported]);

  const selectedCount = scannedFiles.filter(f => f.selected).length;

  const CheckboxIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden p-6 gap-6 flex">
      {/* Left Panel: File Tree */}
      <div className="w-[420px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between flex-shrink-0 mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-txt-secondary" />
            <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Planned Import Structure</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-tertiary">{selectedCount} files selected</span>
            <div 
              className={`custom-checkbox cursor-pointer ${selectedCount === scannedFiles.length && scannedFiles.length > 0 ? 'checked' : ''}`}
              onClick={() => toggleGroupSelection(scannedFiles.map(f => f.path), selectedCount !== scannedFiles.length)}
            >
              {selectedCount === scannedFiles.length && scannedFiles.length > 0 && <CheckboxIcon />}
            </div>
          </div>
        </div>

        {/* Pre-import culling info bar */}
        <div className="flex items-center justify-between px-3 py-2 mb-2 bg-app-card border border-app-border rounded-lg flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3 h-3 text-txt-tertiary" />
            <span className="text-txt-secondary">Importing <span className="text-accent font-semibold">{selectedCount}</span> of {scannedFiles.length}</span>
          </div>
          <div className="text-[10px] text-txt-tertiary">Click ✗ to exclude files</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-app-card border border-app-border rounded-xl p-3 space-y-0.5">
          {Object.entries(groupedFiles).map(([date, files]) => {
            const allSelected = files.every(f => f.selected);
            return (
              <div key={date} className="tree-item">
                <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group">
                  <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary transition-transform duration-200" />
                  <div 
                    className={`custom-checkbox ${allSelected ? 'checked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupSelection(files.map(f => f.path), !allSelected);
                    }}
                  >
                    {allSelected && <CheckboxIcon />}
                  </div>
                  <Folder className="w-4 h-4 text-warning" />
                  <span className="text-sm text-txt-primary font-medium">{date}</span>
                  <span className="text-xs text-txt-tertiary ml-auto">{files.length} files</span>
                </div>
                <div className="ml-6 pl-3 border-l border-app-border space-y-0.5 mt-0.5">
                  {files.map((file) => (
                    <div 
                      key={file.path} 
                      className={`flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group ${selectedFile?.path === file.path ? 'bg-app-hover' : ''} ${file.already_imported ? 'opacity-50' : ''}`} 
                      onClick={() => { setSelectedFile(file); setIsZoomed(false); }}
                    >
                      <div 
                        className={`custom-checkbox ${file.selected ? 'checked' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.path); }}
                      >
                        {file.selected && <CheckboxIcon />}
                      </div>
                      <div className="w-7 h-5 rounded flex-shrink-0 flex items-center justify-center bg-app-deepest border border-app-border">
                        <span className="text-[8px] font-bold text-txt-tertiary">{file.name.split('.').pop()?.toUpperCase() || '?'}</span>
                      </div>
                      <span className="text-xs text-txt-primary truncate flex-1 flex items-center gap-1.5">
                        {file.name}
                        {file.already_imported && <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/20 text-success">Imported</span>}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.path); }}
                        className="w-4 h-4 rounded flex items-center justify-center text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100" 
                        title="Exclude from import"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] text-txt-tertiary ml-auto flex-shrink-0">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel: Metadata Inspector */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden pl-4">
        <div className="flex items-center justify-between flex-shrink-0 mb-3">
          <div className="flex items-center gap-2">
            <div className="relative" ref={popoverRef}>
              <button 
                className={`p-1.5 rounded-full transition-colors ${isHelpOpen ? 'bg-accent/20 text-accent' : 'text-txt-tertiary hover:text-txt-secondary hover:bg-app-hover'}`}
                onClick={() => setIsHelpOpen(!isHelpOpen)}
              >
                <Info className="w-4 h-4" />
              </button>
              {isHelpOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 bg-app-card border border-app-border rounded-xl shadow-2xl z-50 overflow-hidden text-left">
                  <div className="px-4 py-3 border-b border-app-border bg-app-panel/50">
                    <h4 className="text-sm font-semibold text-txt-primary">
                      {t('tooltip.inspectorTitle')}
                    </h4>
                  </div>
                  <div className="p-4 text-xs text-txt-secondary leading-relaxed">
                    {t('tooltip.inspector')}
                  </div>
                </div>
              )}
            </div>
            <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">File Inspector</h2>
          </div>
          {selectedFile && (
            <span className="text-[10px] text-txt-tertiary italic">Click picture to zoom</span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {selectedFile === null ? (
            /* Default: No file selected */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-4">
                <MousePointerClick className="w-7 h-7 text-txt-tertiary" />
              </div>
              <p className="text-sm text-txt-tertiary">Select a file from the tree to inspect its metadata</p>
            </div>
          ) : (
            /* File detail (shown on selection) */
            <div className="space-y-4">
              {/* Thumbnail */}
              <div 
                className={`w-full aspect-[3/2] rounded-xl overflow-hidden bg-app-deepest border border-app-border relative flex items-center justify-center group ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                onClick={() => setIsZoomed(!isZoomed)}
              >
                <img 
                  src={`rr-image://localhost${selectedFile.path}`} 
                  alt={selectedFile.name}
                  className={`${isZoomed ? 'w-full h-full object-contain' : 'max-w-full max-h-full object-contain'} ${selectedFile.already_imported ? 'opacity-50' : ''} transition-all duration-200`}
                  loading="lazy"
                  onError={(e) => {
                    // Fallback if image fails to load
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
                {/* Fallback gradient if img fails */}
                <div className="hidden flex-col items-center gap-2 w-full h-full justify-center" style={{ background: 'linear-gradient(135deg, #1a4a6e 0%, #2d7aac 50%, #1a6e5a 100%)' }}>
                  <Camera className="w-10 h-10 text-white/20" />
                  <span className="text-xs text-white/30 font-medium truncate px-4">{selectedFile.name}</span>
                </div>
              </div>

              {/* File info */}
              <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-txt-primary truncate">{selectedFile.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">
                    {selectedFile.name.split('.').pop()?.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-txt-tertiary">Size</span>
                    <p className="text-txt-primary font-medium">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary">Path</span>
                    <p className="text-txt-primary font-medium truncate" title={selectedFile.path}>{selectedFile.path.length > 30 ? '...' + selectedFile.path.slice(-30) : selectedFile.path}</p>
                  </div>
                </div>
              </div>

              {/* Date Sources */}
              <div className="bg-app-card border border-app-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-3">Date Sources</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-txt-secondary">Detected Date</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-txt-primary font-mono">{selectedFile.formatted_date || 'Unknown'}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Ensure Info is imported, we missed it earlier in the list above but I will just use what we have or add it.
