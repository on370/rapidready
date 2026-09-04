import { useEffect } from "react";
import { 
  Info, X, MousePointerClick, Star, Check 
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "../../../stores/libraryStore";
import { invoke } from "@tauri-apps/api/core";

interface LibraryInspectorProps {
  close: () => void;
}

export function LibraryInspector({ close }: LibraryInspectorProps) {
  const { t } = useTranslation('library');
  const { 
    images, activeImageIndex, 
    updateCullingState, updateImageMetadata, activeFolderPath, 
    lastImportPaths, isViewingLastImport 
  } = useLibraryStore();

  const scopedImages = isViewingLastImport
    ? images.filter(img => lastImportPaths.includes(img.path))
    : activeFolderPath 
      ? images.filter(img => img.path.startsWith(activeFolderPath)) 
      : images;

  const activeImage = scopedImages[activeImageIndex];

  // Lazy-load detailed EXIF metadata when an image is selected
  useEffect(() => {
    if (!activeImage) return;
    if (activeImage.camera === undefined || activeImage.camera === null) {
      let isMounted = true;
      invoke<{
        date: string | null;
        camera: string | null;
        lens: string | null;
        iso: string | null;
        aperture: string | null;
        shutter: string | null;
      }>('get_image_metadata', { path: activeImage.path })
        .then(meta => {
          if (isMounted && meta) {
            updateImageMetadata(activeImage.path, {
              camera: meta.camera || null,
              lens: meta.lens || null,
              iso: meta.iso || null,
              aperture: meta.aperture || null,
              shutter: meta.shutter || null,
              date: meta.date || activeImage.date,
            });
          }
        })
        .catch(console.error);

      return () => { isMounted = false; };
    }
  }, [activeImage?.path, updateImageMetadata]);

  const handleCulling = (flag: number | null, rating: number) => {
    if (!activeImage) return;
    const globalIndex = images.findIndex(img => img.path === activeImage.path);
    if (globalIndex !== -1) updateCullingState(globalIndex, { flag, rating });
    invoke('set_culling_state', { 
      path: activeImage.path, 
      flag, 
      rating, 
      color: activeImage.culling.color 
    }).catch(console.error);
  };

  const extension = activeImage?.name.split('.').pop()?.toUpperCase() || '';
  const isRaw = ['CR2', 'CR3', 'ARW', 'NEF', 'DNG', 'ORF', 'RAF', 'RW2'].includes(extension);

  return (
    <div className="w-[300px] flex-shrink-0 border-l border-app-border bg-app-panel flex flex-col min-h-0 overflow-hidden">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          {t('inspector.title')}
        </h2>
        <button className="p-1 rounded hover:bg-app-hover transition-colors cursor-pointer" onClick={close}>
          <X className="w-3.5 h-3.5 text-txt-tertiary" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!activeImage ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-3">
              <MousePointerClick className="w-6 h-6 text-txt-tertiary" />
            </div>
            <p className="text-sm font-semibold text-txt-primary">{t('inspector.noSelection')}</p>
            <p className="text-xs text-txt-tertiary mt-1 max-w-[200px]">{t('inspector.noSelectionDesc')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Live Thumbnail Preview */}
            <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border border-app-border bg-app-deepest group">
              <img 
                src={`rr-image://localhost${activeImage.path}`} 
                alt={activeImage.name} 
                className="w-full h-full object-cover" 
              />
              <div className="absolute top-2 right-2 flex gap-1.5">
                {activeImage.culling.flag === 1 && (
                  <span className="w-5 h-5 rounded-full bg-success flex items-center justify-center shadow">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
                {activeImage.culling.flag === -1 && (
                  <span className="w-5 h-5 rounded-full bg-danger flex items-center justify-center text-xs font-bold text-white shadow">
                    X
                  </span>
                )}
              </div>
              <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[11px] font-mono text-white">
                <span className={isRaw ? "text-accent font-semibold" : "text-txt-secondary"}>{extension}</span>
                <span className="text-white/40">·</span>
                <span>{(activeImage.size / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            </div>

            {/* Interactive Culling Card */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
              <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('inspector.culling')}</h3>
              
              {/* Flag Row */}
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handleCulling(1, activeImage.culling.rating)} 
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all border cursor-pointer ${activeImage.culling.flag === 1 ? 'bg-success text-white border-success' : 'border-app-border hover:bg-success/15 text-txt-secondary'}`}
                  title={t('inspector.pick')}
                >
                  <Check className="w-3 h-3" />
                  <span>Pick</span>
                  <kbd className="text-[9px] opacity-70 font-mono">P</kbd>
                </button>

                <button 
                  onClick={() => handleCulling(null, activeImage.culling.rating)} 
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-all border cursor-pointer ${activeImage.culling.flag === null ? 'bg-app-hover text-txt-primary border-app-border' : 'border-app-border hover:bg-app-hover text-txt-tertiary'}`}
                  title={t('inspector.unflag')}
                >
                  <span>Unflag</span>
                  <kbd className="text-[9px] opacity-70 font-mono">U</kbd>
                </button>

                <button 
                  onClick={() => handleCulling(-1, activeImage.culling.rating)} 
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all border cursor-pointer ${activeImage.culling.flag === -1 ? 'bg-danger text-white border-danger' : 'border-app-border hover:bg-danger/15 text-txt-secondary'}`}
                  title={t('inspector.reject')}
                >
                  <span>Reject</span>
                  <kbd className="text-[9px] opacity-70 font-mono">X</kbd>
                </button>
              </div>

              {/* Stars Row */}
              <div className="flex items-center justify-center gap-2 pt-1 border-t border-app-border/50">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button 
                    key={star}
                    onClick={() => handleCulling(activeImage.culling.flag, activeImage.culling.rating === star ? 0 : star)}
                    className="p-1 hover:scale-115 transition-transform cursor-pointer"
                    title={`${star} ★`}
                  >
                    <Star className={`w-4 h-4 ${activeImage.culling.rating >= star ? 'text-warning fill-warning' : 'text-txt-tertiary hover:text-warning/50'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* File Info */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-app-border/50 pb-1.5">
                <span className="text-xs font-semibold text-txt-primary truncate mr-2" title={activeImage.name}>{activeImage.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${isRaw ? 'bg-accent/15 text-accent' : 'bg-app-panel text-txt-secondary'}`}>
                  {extension}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.size')}</span>
                  <p className="text-txt-primary font-medium">{(activeImage.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.date')}</span>
                  <p className="text-txt-primary font-medium truncate" title={activeImage.date || '—'}>
                    {activeImage.date ? activeImage.date.replace('T', ' ').substring(0, 19) : '—'}
                  </p>
                </div>
              </div>
              <div className="pt-1 border-t border-app-border/40">
                <span className="text-txt-tertiary block text-[10px]">{t('inspector.path')}</span>
                <p className="text-txt-secondary font-mono text-[10px] truncate" title={activeImage.path}>
                  {activeImage.path}
                </p>
              </div>
            </div>

            {/* Camera & Exposure Info */}
            <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
              <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('inspector.camera')}</h3>
              <div className="space-y-2 text-[11px]">
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.body')}</span>
                  <p className="text-txt-primary font-medium truncate" title={activeImage.camera || '—'}>
                    {activeImage.camera || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-txt-tertiary block text-[10px]">{t('inspector.lens')}</span>
                  <p className="text-txt-primary font-medium truncate" title={activeImage.lens || '—'}>
                    {activeImage.lens || '—'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-app-border/40">
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.iso')}</span>
                    <p className="text-txt-primary font-mono font-medium">{activeImage.iso ? `ISO ${activeImage.iso}` : '—'}</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.aperture')}</span>
                    <p className="text-txt-primary font-mono font-medium">{activeImage.aperture || '—'}</p>
                  </div>
                  <div>
                    <span className="text-txt-tertiary block text-[10px]">{t('inspector.shutter')}</span>
                    <p className="text-txt-primary font-mono font-medium">{activeImage.shutter || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

