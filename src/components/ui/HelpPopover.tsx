import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
        title="Help & Shortcuts"
      >
        <Info className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-app-card border border-app-border rounded-xl shadow-2xl z-50 overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-app-border bg-app-panel/50">
            <h4 className="text-sm font-semibold text-txt-primary">
              {viewMode === 'loupe' ? t('tooltip.loupe') : t('tooltip.grid')}
            </h4>
          </div>
          <div className="p-4 space-y-3">
            {viewMode === 'loupe' ? (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">Zoom in/out</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">Scroll / Z</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">Pan image</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">Drag</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.next')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">Space</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.prev')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">Shift+Space</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.grid')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">G / Esc</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">{t('shortcuts.loupe')}</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">E / Enter</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">Rate Image</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">1-5</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-txt-secondary">Pick / Reject</span>
                  <span className="font-mono bg-app-deepest border border-app-border px-1.5 py-0.5 rounded text-txt-primary">P / X</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
