import { Sparkles, Compass, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '../../stores/onboardingStore';

export function TourWelcomePrompt() {
  const { t } = useTranslation('onboarding');
  const { isPromptOpen, promptType, startTour, closePrompt } = useOnboardingStore();

  if (!isPromptOpen || !promptType) return null;

  const isNewFeatures = promptType === 'new-features';

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePrompt(false);
      }}
    >
      <div
        className="w-full max-w-md bg-app-panel border border-app-border rounded-2xl shadow-2xl p-6 text-txt-primary flex flex-col gap-5 animate-in zoom-in-95 duration-150 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle background glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-accent/15 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0 shadow-inner">
            {isNewFeatures ? (
              <Sparkles className="w-6 h-6 animate-pulse" />
            ) : (
              <Compass className="w-6 h-6" />
            )}
          </div>
          <button
            onClick={() => closePrompt(false)}
            className="p-1 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer"
            title={t('ui.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-bold text-txt-primary">
            {isNewFeatures
              ? t('prompt.newFeaturesTitle', 'Neu in RapidReady')
              : t('prompt.firstRunTitle', 'Willkommen bei RapidReady!')}
          </h2>
          <p className="text-xs text-txt-secondary leading-relaxed">
            {isNewFeatures
              ? t(
                  'prompt.newFeaturesSubtitle',
                  'Seit Deinem letzten Besuch gibt es neue Funktionen. Möchtest Du einen kurzen Überblick (30 Sekunden)?'
                )
              : t(
                  'prompt.firstRunSubtitle',
                  'Entdecke in einer kurzen 2-Minuten-Tour die wichtigsten Workflows, blitzschnelles Culling und den genialen Fotobuch-Trick.'
                )}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-app-border/40 gap-3">
          <button
            type="button"
            onClick={() => closePrompt(true)}
            className="text-xs text-txt-tertiary hover:text-txt-secondary transition-colors cursor-pointer px-2 py-1.5"
          >
            {t('prompt.skip', 'Jetzt überspringen')}
          </button>

          <button
            type="button"
            onClick={() => startTour(isNewFeatures ? 'new-only' : 'full')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent/90 text-xs font-semibold shadow-lg shadow-accent/20 transition-all cursor-pointer active:scale-95"
          >
            <span>
              {isNewFeatures
                ? t('prompt.showMe', 'Zeigen')
                : t('prompt.startTour', 'Tour starten')}
            </span>
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
