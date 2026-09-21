import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BookmarkPlus, Bookmark, ChevronRight, Plus } from 'lucide-react';
import { useCollectionsStore, AlbumItem } from '../../../../stores/collectionsStore';

function getFlatAlbums(nodes: AlbumItem[], prefix = ''): Array<{ id: string; name: string; count: number }> {
  const list: Array<{ id: string; name: string; count: number }> = [];
  for (const node of nodes) {
    if (node.type === 'album') {
      list.push({
        id: node.id,
        name: prefix ? `${prefix} / ${node.name}` : node.name,
        count: node.images.length,
      });
    } else if (node.type === 'group' && node.children) {
      list.push(...getFlatAlbums(node.children, prefix ? `${prefix} / ${node.name}` : node.name));
    }
  }
  return list;
}

export interface LastImportContextMenuProps {
  x: number;
  y: number;
  itemCount: number;
  onClose: () => void;
  onAddToCollection: (albumId: string) => void;
  onCreateCollectionAndAdd: (name: string) => void;
}

export const LastImportContextMenu: React.FC<LastImportContextMenuProps> = ({
  x,
  y,
  itemCount,
  onClose,
  onAddToCollection,
  onCreateCollectionAndAdd,
}) => {
  const { t } = useTranslation('library');
  const menuRef = useRef<HTMLDivElement>(null);
  const collectionsTree = useCollectionsStore((s) => s.collectionsTree);
  const flatAlbums = useMemo(() => getFlatAlbums(collectionsTree), [collectionsTree]);

  const [openSubmenu, setOpenSubmenu] = useState<boolean>(true);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newCollectionInput, setNewCollectionInput] = useState('');

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClick, { capture: true });
    return () => window.removeEventListener('mousedown', handleClick, { capture: true });
  }, [onClose]);

  // Adjust menu position so it stays inside the viewport
  const menuWidth = 230;
  const menuHeight = 240;
  const adjX = Math.min(x, window.innerWidth - menuWidth - 20);
  const adjY = Math.min(y, window.innerHeight - menuHeight - 20);

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: `${adjX}px`, top: `${adjY}px` }}
      className="fixed z-[9999] w-64 bg-[#18181c]/95 backdrop-blur-md border border-app-border rounded-xl shadow-2xl py-1.5 text-xs text-txt-primary select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      <div className="px-3 py-1.5 text-[11px] font-medium text-txt-tertiary border-b border-app-border/50 mb-1">
        {t('sidebar.lastImportCount', {
          count: itemCount,
          defaultValue: `Letzter Import (${itemCount} Fotos)`
        })}
      </div>

      <div className="px-1 relative">
        <button
          onClick={() => setOpenSubmenu(prev => !prev)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2 truncate">
            <BookmarkPlus className="w-3.5 h-3.5 text-accent group-hover:text-white flex-shrink-0" />
            <span className="truncate">{t('collections.addToCollection', { defaultValue: 'Zu Sammlung hinzufügen' })}</span>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 text-txt-tertiary group-hover:text-white transition-transform ${openSubmenu ? 'rotate-90' : ''}`} />
        </button>

        {openSubmenu && (
          <div className="mt-1 pt-1 border-t border-app-border/40 pl-1 space-y-1">
            {/* Inline creation option */}
            {isCreatingInline ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newCollectionInput.trim()) {
                    onCreateCollectionAndAdd(newCollectionInput.trim());
                    onClose();
                  }
                }}
                className="px-2 py-1 flex flex-col gap-1.5"
              >
                <input
                  type="text"
                  autoFocus
                  placeholder={t('collections.newCollectionName', { defaultValue: 'Name der Sammlung...' })}
                  value={newCollectionInput}
                  onChange={(e) => setNewCollectionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setIsCreatingInline(false);
                    }
                  }}
                  className="w-full px-2 py-1 rounded bg-[#101012] border border-accent text-xs text-txt-primary focus:outline-none"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingInline(false)}
                    className="px-2 py-0.5 rounded text-[11px] text-txt-tertiary hover:text-txt-primary cursor-pointer"
                  >
                    {t('collections.cancel', { defaultValue: 'Abbrechen' })}
                  </button>
                  <button
                    type="submit"
                    disabled={!newCollectionInput.trim()}
                    className="px-2 py-0.5 rounded bg-accent text-white font-medium text-[11px] disabled:opacity-40 cursor-pointer"
                  >
                    {t('collections.create', { defaultValue: 'Erstellen' })}
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreatingInline(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer text-accent group"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="group-hover:text-white font-medium">
                  {t('collections.newCollection', { defaultValue: 'Neue Sammlung...' })}
                </span>
              </button>
            )}

            {/* List of existing albums */}
            {flatAlbums.length > 0 && (
              <>
                <div className="h-px bg-app-border/40 my-1" />
                <div className="max-h-48 overflow-y-auto px-0.5 space-y-0.5">
                  {flatAlbums.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => {
                        onAddToCollection(album.id);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Bookmark className="w-3.5 h-3.5 text-txt-secondary group-hover:text-white flex-shrink-0" />
                        <span className="truncate">{album.name}</span>
                      </div>
                      <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono ml-2 flex-shrink-0">
                        {album.count}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
