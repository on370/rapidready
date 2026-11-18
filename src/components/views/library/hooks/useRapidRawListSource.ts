import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryStore } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { useCollectionsStore, findAlbumById } from '../../../../stores/collectionsStore';
import { buildRapidRawList, buildRapidRawListTitle } from '../../../../utils/rapidrawList';
import { setRapidRawListSource } from '../../../../utils/rapidrawListSource';

function baseName(p: string | null | undefined): string | null {
  if (!p) return null;
  const parts = p.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

/**
 * Exposes the grid's current list (exactly `displayedImages`, i.e. after filters, stacking and
 * sort) to the experimental "send list to RapidRAW" open path. Nothing is computed until the user
 * actually opens a photo in RapidRAW with the setting enabled.
 */
export function useRapidRawListSource(displayedImages: LibraryImage[], selectedPaths: Set<string>) {
  const { t } = useTranslation('library');
  const latest = useRef({ displayedImages, selectedPaths, t });
  useEffect(() => {
    latest.current = { displayedImages, selectedPaths, t };
  });

  useEffect(() => {
    return setRapidRawListSource((activePath) => {
      const { displayedImages: visible, selectedPaths: selected, t: tr } = latest.current;
      const list = buildRapidRawList(visible, selected, activePath);
      if (!list) return null;

      const lib = useLibraryStore.getState();
      const ui = useLibraryUIStore.getState();
      const { activeCollectionId, collectionsTree } = useCollectionsStore.getState();
      const collection = activeCollectionId ? findAlbumById(collectionsTree, activeCollectionId) : null;

      const scopeName = collection
        ? collection.name
        : lib.isViewingLastImport
          ? tr('sidebar.lastImport')
          : baseName(lib.activeFolderPath) || baseName(lib.rootPath);

      const title = buildRapidRawListTitle((key, opts) => tr(key, opts) as string, {
        scopeName,
        isSelection: list.isSelection,
        count: list.paths.length,
        filterMode: lib.filterMode,
        ratingFilter: lib.selectedRatingFilter,
        colorFilter: lib.selectedColorFilter,
        tagFilter: lib.selectedTagFilter,
        sortBy: ui.sortBy,
        manualOrder: !!activeCollectionId,
      });

      return { paths: list.paths, active: list.active, title };
    });
  }, []);
}
