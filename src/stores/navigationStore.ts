import { create } from 'zustand';
import { ViewType } from '../components/layout/Sidebar';

interface NavigationState {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'import',
  setActiveView: (activeView) => set({ activeView }),
}));
