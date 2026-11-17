import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ChevronLeft, ChevronRight, Layers, X, Check, Crown, LayoutGrid } from 'lucide-react';
import type { LibraryImage } from '../../../../stores/libraryStore';
import { getRrImageUrl } from '../../../../utils/image';

interface SimilarGroup {
  paths: string[];
  keeper: number | null;
  scores: number[];
  basis: 'pick' | 'rating' | 'sharpness' | null;
  clear: boolean;
}

interface GroupingResult {
  groups: SimilarGroup[];
  singles: number;
  failed: string[];
  cancelled: boolean;
}

const SENSITIVITY = { strict: 0, normal: 0.5, loose: 1 } as const;
/** Increasing run ids; the backend stops any run that isn't the latest. */
let nextRun = Date.now();
type Sensitivity = keyof typeof SENSITIVITY;

/** Capture time in ms for grouping (only differences matter, so the time zone doesn't). */
function captureMs(img: LibraryImage): number | null {
  const m = (img.date || '').match(/^(\d{4})[-:](\d{2})[-:](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m.map(Number);
    const sub = img.subsec_time ? Number(`0.${img.subsec_time.replace(/\D/g, '')}`) * 1000 : 0;
    return Date.UTC(y, mo - 1, d, h, mi, s) + Math.round(sub || 0);
  }
  return img.mtime ? Math.round(img.mtime * 1000) : null;
}

interface Props {
  images: LibraryImage[];
  onClose: () => void;
  /** Flags `keep` as picked and `reject` as rejected (stack members included by the caller). */
  onDecide: (keep: string[], reject: string[]) => void;
  onShowInGrid: (paths: string[]) => void;
}

/** Groups similar photos among `images` and walks through the groups one at a time. */
export function SimilarGroupsPanel({ images, onClose, onDecide, onShowInGrid }: Props) {
  const { t } = useTranslation('library');
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<GroupingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [keepers, setKeepers] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<Record<number, 'decided' | 'keptAll'>>({});

  const byPath = useMemo(() => new Map(images.map((img) => [img.path, img])), [images]);

  // Run (and re-run when sensitivity changes). The image list is read once per run on purpose:
  // flagging photos while reviewing must not restart the analysis.
  useEffect(() => {
    let active = true;
    const run = ++nextRun;
    setResult(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setIndex(0);
    setKeepers({});
    setStatus({});
    const frames = images
      .filter((img) => !img.is_video)
      .map((img) => ({
        path: img.path,
        timeMs: captureMs(img),
        camera: img.camera,
        flag: img.culling.flag,
        rating: img.culling.rating,
        size: img.size,
        mtime: img.mtime != null ? Math.floor(img.mtime) : null,
      }));
    const unlisten = listen<{ done: number; total: number }>('similar-groups-progress', (e) => {
      if (active) setProgress(e.payload);
    });
    invoke<GroupingResult>('find_similar_groups', { frames, sensitivity: SENSITIVITY[sensitivity], run })
      .then((r) => active && !r.cancelled && setResult(r))
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setProgress(null));
    return () => {
      active = false;
      unlisten.then((f) => f());
      invoke('cancel_similar_groups', { run });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensitivity]);

  const groups = result?.groups ?? [];
  const group = groups[index];
  const keeper = group ? (keepers[index] ?? group.keeper) : null;
  const go = useCallback((delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(groups.length - 1, 0))), [groups.length]);

  const decide = useCallback(() => {
    if (!group || keeper == null) return;
    onDecide([group.paths[keeper]], group.paths.filter((_, i) => i !== keeper));
    setStatus((s) => ({ ...s, [index]: 'decided' }));
    go(1);
  }, [group, keeper, index, onDecide, go]);

  const keepAll = useCallback(() => {
    if (!group) return;
    setStatus((s) => ({ ...s, [index]: 'keptAll' }));
    go(1);
  }, [group, index, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'Escape') onClose();
      else if (k === 'ArrowRight') go(1);
      else if (k === 'ArrowLeft') go(-1);
      else if (k === 'Enter') decide();
      else if (k.toLowerCase() === 'k') keepAll();
      else if (group && /^[1-9]$/.test(k) && Number(k) <= group.paths.length) setKeepers((s) => ({ ...s, [index]: Number(k) - 1 }));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, go, decide, keepAll, group, index]);

  const grouped = groups.reduce((n, g) => n + g.paths.length, 0);
  const reviewed = Object.keys(status).length;
  const tileHeight = group && group.paths.length <= 3 ? 'h-[46vh]' : group && group.paths.length <= 6 ? 'h-[30vh]' : 'h-[20vh]';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col text-txt-primary animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-app-border bg-[#18181b]">
        <Layers className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold">{t('similar.title')}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning">{t('similar.experimental')}</span>
        {result && (
          <span className="text-xs text-txt-tertiary">
            {t('similar.summary', { count: groups.length, photos: grouped, singles: result.singles })}
            {reviewed > 0 && ` · ${t('similar.reviewed', { count: reviewed })}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 text-[11px]">
          <span className="text-txt-tertiary mr-1">{t('similar.sensitivity')}</span>
          {(Object.keys(SENSITIVITY) as Sensitivity[]).map((s) => (
            <button
              key={s}
              onClick={() => setSensitivity(s)}
              disabled={!!progress}
              className={`px-2 py-0.5 rounded-md font-medium cursor-pointer disabled:cursor-wait ${sensitivity === s ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'}`}
            >
              {t(`similar.sensitivities.${s}`)}
            </button>
          ))}
          <button onClick={onClose} className="ml-3 p-1 rounded hover:bg-app-hover cursor-pointer" title={t('similar.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 gap-4">
        {progress && (
          <div className="w-80 space-y-2 text-center">
            <div className="text-sm text-txt-secondary">{t('similar.analyzing', { done: progress.done, total: progress.total || images.length })}</div>
            <div className="h-1.5 rounded-full bg-app-border overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
            </div>
            <button onClick={onClose} className="text-xs text-txt-tertiary hover:text-txt-primary cursor-pointer">{t('similar.cancel')}</button>
          </div>
        )}
        {error && <div className="text-sm text-danger">{error}</div>}
        {result && groups.length === 0 && <div className="text-sm text-txt-secondary">{t('similar.none')}</div>}

        {group && (
          <>
            <div className="flex items-center gap-2 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">{t('similar.groupOf', { index: index + 1, count: groups.length })}</span>
              <span>· {t('similar.photos', { count: group.paths.length })}</span>
              {status[index] && (
                <span className="px-1.5 py-0.5 rounded bg-success/15 text-success flex items-center gap-1">
                  <Check className="w-3 h-3" /> {t(`similar.status.${status[index]}`)}
                </span>
              )}
              {keepers[index] == null && group.basis && (
                <span className={`px-1.5 py-0.5 rounded ${group.clear ? 'bg-accent/15 text-accent' : 'bg-app-hover text-txt-tertiary'}`}>
                  {group.clear ? t(`similar.basis.${group.basis}`) : t('similar.closeCall')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3 overflow-y-auto max-h-full">
              {group.paths.map((path, i) => {
                const img = byPath.get(path);
                const isKeeper = i === keeper;
                const flag = img?.culling.flag;
                return (
                  <button
                    key={path}
                    onClick={() => setKeepers((s) => ({ ...s, [index]: i }))}
                    className={`relative rounded-lg overflow-hidden bg-app-deepest cursor-pointer ring-2 transition-all ${isKeeper ? 'ring-accent' : 'ring-transparent hover:ring-app-border'}`}
                    title={img?.name}
                  >
                    <img
                      src={getRrImageUrl(path, false, img?.culling.orientation, 2, img?.size, img?.mtime)}
                      className={`${tileHeight} w-auto object-contain ${flag === -1 ? 'opacity-40' : ''}`}
                      draggable={false}
                      alt=""
                    />
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/70">{i + 1}</span>
                    {isKeeper && (
                      <span className="absolute top-1.5 right-1.5 p-1 rounded bg-accent text-white">
                        <Crown className="w-3 h-3" />
                      </span>
                    )}
                    {flag === 1 && <span className="absolute bottom-6 right-1.5 text-[10px] font-bold px-1.5 rounded bg-success text-white">P</span>}
                    {flag === -1 && <span className="absolute bottom-6 right-1.5 text-[10px] font-bold px-1.5 rounded bg-danger text-white">X</span>}
                    <div className="absolute inset-x-0 bottom-0 h-5 bg-black/70 flex items-center gap-1.5 px-1.5" title={t('similar.scoreTooltip')}>
                      <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${Math.round(group.scores[i] * 100)}%` }} />
                      </div>
                      <span className="text-[10px] tabular-nums text-txt-secondary">{Math.round(group.scores[i] * 100)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {group && (
        <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-app-border bg-[#18181b] text-xs">
          <button onClick={() => go(-1)} disabled={index === 0} className="p-1.5 rounded-md hover:bg-app-hover cursor-pointer disabled:opacity-30 disabled:cursor-default" title="←">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={keepAll} className="px-3 py-1.5 rounded-md border border-app-border hover:bg-app-hover cursor-pointer">
            {t('similar.keepAll')} <kbd className="ml-1 text-txt-tertiary">K</kbd>
          </button>
          <button
            onClick={decide}
            disabled={keeper == null}
            className="px-3 py-1.5 rounded-md bg-accent text-white font-medium hover:bg-accent/90 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {t('similar.keepOne')} <kbd className="ml-1 opacity-70">↵</kbd>
          </button>
          <button onClick={() => go(1)} disabled={index >= groups.length - 1} className="p-1.5 rounded-md hover:bg-app-hover cursor-pointer disabled:opacity-30 disabled:cursor-default" title="→">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => onShowInGrid(group.paths)} className="ml-4 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-txt-tertiary hover:bg-app-hover hover:text-txt-primary cursor-pointer">
            <LayoutGrid className="w-3.5 h-3.5" /> {t('similar.showInGrid')}
          </button>
          <span className="ml-4 text-txt-tertiary">{t('similar.keysHint')}</span>
        </div>
      )}
    </div>
  );
}
