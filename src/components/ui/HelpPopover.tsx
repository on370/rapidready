import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isMac, modSymbol, shiftSymbol } from '../../utils/platform';

interface HelpPopoverProps {
  viewMode: 'grid' | 'loupe';
}

export function HelpPopover({ viewMode }: HelpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('help');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        className={`p-1.5 rounded-full transition-colors ${isOpen ? 'bg-accent/20 text-accent' : 'text-txt-tertiary hover:text-txt-secondary hover:bg-app-hover'}`}
        onClick={() => setIsOpen(!isOpen)}
        title={t('tooltip.helpTitle')}
      >
        <Info className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-app-card border border-app-border rounded-xl shadow-2xl z-50 overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-app-border bg-app-panel/50">
            <h4 className="text-sm font-semibold text-txt-primary">
              {viewMode === 'loupe' ? t('tooltip.loupe') : t('tooltip.grid')}
            </h4>
          </div>
          <div className="p-4 space-y-2.5">
            {viewMode === 'loupe' ? (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.zoomInOut')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">Scroll / Z</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.panImage')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">Drag</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.rateImage')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">1-5 / 0</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.pickReject')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">P / X / U</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.colorLabels')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">6-9</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.rotateCw')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">{modSymbol}R / .</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.rotateCcw')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">{modSymbol}L / ,</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.openRapidRaw')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">R</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.next')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">→ / J / Space</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.prev')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">← / K / ⇧Space</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.grid')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">G / Esc</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.loupe')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">E / Enter</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.selectAll')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">{modSymbol}A</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.rateImage')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">1-5 / 0</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.pickReject')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">P / X / U</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.colorLabels')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">6-9</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.rotateCw')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">{modSymbol}R / .</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.rotateCcw')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">{modSymbol}L / ,</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.actions.openRapidRaw')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">R</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{isMac ? t('shortcuts.actions.showInFinder') : t('shortcuts.actions.showInExplorer')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">{modSymbol}{shiftSymbol}F</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('tooltip.navigate')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">← / → / J / K</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
