import { GitBranch, Folder, ChevronDown, MousePointerClick, Camera, CheckCircle2, Filter, X, Info } from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useImportStore, ScannedFile } from '../../../stores/importStore';

const RAW_EXTENSIONS = new Set(["cr2", "cr3", "arw", "nef", "dng", "orf", "raf", "rw2"]);
const JPG_EXTENSIONS = new Set(["jpg", "jpeg"]);

export interface PairedImportItem {
  id: string;
  stem: string;
  dir: string;
  files: ScannedFile[];
  rawFile?: ScannedFile;
  jpgFile?: ScannedFile;
  otherFile?: ScannedFile;
  previewFile: ScannedFile;
  totalSize: number;
  selected: boolean;
  partiallySelected: boolean;
  allImported: boolean;
  formatted_date: string | null;
}

export function ImportPreviewStep() {
  const { t } = useTranslation("import");
  const { t: tHelp } = useTranslation("help");
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

  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const { scannedFiles, toggleFileSelection, toggleGroupSelection, hideImported } = useImportStore();

  const toggleDateCollapse = (dateKey: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const groupedPairs = useMemo(() => {
    const visibleFiles = hideImported ? scannedFiles.filter(f => !f.already_imported) : scannedFiles;

    // 1. Group by date
    const dateGroups: Record<string, typeof scannedFiles> = {};
    for (const file of visibleFiles) {
      const dateKey = file.formatted_date ? file.formatted_date.split(' ')[0] : 'Unknown Date';
      if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
      dateGroups[dateKey].push(file);
    }

    // 2. Within each date, pair RAW + JPG by directory + stem
    const result: Record<string, PairedImportItem[]> = {};

    for (const [dateKey, filesInDate] of Object.entries(dateGroups)) {
      const pairMap = new Map<string, { raw?: ScannedFile; jpg?: ScannedFile; others: ScannedFile[] }>();

      for (const file of filesInDate) {
        const lastSlash = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'));
        const dir = lastSlash !== -1 ? file.path.substring(0, lastSlash) : '';
        const dotIdx = file.name.lastIndexOf('.');
        const stem = dotIdx !== -1 ? file.name.substring(0, dotIdx) : file.name;
        const ext = dotIdx !== -1 ? file.name.substring(dotIdx + 1).toLowerCase() : '';

        const pairKey = `${dir}:::${stem.toLowerCase()}`;
        if (!pairMap.has(pairKey)) {
          pairMap.set(pairKey, { others: [] });
        }
        const entry = pairMap.get(pairKey)!;
        if (RAW_EXTENSIONS.has(ext)) {
          entry.raw = file;
        } else if (JPG_EXTENSIONS.has(ext)) {
          entry.jpg = file;
        } else {
          entry.others.push(file);
        }
      }

      const pairs: PairedImportItem[] = [];
      for (const [pairKey, entry] of pairMap.entries()) {
        const [dir] = pairKey.split(':::');

        if (entry.raw && entry.jpg) {
          // RAW + JPG pair
          const files = [entry.raw, entry.jpg];
          const allSel = files.every(f => f.selected);
          const someSel = files.some(f => f.selected);
          const totalSize = entry.raw.size + entry.jpg.size;
          const allImp = entry.raw.already_imported && entry.jpg.already_imported;

          const dotIdx = entry.raw.name.lastIndexOf('.');
          const stem = dotIdx !== -1 ? entry.raw.name.substring(0, dotIdx) : entry.raw.name;

          pairs.push({
            id: pairKey,
            stem,
            dir,
            files,
            rawFile: entry.raw,
            jpgFile: entry.jpg,
            previewFile: entry.jpg, // Use fast companion JPG for previews!
            totalSize,
            selected: allSel,
            partiallySelected: someSel && !allSel,
            allImported: allImp,
            formatted_date: entry.jpg.formatted_date || entry.raw.formatted_date,
          });
        } else if (entry.raw) {
          // RAW only
          const dotIdx = entry.raw.name.lastIndexOf('.');
          const stem = dotIdx !== -1 ? entry.raw.name.substring(0, dotIdx) : entry.raw.name;
          pairs.push({
            id: pairKey,
            stem,
            dir,
            files: [entry.raw],
            rawFile: entry.raw,
            previewFile: entry.raw,
            totalSize: entry.raw.size,
            selected: entry.raw.selected,
            partiallySelected: false,
            allImported: entry.raw.already_imported,
            formatted_date: entry.raw.formatted_date,
          });
        } else if (entry.jpg) {
          // JPG only
          const dotIdx = entry.jpg.name.lastIndexOf('.');
          const stem = dotIdx !== -1 ? entry.jpg.name.substring(0, dotIdx) : entry.jpg.name;
          pairs.push({
            id: pairKey,
            stem,
            dir,
            files: [entry.jpg],
            jpgFile: entry.jpg,
            previewFile: entry.jpg,
            totalSize: entry.jpg.size,
            selected: entry.jpg.selected,
            partiallySelected: false,
            allImported: entry.jpg.already_imported,
            formatted_date: entry.jpg.formatted_date,
          });
        }

        // Other files (video etc.)
        for (const other of entry.others) {
          pairs.push({
            id: other.path,
            stem: other.name,
            dir,
            files: [other],
            otherFile: other,
            previewFile: other,
            totalSize: other.size,
            selected: other.selected,
            partiallySelected: false,
            allImported: other.already_imported,
            formatted_date: other.formatted_date,
          });
        }
      }

      result[dateKey] = pairs;
    }

    return result;
  }, [scannedFiles, hideImported]);

  // Flatten all pairs for lookup
  const allPairs = useMemo(() => {
    return Object.values(groupedPairs).flat();
  }, [groupedPairs]);

  const selectedPair = useMemo(() => {
    if (!selectedPairId) return null;
    return allPairs.find(p => p.id === selectedPairId) || null;
  }, [selectedPairId, allPairs]);

  const selectedFilesCount = scannedFiles.filter(f => f.selected).length;
  const totalPhotosCount = allPairs.length;
  const selectedPhotosCount = allPairs.filter(p => p.selected || p.partiallySelected).length;

  const CheckboxIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden p-6 gap-6 flex">
      {/* Left Panel: File Tree */}
      <div className="w-[440px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between flex-shrink-0 mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-txt-secondary" />
            <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">Planned Import Structure</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-tertiary">{selectedFilesCount} of {scannedFiles.length} files</span>
            <div 
              className={`custom-checkbox cursor-pointer ${selectedFilesCount === scannedFiles.length && scannedFiles.length > 0 ? 'checked' : ''}`}
              onClick={() => toggleGroupSelection(scannedFiles.map(f => f.path), selectedFilesCount !== scannedFiles.length)}
            >
              {selectedFilesCount === scannedFiles.length && scannedFiles.length > 0 && <CheckboxIcon />}
            </div>
          </div>
        </div>

        {/* Pre-import culling info bar */}
        <div className="flex items-center justify-between px-3 py-2 mb-2 bg-app-card border border-app-border rounded-lg flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3 h-3 text-txt-tertiary" />
            <span className="text-txt-secondary">
              Importing <span className="text-accent font-semibold">{selectedPhotosCount}</span> of {totalPhotosCount} photos ({selectedFilesCount} files)
            </span>
          </div>
          <div className="text-[10px] text-txt-tertiary">Click ✗ to exclude</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-app-card border border-app-border rounded-xl p-3 space-y-0.5">
          {Object.entries(groupedPairs).map(([date, pairs]) => {
            const allSelected = pairs.every(p => p.selected);
            const isCollapsed = collapsedDates.has(date);
            const allFilesForDate = pairs.flatMap(p => p.files);

            return (
              <div key={date} className="tree-item">
                <div 
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group select-none"
                  onClick={() => toggleDateCollapse(date)}
                >
                  <ChevronDown className={`w-3.5 h-3.5 text-txt-tertiary transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                  <div 
                    className={`custom-checkbox ${allSelected ? 'checked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupSelection(allFilesForDate.map(f => f.path), !allSelected);
                    }}
                  >
                    {allSelected && <CheckboxIcon />}
                  </div>
                  <Folder className="w-4 h-4 text-warning" />
                  <span className="text-sm text-txt-primary font-medium">{date}</span>
                  <span className="text-xs text-txt-tertiary ml-auto">
                    {pairs.length === 1 ? t('preview.photoCountSingle', { count: 1 }) : t('preview.photosCount', { count: pairs.length })}
                  </span>
                </div>
                {!isCollapsed && (
                  <div className="ml-6 pl-3 border-l border-app-border space-y-0.5 mt-0.5">
                  {pairs.map((pair) => (
                    <div 
                      key={pair.id} 
                      className={`flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group ${selectedPairId === pair.id ? 'bg-app-hover' : ''} ${pair.allImported ? 'opacity-50' : ''}`} 
                      onClick={() => { setSelectedPairId(pair.id); setIsZoomed(false); }}
                    >
                      {/* Pair Master Checkbox */}
                      <div 
                        className={`custom-checkbox ${pair.selected ? 'checked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupSelection(pair.files.map(f => f.path), !pair.selected);
                        }}
                      >
                        {pair.selected && <CheckboxIcon />}
                        {!pair.selected && pair.partiallySelected && (
                          <div className="w-2 h-0.5 bg-accent rounded" />
                        )}
                      </div>

                      {/* Filename Stem */}
                      <span className="text-xs text-txt-primary truncate flex-1 font-medium" title={pair.stem}>
                        {pair.stem}
                      </span>

                      {/* Badges: Dual badges for RAW + JPG or single badge */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {pair.rawFile && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFileSelection(pair.rawFile!.path);
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-tight transition-all cursor-pointer ${
                              pair.rawFile.selected
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                : 'bg-app-deepest text-txt-tertiary line-through opacity-40 border border-app-border hover:opacity-75'
                            }`}
                            title={t('preview.toggleRaw', { ext: pair.rawFile.name.split('.').pop()?.toUpperCase() || 'RAW' })}
                          >
                            {pair.rawFile.name.split('.').pop()?.toUpperCase() || 'RAW'}
                          </button>
                        )}
                        {pair.jpgFile && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFileSelection(pair.jpgFile!.path);
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-tight transition-all cursor-pointer ${
                              pair.jpgFile.selected
                                ? 'bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30'
                                : 'bg-app-deepest text-txt-tertiary line-through opacity-40 border border-app-border hover:opacity-75'
                            }`}
                            title={t('preview.toggleJpg')}
                          >
                            JPG
                          </button>
                        )}
                        {pair.otherFile && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-tight bg-app-deepest text-txt-tertiary border border-app-border">
                            {pair.otherFile.name.split('.').pop()?.toUpperCase() || '?'}
                          </span>
                        )}
                      </div>

                      {/* Imported Tag */}
                      {pair.allImported && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/20 text-success flex-shrink-0">
                          {t('preview.importedBadge')}
                        </span>
                      )}

                      {/* Exclude Button */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupSelection(pair.files.map(f => f.path), false);
                        }}
                        className="w-4 h-4 rounded flex items-center justify-center text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100" 
                        title={t('preview.excludePhoto')}
                      >
                        <X className="w-3 h-3" />
                      </button>

                      {/* Combined File Size */}
                      <span className="text-[10px] text-txt-tertiary ml-auto flex-shrink-0">
                        {(pair.totalSize / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  ))}
                  </div>
                )}
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
                      {tHelp('tooltip.inspectorTitle')}
                    </h4>
                  </div>
                  <div className="p-4 text-xs text-txt-secondary leading-relaxed">
                    {tHelp('tooltip.inspector')}
                  </div>
                </div>
              )}
            </div>
            <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">{t('preview.fileInspector')}</h2>
          </div>
          {selectedPair && (
            <span className="text-[10px] text-txt-tertiary italic">{t('preview.clickToZoom')}</span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {selectedPair === null ? (
            /* Default: No photo selected */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-4">
                <MousePointerClick className="w-7 h-7 text-txt-tertiary" />
              </div>
              <p className="text-sm text-txt-tertiary">{t('preview.selectPhotoHint')}</p>
            </div>
          ) : (
            /* Photo detail */
            <div className="space-y-4">
              {/* Thumbnail (uses companion JPG for instant rendering!) */}
              <div 
                className={`w-full aspect-[3/2] rounded-xl overflow-hidden bg-app-deepest border border-app-border relative flex items-center justify-center group ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                onClick={() => setIsZoomed(!isZoomed)}
              >
                <img 
                  src={`rr-image://localhost${selectedPair.previewFile.path}`} 
                  alt={selectedPair.stem}
                  className={`${isZoomed ? 'w-full h-full object-contain' : 'max-w-full max-h-full object-contain'} ${selectedPair.allImported ? 'opacity-50' : ''} transition-all duration-200`}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
                <div className="hidden flex-col items-center gap-2 w-full h-full justify-center" style={{ background: 'linear-gradient(135deg, #1a4a6e 0%, #2d7aac 50%, #1a6e5a 100%)' }}>
                  <Camera className="w-10 h-10 text-white/20" />
                  <span className="text-xs text-white/30 font-medium truncate px-4">{selectedPair.stem}</span>
                </div>
              </div>

              {/* Photo info */}
              <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-txt-primary truncate">{selectedPair.stem}</span>
                  <div className="flex items-center gap-1.5">
                    {selectedPair.rawFile && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium font-mono">
                        {selectedPair.rawFile.name.split('.').pop()?.toUpperCase()}
                      </span>
                    )}
                    {selectedPair.jpgFile && (
                      <span className="text-xs px-2 py-0.5 rounded bg-accent/15 text-accent font-medium font-mono">
                        JPG
                      </span>
                    )}
                    {selectedPair.rawFile && selectedPair.jpgFile && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-deepest text-txt-tertiary border border-app-border">
                        {t('preview.pairBadge')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-txt-tertiary">Total Size</span>
                    <p className="text-txt-primary font-medium">{(selectedPair.totalSize / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary">Directory</span>
                    <p className="text-txt-primary font-medium truncate" title={selectedPair.dir}>
                      {selectedPair.dir.length > 25 ? '...' + selectedPair.dir.slice(-25) : selectedPair.dir}
                    </p>
                  </div>
                </div>

                {/* Individual format breakdown for RAW + JPG */}
                {selectedPair.rawFile && selectedPair.jpgFile && (
                  <div className="border-t border-app-border pt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center justify-between pr-2 border-r border-app-border">
                      <span className="text-txt-secondary font-mono">{selectedPair.rawFile.name.split('.').pop()?.toUpperCase()} RAW:</span>
                      <span className="font-medium text-txt-primary">{(selectedPair.rawFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                    <div className="flex items-center justify-between pl-2">
                      <span className="text-txt-secondary font-mono">JPEG:</span>
                      <span className="font-medium text-txt-primary">{(selectedPair.jpgFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Date Sources */}
              <div className="bg-app-card border border-app-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-3">Date Sources</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-txt-secondary">Detected Date</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-txt-primary font-mono">{selectedPair.formatted_date || 'Unknown'}</span>
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
