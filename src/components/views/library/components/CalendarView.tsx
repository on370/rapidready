import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { LibraryImage } from '../../../../stores/libraryStore';
import { useLibraryUIStore } from '../../../../stores/libraryUIStore';
import { getRrImageUrl } from '../../../../utils/image';

interface CalendarViewProps {
  displayedImages: LibraryImage[];
  activePath?: string;
  /** Selects the day's photos; `openLoupe` opens the first one instead of showing them in the grid. */
  onOpenDay: (paths: string[], openLoupe: boolean) => void;
}

/** Local calendar day ("YYYY-MM-DD") a photo was taken on, from its capture date or file time. */
function dayKey(img: LibraryImage): string | null {
  const raw = img.date || img.date_modified || '';
  const m = raw.match(/^(\d{4})[-:](\d{2})[-:](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (img.mtime) {
    const d = new Date(img.mtime * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/** Up to `n` photos spread evenly over the day (photos are in display order). */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

const GAP = 6;

/**
 * Month-by-month calendar of the photos in view. Every month between the first and the last photo
 * is shown, in reading order, as a regular 7-column month. Each day shows up to four photos.
 */
export function CalendarView({ displayedImages, activePath, onOpenDay }: CalendarViewProps) {
  const { t, i18n } = useTranslation('library');
  const cellSize = useLibraryUIStore((s) => s.gridThumbnailSize);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lang = i18n.language || 'en';
  const weekStartsMonday = !lang.startsWith('en');

  const { days, months, undated } = useMemo(() => {
    const days = new Map<string, LibraryImage[]>();
    let undated = 0;
    for (const img of displayedImages) {
      const key = dayKey(img);
      if (!key) {
        undated++;
        continue;
      }
      const list = days.get(key);
      if (list) list.push(img);
      else days.set(key, [img]);
    }
    const keys = [...days.keys()].sort();
    const months: { year: number; month: number }[] = [];
    if (keys.length) {
      let [y, m] = keys[0].split('-').map(Number);
      const [ly, lm] = keys[keys.length - 1].split('-').map(Number);
      while (y < ly || (y === ly && m <= lm)) {
        months.push({ year: y, month: m });
        if (m === 12) {
          y++;
          m = 1;
        } else {
          m++;
        }
      }
    }
    return { days, months, undated };
  }, [displayedImages]);

  const activeDay = useMemo(() => {
    const img = displayedImages.find((i) => i.path === activePath);
    return img ? dayKey(img) : null;
  }, [displayedImages, activePath]);

  // Open on the month of the active photo, or the most recent month.
  // Only when the view opens or the set of months changes, not on every selection change.
  const initialMonth = (activeDay ?? [...days.keys()].sort().pop() ?? '').slice(0, 7);
  const monthRange = months.length ? `${months[0].year}-${months[0].month}/${months.length}` : '';
  useEffect(() => {
    if (!initialMonth) return;
    scrollRef.current?.querySelector(`[data-month="${initialMonth}"]`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRange]);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }), [lang]);
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    // 2024-01-07 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i + (weekStartsMonday ? 1 : 0))));
  }, [lang, weekStartsMonday]);

  if (months.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-txt-tertiary text-sm">
        <CalendarDays className="w-8 h-8" />
        {t('calendar.noDates')}
      </div>
    );
  }

  const monthWidth = cellSize * 7 + GAP * 6;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" data-calendar-view>
      {undated > 0 && (
        <p className="text-xs text-txt-tertiary text-center mb-3">{t('calendar.undated', { count: undated })}</p>
      )}
      <div className="flex flex-wrap justify-center gap-x-10 gap-y-8">
        {months.map(({ year, month }) => {
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          const first = new Date(year, month - 1, 1);
          const offset = (first.getDay() - (weekStartsMonday ? 1 : 0) + 7) % 7;
          const daysInMonth = new Date(year, month, 0).getDate();
          let monthCount = 0;
          for (let d = 1; d <= daysInMonth; d++) monthCount += days.get(`${monthKey}-${String(d).padStart(2, '0')}`)?.length ?? 0;

          return (
            <section
              key={monthKey}
              data-month={monthKey}
              style={{ width: monthWidth, contentVisibility: 'auto', containIntrinsicSize: `${monthWidth}px ${cellSize * 6}px` }}
            >
              <h3 className="flex items-baseline justify-between mb-2 px-0.5">
                <span className={`text-sm font-semibold ${monthCount ? 'text-txt-primary' : 'text-txt-tertiary'}`}>
                  {monthFmt.format(first)}
                </span>
                {monthCount > 0 && (
                  <span className="text-xs text-txt-tertiary">{t('collections.photoCount', { count: monthCount })}</span>
                )}
              </h3>
              <div className="grid" style={{ gridTemplateColumns: `repeat(7, ${cellSize}px)`, gap: GAP }}>
                {weekdays.map((w) => (
                  <div key={w} className="text-[10px] uppercase tracking-wider text-txt-tertiary text-center pb-1">
                    {w}
                  </div>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const key = `${monthKey}-${String(day).padStart(2, '0')}`;
                  const photos = days.get(key);
                  if (!photos) {
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-app-border/40 text-[11px] text-txt-tertiary/50 p-1.5"
                        style={{ height: cellSize }}
                      >
                        {day}
                      </div>
                    );
                  }
                  const shown = sample(photos, 4);
                  return (
                    <button
                      key={key}
                      type="button"
                      data-day={key}
                      onClick={() => onOpenDay(photos.map((p) => p.path), false)}
                      onDoubleClick={() => onOpenDay(photos.map((p) => p.path), true)}
                      title={t('calendar.dayTooltip', { count: photos.length })}
                      className={`relative rounded-lg overflow-hidden bg-app-card border cursor-pointer transition-colors ${
                        key === activeDay ? 'border-accent ring-1 ring-accent' : 'border-app-border hover:border-accent/60'
                      }`}
                      style={{ height: cellSize }}
                    >
                      <div className={`absolute inset-0 grid gap-px ${shown.length > 1 ? 'grid-cols-2' : ''} ${shown.length > 2 ? 'grid-rows-2' : ''}`}>
                        {shown.map((img) => (
                          <img
                            key={img.path}
                            src={getRrImageUrl(img.path, false, img.culling?.orientation, 1, img.size, img.mtime)}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            alt=""
                            className="w-full h-full object-cover bg-app-deepest"
                          />
                        ))}
                      </div>
                      <span className="absolute top-1 left-1 px-1.5 rounded bg-black/60 text-[11px] font-semibold text-white">{day}</span>
                      <span className="absolute bottom-1 right-1 px-1.5 rounded bg-black/60 text-[10px] font-mono text-white/90">
                        {photos.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
