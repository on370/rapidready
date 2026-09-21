import { useRef, useState, useEffect, useCallback } from 'react';
import { FolderOutput, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImportStore } from '../../../stores/importStore';
import { SourceDrivePicker } from './components/SourceDrivePicker';
import { ImportProfileHeader } from './components/ImportProfileHeader';
import { DestinationSelector } from './components/DestinationSelector';
import { StructurePatternPicker } from './components/StructurePatternPicker';
import { ImportCollectionSelector } from './components/ImportCollectionSelector';

export function ImportSourceStep() {
  const { t } = useTranslation('import');
  const isScanning = useImportStore((s) => s.isScanning);
  const scrollContainerRef = useRef<HTMLFieldSetElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasMore = el.scrollTop + el.clientHeight < el.scrollHeight - 25;
    setCanScrollDown(hasMore);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    checkScroll();

    el.addEventListener('scroll', checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      observer.disconnect();
    };
  }, [checkScroll]);

  const handleScrollToBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="flex-1 overflow-hidden p-6 flex gap-6">
      {/* Left Panel: Source Selection */}
      <SourceDrivePicker />

      {/* Right Panel: Destination & Settings */}
      <div className="flex-1 min-w-0 min-h-0 relative flex flex-col">
        <fieldset 
          ref={scrollContainerRef}
          disabled={isScanning} 
          className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pl-1 pb-10 border-0 m-0 p-0 disabled:opacity-40 disabled:pointer-events-none transition-opacity scroll-smooth"
        >
          <div className="flex items-center gap-2 mb-1">
            <FolderOutput className="w-4 h-4 text-txt-secondary" />
            <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">
              {t('destination.title')}
            </h2>
          </div>

          {/* 1. Import Profile Selector */}
          <ImportProfileHeader />

          {/* 2. Unified Destination Selector (In-Place Locations) */}
          <div data-tour="import-destination">
            <DestinationSelector />
          </div>

          {/* 3. Folder Structuring Options & Live Preview */}
          <div data-tour="import-structure">
            <StructurePatternPicker />
          </div>

          {/* 4. Collection Assignment */}
          <div data-tour="import-collection">
            <ImportCollectionSelector />
          </div>
        </fieldset>

        {/* Floating Scroll Indicator Overlay */}
        {canScrollDown && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[#101012] via-[#101012]/80 to-transparent pointer-events-none z-10 rounded-b-xl" />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 animate-in fade-in zoom-in-90 duration-150">
              <button
                type="button"
                onClick={handleScrollToBottom}
                title={t('destination.scrollDownHint', { defaultValue: 'Nach unten scrollen (weitere Optionen)' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181b]/95 border border-app-border text-xs text-txt-secondary hover:text-white hover:border-accent shadow-xl backdrop-blur-md transition-all cursor-pointer group active:scale-95"
              >
                <span className="text-[11px] font-medium">{t('destination.moreOptions', { defaultValue: 'Weitere Einstellungen' })}</span>
                <ChevronDown className="w-3.5 h-3.5 text-accent animate-bounce" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
