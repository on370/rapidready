import { useEffect } from 'react';
import { X, Sparkles, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useUpdateStore } from '../../stores/updateStore';
import { useSettingsStore } from '../../stores/settingsStore';
import buildInfo from '../../build-info.json';

export function UpdateNotificationModal() {
  const { availableUpdate, isModalOpen, setIsModalOpen } = useUpdateStore();
  const setDismissedUpdateVersion = useSettingsStore((s) => s.setDismissedUpdateVersion);
  const { t } = useTranslation('settings');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, availableUpdate]);

  if (!isModalOpen || !availableUpdate) return null;

  const isBeta = availableUpdate.prerelease || availableUpdate.tag_name.toLowerCase().includes('beta');

  const handleDismiss = () => {
    if (availableUpdate) {
      setDismissedUpdateVersion(availableUpdate.tag_name);
    }
    setIsModalOpen(false);
  };

  const handleDownload = () => {
    openUrl(availableUpdate.html_url).catch(console.error);
    setIsModalOpen(false);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none"
      onClick={handleDismiss}
    >
      <div 
        className="w-full max-w-lg bg-app-card border border-app-border rounded-2xl shadow-2xl flex flex-col relative overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-app-border flex items-start justify-between bg-gradient-to-r from-accent/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-txt-primary">
                  {t('updates.updateAvailableTitle', { defaultValue: 'Neue Version verfügbar!' })}
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                  isBeta ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'bg-success/15 text-success border border-success/30'
                }`}>
                  {isBeta ? 'Beta' : 'Release'}
                </span>
              </div>
              <p className="text-xs text-txt-tertiary mt-0.5">
                v{buildInfo.version} → <span className="text-accent font-semibold">{availableUpdate.tag_name}</span>
              </p>
            </div>
          </div>

          <button 
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Release Notes Body */}
        <div className="p-6 overflow-y-auto space-y-3 max-h-[45vh] text-left select-text">
          <h3 className="text-sm font-semibold text-txt-primary">
            {availableUpdate.name || availableUpdate.tag_name}
          </h3>
          {availableUpdate.body ? (
            <div className="text-xs text-txt-secondary leading-relaxed whitespace-pre-wrap font-sans bg-app-deepest/50 border border-app-border/60 rounded-xl p-4">
              {availableUpdate.body}
            </div>
          ) : (
            <p className="text-xs text-txt-tertiary italic">
              {t('updates.noReleaseNotes', { defaultValue: 'Keine Versionshinweise verfügbar.' })}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-app-deepest/70 border-t border-app-border flex items-center justify-end gap-2.5">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded-xl text-xs font-medium text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer"
          >
            {t('updates.remindLater', { defaultValue: 'Später erinnern' })}
          </button>

          <button
            onClick={handleDownload}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-accent hover:bg-accent/90 transition-all flex items-center gap-1.5 shadow-md shadow-accent/20 cursor-pointer"
          >
            <span>{t('updates.downloadOnGithub', { defaultValue: 'Auf GitHub ansehen & laden' })}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
