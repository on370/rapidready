import { useState, useEffect } from 'react';
import { HardDrive, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '../../../../stores/libraryStore';

export function ArchiveConnectingOverlay() {
  const { t } = useTranslation('library');
  const isLoading = useLibraryStore((s) => s.isLoading);
  const images = useLibraryStore((s) => s.images);
  const rootPath = useLibraryStore((s) => s.rootPath);
  const cancelScan = useLibraryStore((s) => s.cancelScan);
  const scanState = useLibraryStore((s) => s.scanState);

  const [visible, setVisible] = useState(false);

  // 300ms debounce: only show overlay if loading takes longer than 300ms and no images yet
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isLoading && images.length === 0 && (scanState === 'connecting' || scanState === 'scanning')) {
      timer = setTimeout(() => {
        setVisible(true);
      }, 300);
    } else {
      setVisible(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, images.length, scanState]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-app-panel border border-app-border rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4">
        {/* Pulsing Server / Drive Icon */}
        <div className="relative w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <HardDrive className="w-8 h-8 text-accent animate-pulse" />
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-app-panel border border-app-border">
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
          </div>
        </div>

        {/* Status Texts */}
        <div className="space-y-1.5 w-full">
          <h3 className="text-sm font-semibold text-txt-primary">
            {t('loading.connectingTitle', 'Verbindung zum Archiv wird hergestellt...')}
          </h3>
          <p className="text-xs text-txt-secondary font-mono truncate px-3 py-1 bg-app-card rounded-lg border border-app-border" title={rootPath || ''}>
            {rootPath || '—'}
          </p>
          <p className="text-[11px] text-txt-tertiary leading-relaxed pt-1">
            {t('loading.connectingDesc', 'Warte auf Dateisystem (bei Netzwerkfreigaben/NAS kann das Aufwecken einige Sekunden dauern)...')}
          </p>
        </div>

        {/* Cancel Button */}
        <button
          onClick={cancelScan}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-app-card hover:bg-app-hover border border-app-border hover:border-app-border-hover text-xs font-medium text-txt-secondary hover:text-txt-primary transition-all cursor-pointer shadow-sm"
        >
          <X className="w-3.5 h-3.5" />
          <span>{t('loading.cancel', 'Abbrechen')}</span>
        </button>
      </div>
    </div>
  );
}
