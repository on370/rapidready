import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, ChevronDown, X } from 'lucide-react';
import { useLibraryStore } from '../../../../stores/libraryStore';
import { activeFilterCount, FileTypeFilter, FilterOptions } from '../utils/advancedFilter';

const FILE_TYPES: FileTypeFilter[] = ['raw', 'jpeg', 'video', 'other'];

const selectClass =
  'w-full bg-app-deepest border border-app-border rounded-md px-2 py-1 text-xs text-txt-primary focus:outline-none focus:border-accent cursor-pointer';
const pill = (active: boolean) =>
  `px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
    active ? 'bg-accent/15 text-accent' : 'text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'
  }`;

/** "More filters" popover in the filter bar: capture date, camera, lens, file type, GPS. */
export function AdvancedFilterMenu({ options }: { options: FilterOptions }) {
  const { t } = useTranslation('library');
  const filter = useLibraryStore((s) => s.advancedFilter);
  const setFilter = useLibraryStore((s) => s.setAdvancedFilter);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(filter);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const yearActive = (y: string) => filter.dateFrom === `${y}-01-01` && filter.dateTo === `${y}-12-31`;

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
          count ? 'bg-accent/15 text-accent border-accent/30' : 'border-transparent text-txt-tertiary hover:bg-app-hover hover:text-txt-secondary'
        }`}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 py-0.5 cursor-pointer"
          title={t('filters.more.tooltip')}
          data-advanced-filter
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{count ? t('filters.more.active', { count }) : t('filters.more.label')}</span>
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
        {count > 0 && (
          <button
            onClick={() => setFilter(null)}
            className="p-0.5 hover:bg-accent/20 rounded cursor-pointer text-accent/70 hover:text-accent"
            title={t('filters.more.clear')}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 rounded-lg bg-[#18181b] border border-app-border shadow-2xl p-3 z-50 space-y-3 text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* Capture date */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-txt-tertiary">{t('filters.more.date')}</div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filter.dateFrom ?? ''}
                max={filter.dateTo ?? undefined}
                onChange={(e) => setFilter({ dateFrom: e.target.value || null })}
                className={selectClass}
                style={{ colorScheme: 'dark' }}
                aria-label={t('filters.more.from')}
              />
              <span className="text-txt-tertiary">–</span>
              <input
                type="date"
                value={filter.dateTo ?? ''}
                min={filter.dateFrom ?? undefined}
                onChange={(e) => setFilter({ dateTo: e.target.value || null })}
                className={selectClass}
                style={{ colorScheme: 'dark' }}
                aria-label={t('filters.more.to')}
              />
            </div>
            {options.years.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {options.years.slice(0, 12).map((y) => (
                  <button
                    key={y}
                    onClick={() =>
                      setFilter(yearActive(y) ? { dateFrom: null, dateTo: null } : { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` })
                    }
                    className={pill(yearActive(y))}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Camera / lens */}
          {(['camera', 'lens'] as const).map((field) => {
            const list = field === 'camera' ? options.cameras : options.lenses;
            return (
              <label key={field} className="block space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-txt-tertiary">{t(`filters.more.${field}`)}</span>
                <select
                  value={filter[field] ?? ''}
                  onChange={(e) => setFilter({ [field]: e.target.value || null })}
                  className={selectClass}
                  style={{ colorScheme: 'dark' }}
                  disabled={list.length === 0}
                >
                  <option value="">{t('filters.more.any')}</option>
                  {list.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name} ({o.count})
                    </option>
                  ))}
                </select>
              </label>
            );
          })}

          {/* File type */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-txt-tertiary">{t('filters.more.fileType')}</div>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setFilter({ fileType: null })} className={pill(filter.fileType === null)}>
                {t('filters.more.any')}
              </button>
              {FILE_TYPES.map((ft) => (
                <button key={ft} onClick={() => setFilter({ fileType: ft })} className={pill(filter.fileType === ft)}>
                  {t(`filters.more.fileTypes.${ft}`)}
                </button>
              ))}
            </div>
          </div>

          {/* GPS */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-txt-tertiary">{t('filters.more.location')}</div>
            <div className="flex flex-wrap gap-1">
              {([null, true, false] as const).map((v) => (
                <button key={String(v)} onClick={() => setFilter({ hasGps: v })} className={pill(filter.hasGps === v)}>
                  {t(v === null ? 'filters.more.any' : v ? 'filters.more.withGps' : 'filters.more.withoutGps')}
                </button>
              ))}
            </div>
          </div>

          {count > 0 && (
            <button onClick={() => setFilter(null)} className="w-full text-center text-[11px] text-txt-tertiary hover:text-txt-primary pt-1 cursor-pointer">
              {t('filters.more.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
