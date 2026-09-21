import React, { useMemo } from 'react';
import { Bookmark, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImportStore } from '../../../../stores/importStore';
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

export const ImportCollectionSelector = React.memo(function ImportCollectionSelector() {
  const { t } = useTranslation('import');
  const {
    targetCollectionId,
    setTargetCollectionId,
    newCollectionName,
    setNewCollectionName,
    projectName,
  } = useImportStore();

  const collectionsTree = useCollectionsStore((s) => s.collectionsTree);
  const flatAlbums = useMemo(() => getFlatAlbums(collectionsTree), [collectionsTree]);

  const mode: 'none' | 'existing' | 'new' = 
    targetCollectionId === null 
      ? 'none' 
      : targetCollectionId === '__new__' 
        ? 'new' 
        : 'existing';

  const handleModeChange = (newMode: 'none' | 'existing' | 'new') => {
    if (newMode === 'none') {
      setTargetCollectionId(null);
    } else if (newMode === 'existing') {
      if (flatAlbums.length > 0) {
        const alreadyValid = flatAlbums.some(a => a.id === targetCollectionId);
        setTargetCollectionId(alreadyValid ? targetCollectionId : flatAlbums[0].id);
      } else {
        setTargetCollectionId('__new__');
        if (!newCollectionName && projectName) {
          setNewCollectionName(projectName);
        }
      }
    } else if (newMode === 'new') {
      setTargetCollectionId('__new__');
      if (!newCollectionName && projectName) {
        setNewCollectionName(projectName);
      }
    }
  };

  const selectedAlbum = flatAlbums.find((a) => a.id === targetCollectionId);

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-accent flex-shrink-0" />
          <h3 className="text-xs font-semibold text-txt-primary">
            {t('destination.collectionTitle', { defaultValue: 'Beim Import zu Sammlung / Album hinzufügen' })}
          </h3>
        </div>
        {mode !== 'none' && (
          <span className="text-[11px] font-medium text-accent flex items-center gap-1">
            <Check className="w-3 h-3" />
            {mode === 'new'
              ? newCollectionName || t('destination.collectionNew', { defaultValue: 'Neues Album' })
              : selectedAlbum?.name}
          </span>
        )}
      </div>

      {/* Top Pulldown: High-level Mode Selector */}
      <div className="relative">
        <select
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as 'none' | 'existing' | 'new')}
          className="w-full px-3 py-2 rounded-lg bg-app-deepest border border-app-border text-xs text-txt-primary focus:border-accent focus:outline-none cursor-pointer appearance-none pr-8 transition-colors hover:border-app-border-hover"
        >
          <option value="none">{t('destination.collectionNone', { defaultValue: 'Keine Sammlung' })}</option>
          <option value="existing" disabled={flatAlbums.length === 0}>
            {flatAlbums.length === 0 
              ? t('destination.collectionNoExisting', { defaultValue: 'Bestehendes Album (keine vorhanden)' })
              : t('destination.collectionExisting', { defaultValue: 'Bestehendem Album hinzufügen...' })}
          </option>
          <option value="new">{t('destination.collectionNewOption', { defaultValue: '+ Neues Album anlegen...' })}</option>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* Sub-Selector when 'existing' is chosen: Second scrollable Pulldown */}
      {mode === 'existing' && flatAlbums.length > 0 && (
        <div className="space-y-1 pt-0.5 animate-in fade-in duration-150">
          <label className="text-[11px] text-txt-tertiary">
            {t('destination.selectAlbumLabel', { defaultValue: 'Album auswählen:' })}
          </label>
          <div className="relative">
            <select
              value={targetCollectionId || flatAlbums[0]?.id || ''}
              onChange={(e) => setTargetCollectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app-deepest border border-app-border text-xs text-txt-primary focus:border-accent focus:outline-none cursor-pointer appearance-none pr-8 transition-colors hover:border-app-border-hover"
            >
              {flatAlbums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name} ({album.count} {t('destination.photosCount', { defaultValue: 'Fotos' })})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Sub-Input when 'new' is chosen: Inline text field */}
      {mode === 'new' && (
        <div className="space-y-1 pt-0.5 animate-in fade-in duration-150">
          <label className="text-[11px] text-txt-tertiary">
            {t('destination.newAlbumLabel', { defaultValue: 'Name des neuen Albums:' })}
          </label>
          <input
            type="text"
            placeholder={projectName || t('destination.newAlbumPlaceholder', { defaultValue: 'z. B. Urlaub 2026' })}
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-app-deepest border border-app-border text-xs text-txt-primary focus:border-accent focus:outline-none"
            autoFocus
          />
        </div>
      )}
    </div>
  );
});
