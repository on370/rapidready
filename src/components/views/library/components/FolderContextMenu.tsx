import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { 
  FolderOpen, CheckSquare, ChevronDown, ChevronRight, 
  FolderPlus, Trash2, XCircle, Pencil 
} from 'lucide-react';
import { isMac } from '../../../../utils/platform';

export interface FolderContextMenuProps {
  x: number;
  y: number;
  isMultiSelect?: boolean;
  folderCount?: number;
  nodePath: string;
  nodeName: string;
  isRoot: boolean;
  hasChildren: boolean;
  fileCount: number;
  hasRejectedPhotos?: boolean;
  rejectedCount?: number;
  onClose: () => void;
  onShowInFinder: () => void;
  onSelectAllInFolder: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onNewSubfolder?: () => void;
  onRenameFolder?: () => void;
  onDeleteRejectedInFolder?: () => void;
  onDeleteFolder: () => void;
}

export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  x,
  y,
  isMultiSelect = false,
  folderCount = 1,
  nodeName,
  isRoot,
  hasChildren,
  fileCount,
  hasRejectedPhotos = false,
  rejectedCount = 0,
  onClose,
  onShowInFinder,
  onSelectAllInFolder,
  onExpandAll,
  onCollapseAll,
  onNewSubfolder,
  onRenameFolder,
  onDeleteRejectedInFolder,
  onDeleteFolder,
}) => {
  const { t } = useTranslation('library');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const menuWidth = 260;
  const menuHeight = 280;
  const adjX = x + menuWidth > window.innerWidth - 10
    ? Math.max(10, x - menuWidth)
    : Math.max(10, x);
  const adjY = y + menuHeight > window.innerHeight - 10
    ? Math.max(10, y - menuHeight)
    : Math.max(10, y);

  const headerTitle = isMultiSelect 
    ? t('folderMenu.multiHeader', { count: folderCount, defaultValue: `${folderCount} ausgewählte Ordner` })
    : nodeName;

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: adjX, top: adjY }}
      className="fixed z-[9999] w-64 bg-[#161619]/95 backdrop-blur-md border border-app-border rounded-xl shadow-2xl py-1.5 text-xs text-txt-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header with folder name / count */}
      <div className="px-3 py-1.5 text-[11px] font-semibold text-txt-tertiary border-b border-app-border mb-1 flex items-center justify-between">
        <span className="truncate max-w-[170px]" title={headerTitle}>{headerTitle}</span>
        <span className="font-mono text-[10px] text-txt-tertiary flex-shrink-0">
          ({fileCount} {fileCount === 1 ? 'Foto' : 'Fotos'})
        </span>
      </div>

      <div className="px-1 py-0.5 space-y-0.5">
        {/* Show in Finder / Explorer (Only for single-tree / single-folder context) */}
        {!isMultiSelect && onShowInFinder && (
          <button
            onClick={() => { onShowInFinder(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-left"
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="truncate">
              {isMac ? t('folderMenu.showInFinder', 'Im Finder anzeigen') : t('folderMenu.showInExplorer', 'Im Explorer anzeigen')}
            </span>
          </button>
        )}

        {/* Select all images in folder / multi folders */}
        {fileCount > 0 && (
          <button
            onClick={() => { onSelectAllInFolder(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-left"
          >
            <CheckSquare className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="truncate">
              {isMultiSelect
                ? t('folderMenu.selectAllInMultiFolders', { count: folderCount, defaultValue: `Alle Fotos in den ${folderCount} Ordnern auswählen` })
                : t('folderMenu.selectAllImages', 'Alle Bilder in diesem Ordner auswählen')}
            </span>
          </button>
        )}

        {/* Expand / Collapse all subfolders if node has children */}
        {hasChildren && onExpandAll && (
          <button
            onClick={() => { onExpandAll(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-left"
          >
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
            <span className="truncate">
              {isMultiSelect
                ? t('folderMenu.expandSelectedSubfolders', 'Ausgewählte Ordner aufklappen')
                : t('folderMenu.expandSubfolders', 'Alle Unterordner aufklappen')}
            </span>
          </button>
        )}

        {hasChildren && onCollapseAll && (
          <button
            onClick={() => { onCollapseAll(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-left"
          >
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
            <span className="truncate">
              {isMultiSelect
                ? t('folderMenu.collapseSelectedSubfolders', 'Ausgewählte Ordner einklappen')
                : t('folderMenu.collapseSubfolders', 'Alle Unterordner einklappen')}
            </span>
          </button>
        )}
      </div>

      {((!isMultiSelect && (onNewSubfolder || (!isRoot && onRenameFolder))) || (hasRejectedPhotos && onDeleteRejectedInFolder)) && (
        <>
          <div className="h-px bg-app-border my-1" />
          <div className="px-1 py-0.5 space-y-0.5">
            {/* New subfolder (Only in single-folder / single-tree context) */}
            {!isMultiSelect && onNewSubfolder && (
              <button
                onClick={() => { onNewSubfolder(); onClose(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-left"
              >
                <FolderPlus className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="truncate">
                  {t('folderMenu.newSubfolderIn', { name: nodeName, defaultValue: `Neuer Unterordner in „${nodeName}“...` })}
                </span>
              </button>
            )}

            {/* Rename folder (Only in single-folder context, not root) */}
            {!isMultiSelect && !isRoot && onRenameFolder && (
              <button
                onClick={() => { onRenameFolder(); onClose(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-txt-secondary hover:text-white transition-colors cursor-pointer text-left"
              >
                <Pencil className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="truncate">
                  {t('folderMenu.renameFolder', 'Ordner umbenennen...')}
                </span>
              </button>
            )}

            {/* Delete rejected photos in folder shortcut */}
            {hasRejectedPhotos && onDeleteRejectedInFolder && (
              <button
                onClick={() => { onDeleteRejectedInFolder(); onClose(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-danger/20 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer text-left"
              >
                <XCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="truncate">
                  {isMultiSelect
                    ? t('folderMenu.deleteRejectedInMultiFolders', { count: rejectedCount, defaultValue: `Nur verworfene Bilder (${rejectedCount}) in Auswahl löschen...` })
                    : t('folderMenu.deleteRejectedInFolder', 'Nur verworfene Bilder (X) löschen...')}
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Delete Folder(s) (Destructive action) */}
      {!isRoot && (
        <>
          <div className="h-px bg-app-border my-1" />
          <div className="px-1 py-0.5">
            <button
              onClick={() => { onDeleteFolder(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-danger/20 text-danger hover:text-red-300 transition-colors cursor-pointer text-left font-medium"
            >
              <Trash2 className="w-3.5 h-3.5 text-danger flex-shrink-0" />
              <span className="truncate">
                {isMultiSelect
                  ? t('folderMenu.deleteMultiFolders', { count: folderCount, defaultValue: `${folderCount} ausgewählte Ordner löschen...` })
                  : t('folderMenu.deleteFolder', 'Ordner löschen...')}
              </span>
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
};
