import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Scissors, Copy, ClipboardPaste, CheckSquare } from 'lucide-react';
import { modSymbol } from '../../utils/platform';

export interface TextContextMenuProps {
  x: number;
  y: number;
  target: HTMLInputElement | HTMLTextAreaElement;
  onClose: () => void;
}

export const TextContextMenu: React.FC<TextContextMenuProps> = ({
  x,
  y,
  target,
  onClose,
}) => {
  const { t } = useTranslation('common');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const hasSelection = (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
  const hasText = target.value.length > 0;

  const handleCut = async () => {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const selectedText = target.value.substring(start, end);
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
      } catch {
        target.focus();
        document.execCommand('cut');
      }
      target.focus();
      target.setRangeText('', start, end, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    onClose();
  };

  const handleCopy = async () => {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const selectedText = target.value.substring(start, end);
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
      } catch {
        target.focus();
        document.execCommand('copy');
      }
    }
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text !== undefined) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        target.focus();
        target.setRangeText(text, start, end, 'end');
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch {
      target.focus();
      document.execCommand('paste');
    }
    onClose();
  };

  const handleSelectAll = () => {
    target.focus();
    target.select();
    onClose();
  };

  // Adjust coordinates to stay on screen
  const menuWidth = 190;
  const menuHeight = 150;
  const adjX = x + menuWidth > window.innerWidth - 10
    ? Math.max(10, x - menuWidth)
    : Math.max(10, x);
  const adjY = y + menuHeight > window.innerHeight - 10
    ? Math.max(10, y - menuHeight)
    : Math.max(10, y);

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: adjX, top: adjY }}
      className="fixed z-[99999] w-48 bg-[#161619]/95 backdrop-blur-md border border-app-border rounded-xl shadow-2xl py-1 text-xs text-txt-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="px-1 py-0.5 space-y-0.5">
        <button
          onClick={handleCut}
          disabled={!hasSelection}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors group ${
            hasSelection
              ? 'hover:bg-accent hover:text-white cursor-pointer'
              : 'opacity-40 cursor-default text-txt-tertiary'
          }`}
        >
          <div className="flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5" />
            <span>{t('textMenu.cut', 'Ausschneiden')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">{modSymbol}X</span>
        </button>

        <button
          onClick={handleCopy}
          disabled={!hasSelection}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors group ${
            hasSelection
              ? 'hover:bg-accent hover:text-white cursor-pointer'
              : 'opacity-40 cursor-default text-txt-tertiary'
          }`}
        >
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5" />
            <span>{t('textMenu.copy', 'Kopieren')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">{modSymbol}C</span>
        </button>

        <button
          onClick={handlePaste}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>{t('textMenu.paste', 'Einfügen')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">{modSymbol}V</span>
        </button>
      </div>

      <div className="h-px bg-app-border my-1" />

      <div className="px-1 py-0.5">
        <button
          onClick={handleSelectAll}
          disabled={!hasText}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors group ${
            hasText
              ? 'hover:bg-accent hover:text-white cursor-pointer'
              : 'opacity-40 cursor-default text-txt-tertiary'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{t('textMenu.selectAll', 'Alles auswählen')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">{modSymbol}A</span>
        </button>
      </div>
    </div>,
    document.body
  );
};
