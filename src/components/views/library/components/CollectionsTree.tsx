import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  FolderOpen,
  Bookmark,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Plus,
  Edit2,
  Trash2,
  Download,
} from 'lucide-react';
import {
  useCollectionsStore,
  AlbumItem,
  Album,
  getAlbumImageCount,
} from '../../../../stores/collectionsStore';
import { useLibraryStore } from '../../../../stores/libraryStore';
import { useToastStore } from '../../../../stores/toastStore';

interface CollectionsTreeProps {
  onSelectCollection: (id: string | null, name: string | null) => void;
  activeCollectionId: string | null;
}

export function CollectionsTree({ onSelectCollection, activeCollectionId }: CollectionsTreeProps) {
  const { t } = useTranslation('library');
  const {
    collectionsTree,
    expandedGroups,
    toggleGroup,
    createCollection,
    renameCollection,
    deleteCollection,
    addToCollection,
    openExportModal,
  } = useCollectionsStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: AlbumItem;
  } | null>(null);

  const [activeModal, setActiveModal] = useState<{
    type: 'create_album' | 'create_group' | 'rename';
    targetItem?: AlbumItem;
    parentId?: string | null;
  } | null>(null);

  const [inputName, setInputName] = useState('');
  const [dragOverAlbumId, setDragOverAlbumId] = useState<string | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, item: AlbumItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    });
  };

  const handleDrop = async (e: React.DragEvent, album: Album) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAlbumId(null);

    try {
      const storePaths = useCollectionsStore.getState().draggedPhotoPaths;
      let paths: string[] = [];

      if (storePaths && storePaths.length > 0) {
        paths = [...storePaths];
      } else {
        const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
        if (textData) {
          try {
            const parsed = JSON.parse(textData);
            if (Array.isArray(parsed)) {
              paths = parsed;
            } else if (typeof parsed === 'string') {
              paths = [parsed];
            } else if (parsed.path) {
              paths = [parsed.path];
            }
          } catch {
            if (textData.trim()) {
              paths = [textData.trim()];
            }
          }
        }
      }

      // Fallback: check libraryStore selection
      if (paths.length === 0) {
        const { selectedPaths, images, activeImageIndex } = useLibraryStore.getState();
        if (selectedPaths && selectedPaths.size > 0) {
          paths = Array.from(selectedPaths);
        } else if (images[activeImageIndex]) {
          paths = [images[activeImageIndex].path];
        }
      }

      if (paths.length > 0) {
        await addToCollection(album.id, paths);
        useToastStore.getState().showSuccess(
          t('collections.addedToCollection', {
            count: paths.length,
            name: album.name,
            defaultValue: `${paths.length} Foto(s) zu "${album.name}" hinzugefügt.`,
          })
        );
      }
    } catch (err) {
      console.error('Failed to drop onto album:', err);
    } finally {
      useCollectionsStore.getState().setDraggedPhotoPaths(null);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim() || !activeModal) return;

    try {
      if (activeModal.type === 'create_album') {
        await createCollection(inputName.trim(), activeModal.parentId || null, false);
      } else if (activeModal.type === 'create_group') {
        await createCollection(inputName.trim(), activeModal.parentId || null, true);
      } else if (activeModal.type === 'rename' && activeModal.targetItem) {
        await renameCollection(activeModal.targetItem.id, inputName.trim());
      }
      setActiveModal(null);
      setInputName('');
    } catch (err) {
      useToastStore.getState().showError(String(err));
    }
  };

  const renderNode = (item: AlbumItem, depth = 0) => {
    if (item.type === 'group') {
      const isExpanded = expandedGroups.has(item.id);
      const count = getAlbumImageCount(item);

      return (
        <div key={item.id} className="flex flex-col">
          <div
            className="flex items-center justify-between px-2 py-1 rounded-md text-xs hover:bg-app-hover cursor-pointer group select-none text-txt-secondary hover:text-txt-primary transition-colors"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => toggleGroup(item.id)}
            onContextMenu={(e) => handleContextMenu(e, item)}
          >
            <div className="flex items-center gap-1.5 truncate">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
              )}
              <span className="truncate font-medium">{item.name}</span>
            </div>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <span className="text-[10px] text-txt-tertiary tabular-nums">({count})</span>
              )}
              <button
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-card rounded text-txt-tertiary hover:text-txt-primary transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, item);
                }}
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </div>
          </div>
          {isExpanded && item.children && item.children.length > 0 && (
            <div className="flex flex-col">
              {item.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Single Album
    const isSelected = activeCollectionId === item.id;
    const isDragOver = dragOverAlbumId === item.id;
    const count = item.images ? item.images.length : 0;

    return (
      <div
        key={item.id}
        className={`flex items-center justify-between px-2 py-1 rounded-md text-xs cursor-pointer group select-none transition-all ${
          isSelected
            ? 'bg-accent/20 text-accent font-semibold'
            : isDragOver
            ? 'bg-accent/30 ring-1 ring-accent text-txt-primary'
            : 'text-txt-primary hover:bg-app-hover'
        }`}
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
        onClick={() => {
          if (activeCollectionId === item.id) {
            onSelectCollection(null, null);
          } else {
            onSelectCollection(item.id, item.name);
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, item)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          if (dragOverAlbumId !== item.id) {
            setDragOverAlbumId(item.id);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverAlbumId(null);
          }
        }}
        onDrop={(e) => handleDrop(e, item)}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Bookmark className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-accent' : 'text-txt-secondary'}`} />
          <span className="truncate">{item.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-txt-tertiary tabular-nums">({count})</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-card rounded text-txt-tertiary hover:text-txt-primary transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, item);
            }}
          >
            <MoreVertical className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col space-y-0.5">
      {/* Action Header Button: New Collection */}
      <div className="flex items-center justify-between px-2 py-1 mb-1 text-[11px] text-txt-tertiary">
        <span className="font-semibold uppercase tracking-wider">{t('collections.title', 'Sammlungen')}</span>
        <button
          onClick={() => {
            setInputName('');
            setActiveModal({ type: 'create_album' });
          }}
          className="p-1 hover:bg-app-hover rounded text-txt-secondary hover:text-accent transition-colors flex items-center gap-1"
          title={t('collections.newCollection', 'Neue Sammlung')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {collectionsTree.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-txt-tertiary italic">
          {t('collections.noCollectionsYet', 'Keine Sammlungen angelegt')}
        </div>
      ) : (
        collectionsTree.map((item) => renderNode(item, 0))
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-app-card border border-app-border rounded-lg shadow-xl z-50 py-1 text-xs w-52 flex flex-col text-txt-primary"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item.type === 'album' && (
            <button
              className="px-3 py-1.5 hover:bg-accent/20 hover:text-accent flex items-center gap-2 text-left transition-colors font-medium"
              onClick={() => {
                openExportModal(contextMenu.item as Album);
                setContextMenu(null);
              }}
            >
              <Download className="w-3.5 h-3.5 text-accent" />
              {t('collections.export', 'Exportieren...')}
            </button>
          )}

          <button
            className="px-3 py-1.5 hover:bg-app-hover flex items-center gap-2 text-left transition-colors"
            onClick={() => {
              setInputName('');
              setActiveModal({
                type: 'create_album',
                parentId: contextMenu.item.type === 'group' ? contextMenu.item.id : null,
              });
              setContextMenu(null);
            }}
          >
            <Plus className="w-3.5 h-3.5 text-txt-tertiary" />
            {t('collections.newAlbum', 'Neue Sammlung...')}
          </button>

          <button
            className="px-3 py-1.5 hover:bg-app-hover flex items-center gap-2 text-left transition-colors"
            onClick={() => {
              setInputName('');
              setActiveModal({
                type: 'create_group',
                parentId: contextMenu.item.type === 'group' ? contextMenu.item.id : null,
              });
              setContextMenu(null);
            }}
          >
            <Folder className="w-3.5 h-3.5 text-txt-tertiary" />
            {t('collections.newGroup', 'Neue Gruppe (Ordner)...')}
          </button>

          <div className="h-px bg-app-border my-1" />

          <button
            className="px-3 py-1.5 hover:bg-app-hover flex items-center gap-2 text-left transition-colors"
            onClick={() => {
              setInputName(contextMenu.item.name);
              setActiveModal({ type: 'rename', targetItem: contextMenu.item });
              setContextMenu(null);
            }}
          >
            <Edit2 className="w-3.5 h-3.5 text-txt-tertiary" />
            {t('collections.rename', 'Umbenennen...')}
          </button>

          <button
            className="px-3 py-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-2 text-left transition-colors"
            onClick={async () => {
              const confirmMsg =
                contextMenu.item.type === 'group'
                  ? t('collections.confirmDeleteGroup', 'Gruppe und alle Untereinträge wirklich löschen?')
                  : t('collections.confirmDeleteAlbum', 'Sammlung wirklich löschen? Die Originaldateien bleiben unberührt.');
              if (window.confirm(confirmMsg)) {
                await deleteCollection(contextMenu.item.id);
              }
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('collections.delete', 'Löschen')}
          </button>
        </div>
      )}

      {/* Modal for Create/Rename */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleModalSubmit}
            className="bg-app-panel border border-app-border rounded-xl shadow-2xl p-4 w-80 flex flex-col gap-3 text-txt-primary"
          >
            <h3 className="text-sm font-semibold text-txt-primary">
              {activeModal.type === 'create_album' && t('collections.createAlbumTitle', 'Neue Sammlung')}
              {activeModal.type === 'create_group' && t('collections.createGroupTitle', 'Neue Gruppe')}
              {activeModal.type === 'rename' && t('collections.renameTitle', 'Umbenennen')}
            </h3>

            <input
              type="text"
              autoFocus
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder={t('collections.namePlaceholder', 'Name eingeben...')}
              className="px-3 py-2 bg-app-card border border-app-border rounded-lg text-xs text-txt-primary focus:outline-none focus:border-accent"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setInputName('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs hover:bg-app-hover text-txt-secondary transition-colors"
              >
                {t('common.cancel', 'Abbrechen')}
              </button>
              <button
                type="submit"
                disabled={!inputName.trim()}
                className="px-3 py-1.5 rounded-lg text-xs bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {activeModal.type === 'rename' ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
