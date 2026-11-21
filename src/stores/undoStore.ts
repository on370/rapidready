import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import i18n from '../i18n';
import { normalizePath } from '../utils/image';
import {
  UndoStep,
  CullingPatch,
  CullingChange,
  RotationDirection,
  buildCullingStep,
  planRestore,
  restrictStep,
  stepSize,
  inverseDirection,
  pushStep,
  toSnapshot,
} from '../utils/cullingUndo';
import { useLibraryStore, CullingState } from './libraryStore';
import { useToastStore } from './toastStore';

interface UndoStore {
  past: UndoStep[];
  future: UndoStep[];
  isApplying: boolean;
  record: (step: UndoStep | null) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: 'library', ...options });

const isLoaded = (path: string) => useLibraryStore.getState().imageIndexMap.has(normalizePath(path));

// Sidecar writes still in flight. Undo waits for them, so a quick Ctrl+Z right after a
// large batch change cannot be overtaken on disk by the original write.
const pendingWrites = new Set<Promise<unknown>>();

/** Registers a culling sidecar write so undo/redo can wait for it. Returns the same promise. */
export function trackCullingWrite<T>(promise: Promise<T>): Promise<T> {
  pendingWrites.add(promise);
  const done = () => { pendingWrites.delete(promise); };
  promise.then(done, done);
  return promise;
}

/** Moves the photos of a culling step to `side` in the store and in their sidecars. */
async function applyCulling(changes: CullingChange[], side: 'before' | 'after'): Promise<number> {
  const groups = planRestore(changes, side);
  const { updateBatchCullingState } = useLibraryStore.getState();
  for (const group of groups) {
    updateBatchCullingState(group.paths, group.patch);
  }

  let failed = 0;
  for (const group of groups) {
    try {
      if (group.full) {
        await invoke('set_culling_state', { path: group.paths[0], ...group.full });
      } else {
        const { flag, rating, color } = group.patch;
        const res = await invoke<{ failed: number }>('set_culling_state_batch', {
          paths: group.paths,
          // Batch semantics: null = unchanged, flag 0 = clear, color 'none' = clear
          flag: flag === undefined ? null : (flag ?? 0),
          rating: rating === undefined ? null : rating,
          color: color === undefined ? null : (color ?? 'none'),
        });
        failed += res?.failed ?? 0;
      }
    } catch (err) {
      console.error('Failed to persist undo/redo:', err);
      failed += group.paths.length;
    }
  }
  return failed;
}

async function applyRotation(paths: string[], direction: RotationDirection): Promise<number> {
  try {
    const res = await invoke<Array<{ path: string; culling: CullingState }>>('rotate_images', { paths, direction });
    if (res && res.length > 0) useLibraryStore.getState().updateImageCullings(res);
    return paths.length - (res?.length ?? 0);
  } catch (err) {
    console.error('Failed to persist undo/redo rotation:', err);
    return paths.length;
  }
}

export const useUndoStore = create<UndoStore>((set, get) => {
  const step = async (direction: 'undo' | 'redo') => {
    if (get().isApplying) return;
    const source = direction === 'undo' ? [...get().past] : [...get().future];

    // Only photos that are still loaded are restored: their in-memory state is what the
    // step was recorded against. Steps whose photos are all gone are dropped.
    let entry: UndoStep | undefined;
    let applicable: UndoStep | null = null;
    while (!applicable && (entry = source.pop())) {
      applicable = restrictStep(entry, isLoaded);
    }
    if (!entry || !applicable) {
      set(direction === 'undo' ? { past: source } : { future: source });
      useToastStore.getState().showInfo(t(direction === 'undo' ? 'undo.nothingToUndo' : 'undo.nothingToRedo'));
      return;
    }

    set(direction === 'undo'
      ? { past: source, future: [...get().future, entry], isApplying: true }
      : { future: source, past: [...get().past, entry], isApplying: true });

    try {
      await Promise.allSettled([...pendingWrites]);
      let failed: number;
      if (applicable.type === 'rotation') {
        failed = await applyRotation(
          applicable.paths,
          direction === 'undo' ? inverseDirection(applicable.direction) : applicable.direction
        );
      } else {
        failed = await applyCulling(applicable.changes, direction === 'undo' ? 'before' : 'after');
      }

      const count = stepSize(applicable);
      const action = t(`undo.kind.${applicable.kind}`);
      useToastStore.getState().showInfo(
        t(direction === 'undo' ? 'undo.undid' : 'undo.redid', { action, count }),
        undefined,
        2500
      );
      if (failed > 0) {
        useToastStore.getState().showWarning(
          t('errors.batchSaveFailed', { failed, total: count }),
          t('errors.cullingSaveFailed')
        );
      }
    } finally {
      set({ isApplying: false });
    }
  };

  return {
    past: [],
    future: [],
    isApplying: false,
    record: (entry) => {
      if (!entry) return;
      set((state) => pushStep(state, entry));
    },
    undo: () => step('undo'),
    redo: () => step('redo'),
  };
});

/**
 * Records an undo step for a culling change. Call it right before the change is applied
 * to the store, so each photo's previous state can still be read.
 */
export function recordCullingUndo(paths: string[], patch: CullingPatch) {
  const { images, imageIndexMap } = useLibraryStore.getState();
  const current: Array<{ path: string; culling: ReturnType<typeof toSnapshot> }> = [];
  for (const path of paths) {
    const idx = imageIndexMap.get(normalizePath(path));
    const img = idx !== undefined ? images[idx] : undefined;
    if (img) current.push({ path: img.path, culling: toSnapshot(img.culling) });
  }
  useUndoStore.getState().record(buildCullingStep(current, patch));
}

/** Records a completed rotation of `paths`. */
export function recordRotationUndo(paths: string[], direction: RotationDirection) {
  if (paths.length === 0) return;
  useUndoStore.getState().record({ type: 'rotation', kind: 'rotation', paths: [...paths], direction });
}
