import { create } from 'zustand';
import { checkAppUpdate, GitHubRelease, CheckUpdateResult } from '../services/updateService';
import { useSettingsStore } from './settingsStore';

interface UpdateState {
  availableUpdate: GitHubRelease | null;
  isModalOpen: boolean;
  isChecking: boolean;
  lastCheckResult: CheckUpdateResult | null;
  
  setAvailableUpdate: (release: GitHubRelease | null) => void;
  setIsModalOpen: (open: boolean) => void;
  setIsChecking: (checking: boolean) => void;
  checkNow: (manual?: boolean) => Promise<CheckUpdateResult>;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  availableUpdate: null,
  isModalOpen: false,
  isChecking: false,
  lastCheckResult: null,

  setAvailableUpdate: (availableUpdate) => set({ availableUpdate }),
  setIsModalOpen: (isModalOpen) => set({ isModalOpen }),
  setIsChecking: (isChecking) => set({ isChecking }),

  checkNow: async (manual = false) => {
    set({ isChecking: true });
    try {
      const result = await checkAppUpdate(manual);
      set({ lastCheckResult: result });

      if (result.hasUpdate && result.latestRelease) {
        set({ availableUpdate: result.latestRelease });
        const dismissed = useSettingsStore.getState().dismissedUpdateVersion;
        // If manual check, always open modal. If startup check, only open if not dismissed.
        if (manual || dismissed !== result.latestRelease.tag_name) {
          set({ isModalOpen: true });
        }
      } else {
        set({ availableUpdate: null });
      }
      return result;
    } finally {
      set({ isChecking: false });
    }
  },
}));
