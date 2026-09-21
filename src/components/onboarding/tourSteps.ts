import { ViewType } from '../layout/Sidebar';
import { useLibraryUIStore } from '../../stores/libraryUIStore';

export interface TourStepDef {
  id: string;                     // Unique stable ID (never rename)
  sinceVersion: number;           // Monotonically increasing integer
  targetSelector: string;         // CSS selector or data-tour="..." attribute
  targetView?: ViewType;          // If set, tour navigates here first
  targetImportStep?: number;      // If within ImportView, auto-advance wizard step
  placement: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  i18nKey: string;                // Key inside onboarding.json (e.g. 'steps.sidebarNav')
  beforeShow?: () => void | Promise<void>;
}

export const CURRENT_ONBOARDING_VERSION = 1;

export const ALL_TOUR_STEPS: TourStepDef[] = [
  {
    id: 'sidebar-nav',
    sinceVersion: 1,
    targetSelector: '[data-tour="sidebar-nav"]',
    placement: 'right',
    i18nKey: 'steps.sidebarNav',
  },
  {
    id: 'import-source',
    sinceVersion: 1,
    targetSelector: '[data-tour="import-source"]',
    targetView: 'import',
    placement: 'right',
    i18nKey: 'steps.importSource',
  },
  {
    id: 'import-duplicates',
    sinceVersion: 1,
    targetSelector: '[data-tour="import-duplicates"]',
    targetView: 'import',
    placement: 'right',
    i18nKey: 'steps.importDuplicates',
  },
  {
    id: 'import-destination',
    sinceVersion: 1,
    targetSelector: '[data-tour="import-destination"]',
    targetView: 'import',
    placement: 'left',
    i18nKey: 'steps.importDestination',
  },
  {
    id: 'import-structure',
    sinceVersion: 1,
    targetSelector: '[data-tour="import-structure"]',
    targetView: 'import',
    placement: 'left',
    i18nKey: 'steps.importStructure',
  },
  {
    id: 'import-collection',
    sinceVersion: 1,
    targetSelector: '[data-tour="import-collection"]',
    targetView: 'import',
    placement: 'left',
    i18nKey: 'steps.importCollection',
  },
  {
    id: 'library-folder-tree',
    sinceVersion: 1,
    targetSelector: '[data-tour="library-folder-tree"]',
    targetView: 'library',
    placement: 'right',
    i18nKey: 'steps.libraryFolderTree',
    beforeShow: () => {
      useLibraryUIStore.getState().setViewMode('grid');
    },
  },
  {
    id: 'library-collections',
    sinceVersion: 1,
    targetSelector: '[data-tour="library-collections"]',
    targetView: 'library',
    placement: 'right',
    i18nKey: 'steps.libraryCollections',
  },
  {
    id: 'library-grid',
    sinceVersion: 1,
    targetSelector: '[data-tour="library-grid"]',
    targetView: 'library',
    placement: 'bottom',
    i18nKey: 'steps.libraryGrid',
    beforeShow: () => {
      useLibraryUIStore.getState().setViewMode('grid');
    },
  },
  {
    id: 'library-loupe',
    sinceVersion: 1,
    targetSelector: '[data-tour="library-loupe"]',
    targetView: 'library',
    placement: 'top',
    i18nKey: 'steps.libraryLoupe',
    beforeShow: () => {
      useLibraryUIStore.getState().setViewMode('loupe');
    },
  },
  {
    id: 'library-inspector',
    sinceVersion: 1,
    targetSelector: '[data-tour="library-inspector"]',
    targetView: 'library',
    placement: 'left',
    i18nKey: 'steps.libraryInspector',
    beforeShow: () => {
      useLibraryUIStore.getState().setIsInspectorOpen(true);
    },
  },
  {
    id: 'collection-export',
    sinceVersion: 1,
    targetSelector: '[data-tour="collection-export"]',
    targetView: 'library',
    placement: 'right',
    i18nKey: 'steps.collectionExport',
    beforeShow: () => {
      useLibraryUIStore.getState().setViewMode('grid');
    },
  },
  {
    id: 'help-and-settings',
    sinceVersion: 1,
    targetSelector: '[data-tour="sidebar-bottom"]',
    placement: 'right',
    i18nKey: 'steps.helpAndSettings',
  },
];
