import { create } from 'zustand';

export interface DestructiveDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogState {
  isOpen: boolean;
  options: DestructiveDialogOptions | null;
  resolve: ((confirmed: boolean) => void) | null;
  confirmDestructive: (options: DestructiveDialogOptions) => Promise<boolean>;
  close: (confirmed: boolean) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  isOpen: false,
  options: null,
  resolve: null,
  confirmDestructive: (options) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        options,
        resolve,
      });
    });
  },
  close: (confirmed) => {
    const { resolve } = get();
    if (resolve) {
      resolve(confirmed);
    }
    set({
      isOpen: false,
      options: null,
      resolve: null,
    });
  },
}));
