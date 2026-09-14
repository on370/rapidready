import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useDialogStore } from '../../stores/dialogStore';

export const DestructiveConfirmModal: React.FC = () => {
  const { isOpen, options, close } = useDialogStore();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Automatically focus the Cancel button on open so Enter / Space immediately cancels!
      const timer = setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen || !options) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-100 select-none"
      onClick={() => close(false)}
    >
      <div 
        className="w-full max-w-md bg-[#18181b] border-2 border-danger/40 rounded-2xl shadow-2xl p-6 text-txt-primary flex flex-col gap-4 animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-danger/15 border border-danger/30 flex items-center justify-center text-danger flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-danger" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-400 leading-snug">
                {options.title}
              </h3>
            </div>
          </div>
          <button
            onClick={() => close(false)}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-txt-tertiary hover:text-txt-primary transition-colors flex-shrink-0 cursor-pointer"
            title="Abbrechen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message body */}
        <div className="text-xs text-txt-secondary leading-relaxed whitespace-pre-line bg-white/5 border border-white/5 rounded-xl p-3.5">
          {options.message}
        </div>

        {/* Action Buttons: Cancel is the DEFAULT button */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          {/* Destructive Action button (Requires deliberate click or Tab navigation) */}
          <button
            type="button"
            onClick={() => close(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-danger hover:text-white bg-danger/10 hover:bg-danger border border-danger/30 hover:border-danger transition-all cursor-pointer mr-auto"
          >
            {options.confirmLabel || 'Unwiderruflich löschen'}
          </button>

          {/* Cancel button (DEFAULT PRIMARY BUTTON, auto-focused) */}
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={() => close(false)}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/25 ring-2 ring-white/30 hover:ring-white/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {options.cancelLabel || 'Abbrechen'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
