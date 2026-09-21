import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ALL_TOUR_STEPS, CURRENT_ONBOARDING_VERSION, TourStepDef } from '../components/onboarding/tourSteps';
import { useToastStore } from './toastStore';
import i18n from '../i18n';

interface OnboardingState {
  // Persisted state
  completedOnboardingVersion: number;
  dismissedAt: number | null;

  // Runtime state
  isTourActive: boolean;
  currentStepIndex: number;
  stepsToShow: TourStepDef[];
  isPromptOpen: boolean;
  promptType: 'first-run' | 'new-features' | null;

  // Actions
  checkAndTriggerPrompt: () => void;
  closePrompt: (dontShowAgain?: boolean) => void;
  startTour: (mode?: 'full' | 'new-only' | 'replay') => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: (showToast?: boolean) => void;
  completeTour: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedOnboardingVersion: 0,
      dismissedAt: null,

      isTourActive: false,
      currentStepIndex: 0,
      stepsToShow: ALL_TOUR_STEPS,
      isPromptOpen: false,
      promptType: null,

      checkAndTriggerPrompt: () => {
        const { completedOnboardingVersion, dismissedAt, isTourActive } = get();
        if (isTourActive) return;

        // User already completed the latest version
        if (completedOnboardingVersion >= CURRENT_ONBOARDING_VERSION) return;

        // First run
        if (completedOnboardingVersion === 0) {
          if (dismissedAt) return; // Previously dismissed
          set({ isPromptOpen: true, promptType: 'first-run' });
        } else {
          // Returning user: check if there are new features since their last completed version
          const newSteps = ALL_TOUR_STEPS.filter(
            (s) => s.sinceVersion > completedOnboardingVersion
          );
          if (newSteps.length > 0) {
            set({ isPromptOpen: true, promptType: 'new-features' });
          }
        }
      },

      closePrompt: (dontShowAgain = false) => {
        if (dontShowAgain) {
          set({
            isPromptOpen: false,
            promptType: null,
            completedOnboardingVersion: CURRENT_ONBOARDING_VERSION,
            dismissedAt: Date.now(),
          });
        } else {
          set({ isPromptOpen: false, promptType: null });
        }
      },

      startTour: (mode = 'full') => {
        let steps = ALL_TOUR_STEPS;
        if (mode === 'new-only') {
          const { completedOnboardingVersion } = get();
          const filtered = ALL_TOUR_STEPS.filter(
            (s) => s.sinceVersion > completedOnboardingVersion
          );
          if (filtered.length > 0) {
            steps = filtered;
          }
        }

        set({
          isPromptOpen: false,
          promptType: null,
          isTourActive: true,
          currentStepIndex: 0,
          stepsToShow: steps,
        });
      },

      nextStep: () => {
        const { currentStepIndex, stepsToShow } = get();
        if (currentStepIndex + 1 < stepsToShow.length) {
          set({ currentStepIndex: currentStepIndex + 1 });
        } else {
          get().completeTour();
        }
      },

      prevStep: () => {
        const { currentStepIndex } = get();
        if (currentStepIndex > 0) {
          set({ currentStepIndex: currentStepIndex - 1 });
        }
      },

      skipTour: (showToast = true) => {
        set({
          isTourActive: false,
          isPromptOpen: false,
          promptType: null,
          completedOnboardingVersion: CURRENT_ONBOARDING_VERSION,
          dismissedAt: Date.now(),
        });

        if (showToast) {
          useToastStore.getState().showInfo(
            i18n.t('ui.skippedToast', { ns: 'onboarding' }),
            i18n.t('prompt.firstRunTitle', { ns: 'onboarding' })
          );
        }
      },

      completeTour: () => {
        set({
          isTourActive: false,
          completedOnboardingVersion: CURRENT_ONBOARDING_VERSION,
        });
      },
    }),
    {
      name: 'rapidready-onboarding',
      partialize: (state) => ({
        completedOnboardingVersion: state.completedOnboardingVersion,
        dismissedAt: state.dismissedAt,
      }),
    }
  )
);
