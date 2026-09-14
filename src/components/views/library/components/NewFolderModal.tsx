import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FolderPlus, X, Loader2 } from 'lucide-react';

export interface NewFolderModalProps {
  isOpen: boolean;
  parentPath: string;
  parentName: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({
  isOpen,
  parentName,
  onClose,
  onCreate,
}) => {
  const { t } = useTranslation('library');
  const [folderName, setFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const defaultName = t('folderMenu.createFolderDefault', 'Neuer Ordner');
      setFolderName(defaultName);
      setError(null);
      setIsSubmitting(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, t]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed) {
      setError(t('folderMenu.createFolderPrompt', 'Bitte gib einen Ordnernamen ein.'));
      return;
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      setError('Der Ordnername darf keine Schrägstriche (/ oder \\) enthalten.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmed);
      onClose();
    } catch (err: any) {
      setError(String(err?.message || err || 'Fehler beim Erstellen des Ordners'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div 
        className="w-full max-w-sm bg-[#18181b] border border-app-border rounded-2xl shadow-2xl p-5 text-txt-primary flex flex-col gap-4 animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center text-accent flex-shrink-0">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">
                {t('folderMenu.createFolderTitle', 'Neuer Unterordner')}
              </h3>
              <p className="text-xs text-txt-tertiary truncate max-w-[220px]" title={parentName}>
                in «{parentName}»
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">
              {t('folderMenu.createFolderPrompt', 'Name für den neuen Unterordner:')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-app-card border border-app-border rounded-xl text-xs text-txt-primary placeholder-txt-tertiary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
            />
            {error && (
              <p className="text-xs text-danger mt-1.5 leading-tight">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-txt-secondary hover:text-txt-primary hover:bg-white/5 transition-colors cursor-pointer"
            >
              {t('folderDelete.cancel', 'Abbrechen')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !folderName.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-accent hover:bg-accent/90 text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
            >
              {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{t('folderMenu.createBtn', 'Erstellen')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
