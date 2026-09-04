import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import appLogo from '../../assets/RapidReady-icon.png';
import buildInfo from '../../build-info.json';

export function AboutModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation('settings'); // We reuse the settings translations for now

  useEffect(() => {
    const unlisten = listen('toggle-about-modal', () => {
      setIsOpen(true); // Always open when triggered from menu or sidebar
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Listen for custom browser event from sidebar
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-about-modal', handleOpen);
    return () => window.removeEventListener('open-about-modal', handleOpen);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-app-card border border-app-border rounded-xl shadow-2xl flex flex-col relative overflow-hidden">
        
        <button 
          className="absolute top-4 right-4 p-1.5 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors z-10"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 flex flex-col items-center text-center">
          <img 
            src={appLogo} 
            alt="RapidReady Logo" 
            className="w-20 h-20 mb-5 object-contain select-none drop-shadow-xl" 
          />
          
          <h2 className="text-2xl font-bold text-txt-primary">RapidReady</h2>
          <p className="text-sm text-txt-secondary mt-1">Version {buildInfo.version}</p>
          <p className="text-xs text-txt-tertiary mt-0.5 font-mono">Build {buildInfo.buildNumber}</p>
          
          <div className="w-12 h-px bg-app-border my-5"></div>
          
          <p className="text-sm text-txt-primary font-medium">{t('about.subtitle', 'A companion tool for RapidRaw')}</p>
          <p className="text-xs text-txt-tertiary mt-2">{t('about.license', 'MIT License')} · © 2026</p>
          
          <div className="flex flex-col items-center gap-3 mt-8 w-full">
            <button className="w-full py-2 bg-app-deepest hover:bg-app-hover border border-app-border rounded-lg text-xs font-medium text-txt-primary transition-colors">
              {t('about.repo', 'GitHub Repository')}
            </button>
            <button className="w-full py-2 bg-app-deepest hover:bg-app-hover border border-app-border rounded-lg text-xs font-medium text-txt-primary transition-colors">
              {t('about.author', 'RapidRaw by Timon Käch')}
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
