import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RotateCw, RotateCcw, Check, X, CircleSlash, Star, Rocket, FolderOpen } from 'lucide-react';
import { isMac, modSymbol, shiftSymbol } from '../../../utils/platform';
import { COLOR_PALETTE } from '../../../constants/culling';

export interface ContextMenuProps {
  x: number;
  y: number;
  selectedCount: number;
  currentRating?: number;
  currentColor?: string | null;
  onClose: () => void;
  onRotate: (direction: 'cw' | 'ccw') => void;
  onCulling: (flag?: number | null, rating?: number) => void;
  onSetColor?: (color: string | null) => void;
  onOpenInRapidRaw: () => void;
  onShowInFinder: () => void;
  zoomOptions?: {
    currentScale: number;
    onSetScale: (scale: number) => void;
  };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  selectedCount,
  currentRating = 0,
  currentColor,
  onClose,
  onRotate,
  onCulling,
  onSetColor,
  onOpenInRapidRaw,
  onShowInFinder,
  zoomOptions,
}) => {
  const { t } = useTranslation('library');
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

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

  // Adjust coordinates so the menu doesn't overflow screen
  const menuWidth = 240;
  const menuHeight = zoomOptions ? 490 : 400;
  // If not enough room to the right, open to the left of the cursor
  const adjX = x + menuWidth > window.innerWidth - 10
    ? Math.max(10, x - menuWidth)
    : Math.max(10, x);
  // If not enough room below, open above the cursor
  const adjY = y + menuHeight > window.innerHeight - 10
    ? Math.max(10, y - menuHeight)
    : Math.max(10, y);

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: adjX, top: adjY }}
      className="fixed z-[9999] w-60 bg-[#161619]/95 backdrop-blur-md border border-app-border rounded-xl shadow-2xl py-1.5 text-xs text-txt-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {selectedCount > 1 && (
        <div className="px-3 py-1.5 text-[11px] font-semibold text-txt-tertiary border-b border-app-border mb-1 flex items-center justify-between">
          <span>{t('contextMenu.selectedCount', { count: selectedCount })}</span>
        </div>
      )}

      {/* Zoom Options (Loupe View only) */}
      {zoomOptions && (
        <>
          <div className="px-1 py-0.5 space-y-0.5">
            <button
              onClick={() => { zoomOptions.onSetScale(0); onClose(); }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Check className={`w-3.5 h-3.5 transition-opacity ${zoomOptions.currentScale <= 0 ? 'text-accent group-hover:text-white opacity-100' : 'opacity-0'}`} />
                <span>{t('contextMenu.zoomFit', 'Einpassen')}</span>
              </div>
              <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">Z</span>
            </button>
            <button
              onClick={() => { zoomOptions.onSetScale(1); onClose(); }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Check className={`w-3.5 h-3.5 transition-opacity ${Math.abs(zoomOptions.currentScale - 1) < 0.05 ? 'text-accent group-hover:text-white opacity-100' : 'opacity-0'}`} />
                <span>{t('contextMenu.zoom100', '100% (1:1)')}</span>
              </div>
            </button>
            <button
              onClick={() => { zoomOptions.onSetScale(2); onClose(); }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Check className={`w-3.5 h-3.5 transition-opacity ${Math.abs(zoomOptions.currentScale - 2) < 0.05 ? 'text-accent group-hover:text-white opacity-100' : 'opacity-0'}`} />
                <span>{t('contextMenu.zoom200', '200% (2:1)')}</span>
              </div>
            </button>
          </div>

          <div className="h-px bg-app-border my-1" />
        </>
      )}

      {/* Rotation */}
      <div className="px-1 py-0.5 space-y-0.5">
        <button
          onClick={() => { onRotate('cw'); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 text-txt-secondary group-hover:text-white" />
            <span>{t('contextMenu.rotateCw')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">{modSymbol}R / .</span>
        </button>
        <button
          onClick={() => { onRotate('ccw'); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-txt-secondary group-hover:text-white" />
            <span>{t('contextMenu.rotateCcw')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">{modSymbol}L / ,</span>
        </button>
      </div>

      <div className="h-px bg-app-border my-1" />

      {/* Flags */}
      <div className="px-1 py-0.5 space-y-0.5">
        <button
          onClick={() => { onCulling(1); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-success/20 hover:text-success transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-success" />
            <span>{t('contextMenu.pick')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary font-mono">P</span>
        </button>
        <button
          onClick={() => { onCulling(-1); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-danger/20 hover:text-danger transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <X className="w-3.5 h-3.5 text-danger" />
            <span>{t('contextMenu.reject')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary font-mono">X</span>
        </button>
        <button
          onClick={() => { onCulling(null); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <CircleSlash className="w-3.5 h-3.5 text-txt-tertiary" />
            <span>{t('contextMenu.unrated')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary font-mono">U</span>
        </button>
      </div>

      <div className="h-px bg-app-border my-1" />

      {/* Star Ratings Row */}
      <div className="px-2 py-1 flex items-center justify-between">
        <span className="text-[11px] text-txt-tertiary font-medium">{t('contextMenu.rating')}</span>
        <div 
          className="flex items-center gap-1"
          onMouseLeave={() => setHoverRating(null)}
        >
          <button
            onClick={() => { onCulling(undefined, 0); onClose(); }}
            title="0 Sterne"
            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] transition-colors cursor-pointer ${
              currentRating === 0
                ? 'text-white bg-white/10 font-bold'
                : 'text-txt-tertiary hover:bg-app-hover hover:text-white'
            }`}
          >
            0
          </button>
          {[1, 2, 3, 4, 5].map((s) => {
            const isLit = hoverRating !== null ? hoverRating >= s : currentRating >= s;
            return (
              <button
                key={s}
                onClick={() => {
                  onCulling(undefined, currentRating === s ? 0 : s);
                  onClose();
                }}
                onMouseEnter={() => setHoverRating(s)}
                title={`${s} Sterne`}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-warning/20 hover:scale-110 transition-all cursor-pointer"
              >
                <Star
                  className={`w-3.5 h-3.5 transition-colors ${
                    isLit ? 'text-warning fill-warning' : 'text-txt-tertiary hover:text-warning/60'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Color Labels Row */}
      {onSetColor && (
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-[11px] text-txt-tertiary font-medium">{t('toolbar.colorLabel')}</span>
          <div className="flex items-center gap-1.5">
            {COLOR_PALETTE.map((c) => {
              const isSelected = currentColor === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    onSetColor(isSelected ? null : c.id);
                    onClose();
                  }}
                  title={`${t(`colors.${c.id}`)}${c.shortcut ? ` (${c.shortcut})` : ''}`}
                  className={`w-4 h-4 rounded-full ${c.bg} flex items-center justify-center hover:scale-120 transition-all cursor-pointer relative shadow-sm ${
                    isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-[#161619]' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-white drop-shadow" />}
                </button>
              );
            })}
            <button
              onClick={() => {
                onSetColor(null);
                onClose();
              }}
              title={t('colors.none')}
              className={`w-4 h-4 rounded-full bg-app-panel border border-app-border flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:scale-120 transition-all cursor-pointer ${
                !currentColor ? 'opacity-30 cursor-default' : ''
              }`}
            >
              <CircleSlash className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}

      <div className="h-px bg-app-border my-1" />

      {/* External Actions */}
      <div className="px-1 py-0.5 space-y-0.5">
        <button
          onClick={() => { onOpenInRapidRaw(); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <Rocket className="w-3.5 h-3.5 text-accent group-hover:text-white" />
            <span>{t('toolbar.openInRapidRaw')}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary group-hover:text-white/80 font-mono">R</span>
        </button>
        <button
          onClick={() => { onShowInFinder(); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-app-hover transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-primary" />
            <span>{isMac ? t('toolbar.showInFinder') : (t('toolbar.showInExplorer', 'Im Explorer'))}</span>
          </div>
          <span className="text-[10px] text-txt-tertiary font-mono">{modSymbol}{shiftSymbol}F</span>
        </button>
      </div>
    </div>,
    document.body
  );
};
