import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, FolderPlus, Trash2, X } from 'lucide-react';

export interface TempLocationCollectionsModalProps {
  isOpen: boolean;
  folderName: string;
  collectionsCount: number;
  onSaveAsLocation: () => void;
  onDiscardCollections: () => void;
  onCancel: () => void;
}

export const TempLocationCollectionsModal: React.FC<TempLocationCollectionsModalProps> = ({
  isOpen,
  folderName,
  collectionsCount,
  onSaveAsLocation,
  onDiscardCollections,
  onCancel,
}) => {
  const { t } = useTranslation('library');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const descText =
    collectionsCount === 1
      ? t('collections.tempLocationModalDesc_one', {
          name: folderName,
          defaultValue: `Du hast im temporären Ordner „${folderName}“ 1 Sammlung angelegt. Möchtest du diesen Ordner als feste Bibliothek speichern, damit deine Sammlungen dauerhaft erhalten bleiben?`,
        })
      : t('collections.tempLocationModalDesc_other', {
          name: folderName,
          count: collectionsCount,
          defaultValue: `Du hast im temporären Ordner „${folderName}“ ${collectionsCount} Sammlungen angelegt. Möchtest du diesen Ordner als feste Bibliothek speichern, damit deine Sammlungen dauerhaft erhalten bleiben?`,
        });

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div
        className="w-full max-w-md bg-[#18181b] border border-app-border rounded-2xl shadow-2xl p-5 text-txt-primary flex flex-col gap-4 animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent flex-shrink-0">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">
                {t('collections.tempLocationModalTitle', 'Sammlungen in temporärem Ordner behalten?')}
              </h3>
              <p className="text-xs text-txt-tertiary truncate max-w-[280px]" title={folderName}>
                «{folderName}» ({collectionsCount === 1 ? '1 Sammlung' : `${collectionsCount} Sammlungen`})
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-txt-secondary leading-relaxed whitespace-pre-line">
          {descText}
        </p>

        <div className="flex flex-col gap-2 pt-2 border-t border-app-border/60">
          <button
            onClick={onSaveAsLocation}
            className="w-full py-2.5 px-3 rounded-xl text-xs bg-accent text-white font-medium hover:bg-accent/90 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 flex-shrink-0" />
            <span>{t('collections.saveAsLocation', 'Als Bibliothek speichern')}</span>
          </button>

          <button
            onClick={onDiscardCollections}
            className="w-full py-2 px-3 rounded-xl text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer font-medium"
          >
            <Trash2 className="w-4 h-4 flex-shrink-0" />
            <span>{t('collections.discardCollections', 'Sammlungen verwerfen')}</span>
          </button>

          <button
            onClick={onCancel}
            className="w-full py-1.5 px-3 rounded-xl text-xs hover:bg-app-hover text-txt-tertiary hover:text-txt-secondary transition-colors cursor-pointer"
          >
            {t('collections.cancel', 'Abbrechen')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
