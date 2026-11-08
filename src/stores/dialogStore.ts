import { create } from 'zustand';

export interface DialogChoice {
  id: string;
  label: string;
  description?: string;
}

export interface DestructiveDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  choices?: DialogChoice[];
  defaultChoiceId?: string;
}

interface DialogState {
  isOpen: boolean;
  options: DestructiveDialogOptions | null;
  resolve: ((result: { confirmed: boolean; choiceId?: string }) => void) | null;
  confirmDestructive: (options: DestructiveDialogOptions) => Promise<boolean>;
  confirmWithChoice: (options: DestructiveDialogOptions) => Promise<string | null>;
  close: (confirmed: boolean, choiceId?: string) => void;
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
        resolve: (res) => resolve(res.confirmed),
      });
    });
  },
  confirmWithChoice: (options) => {
    return new Promise<string | null>((resolve) => {
      set({
        isOpen: true,
        options,
        resolve: (res) => resolve(res.confirmed ? (res.choiceId || options.defaultChoiceId || options.choices?.[0]?.id || '') : null),
      });
    });
  },
  close: (confirmed, choiceId) => {
    const { resolve } = get();
    set({
      isOpen: false,
      options: null,
      resolve: null,
    });
    if (resolve) {
      resolve({ confirmed, choiceId });
    }
  },
}));
