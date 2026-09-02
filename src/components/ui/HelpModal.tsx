import { useEffect, useState } from 'react';
import { X, Command, ArrowBigUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';

export function HelpModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation('help');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on Cmd+? or F1
      if ((e.metaKey && e.key === '/') || e.key === 'F1') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Listen to Tauri events from the native Help menu (macOS)
  useEffect(() => {
    const unlisten = listen('toggle-help-modal', () => {
      setIsOpen(prev => !prev);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-app-card border border-app-border rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-app-border bg-app-panel/50 rounded-t-xl flex-shrink-0">
          <h2 className="text-lg font-semibold text-txt-primary">{t('shortcuts.title', 'Global Keyboard Shortcuts')}</h2>
          <button 
            className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Navigation & View */}
            <div>
              <h3 className="text-sm font-semibold text-txt-secondary mb-4 uppercase tracking-wider">Navigation & Views</h3>
              <div className="space-y-3">
                <ShortcutRow description={t('shortcuts.next', 'Next Image')} keys={['Space']} />
                <ShortcutRow description={t('shortcuts.prev', 'Previous Image')} keys={['Shift', 'Space']} />
                <ShortcutRow description={t('shortcuts.loupe', 'Loupe View')} keys={['E', 'Enter']} />
                <ShortcutRow description={t('shortcuts.grid', 'Grid View')} keys={['G', 'Esc']} />
                <ShortcutRow description="Toggle Fullscreen" keys={['Cmd', 'F']} />
              </div>
            </div>

            {/* Zoom & Pan */}
            <div>
              <h3 className="text-sm font-semibold text-txt-secondary mb-4 uppercase tracking-wider">Zoom & Pan (Loupe)</h3>
              <div className="space-y-3">
                <ShortcutRow description={t('shortcuts.zoom', 'Toggle Zoom')} keys={['Z', 'Click']} />
                <ShortcutRow description="Zoom In" keys={['+', 'Scroll Up']} />
                <ShortcutRow description="Zoom Out" keys={['-', 'Scroll Down']} />
                <ShortcutRow description="Pan Image" keys={['Drag']} />
              </div>
            </div>

            {/* Culling */}
            <div>
              <h3 className="text-sm font-semibold text-txt-secondary mb-4 uppercase tracking-wider">Culling & Rating</h3>
              <div className="space-y-3">
                <ShortcutRow description="Set Rating 1-5" keys={['1', '-', '5']} />
                <ShortcutRow description="Remove Rating" keys={['0']} />
                <ShortcutRow description="Pick (Flag)" keys={['P']} />
                <ShortcutRow description="Reject" keys={['X']} />
                <ShortcutRow description="Remove Flag" keys={['U']} />
              </div>
            </div>

            {/* System */}
            <div>
              <h3 className="text-sm font-semibold text-txt-secondary mb-4 uppercase tracking-wider">System</h3>
              <div className="space-y-3">
                <ShortcutRow description="Open Settings" keys={['Cmd', ',']} />
                <ShortcutRow description="Show this Help" keys={['Cmd', '/']} />
                <ShortcutRow description="Quit Application" keys={['Cmd', 'Q']} />
              </div>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-app-border bg-app-panel/30 flex justify-center flex-shrink-0">
          <p className="text-xs text-txt-tertiary">RapidReady MVP Help System</p>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ description, keys }: { description: string, keys: string[] }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-txt-primary">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="min-w-[24px] text-center px-1.5 py-0.5 rounded bg-app-deepest border border-app-border text-xs font-mono text-txt-secondary shadow-sm">
            {k === 'Cmd' ? <Command className="w-3 h-3 inline" /> : 
             k === 'Shift' ? <ArrowBigUp className="w-3 h-3 inline" /> : k}
          </span>
        ))}
      </div>
    </div>
  );
}
