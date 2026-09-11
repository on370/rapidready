import { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent, WheelEvent } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PairedImportItem } from "../ImportPreviewStep";
import { getRrImageUrl } from "../../../../utils/image";

interface ImportLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  pair: PairedImportItem;
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onToggleSelection: (paths: string[], selected: boolean) => void;
}

export function ImportLightboxModal({
  isOpen,
  onClose,
  pair,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onToggleSelection,
}: ImportLightboxModalProps) {
  const { t } = useTranslation("import");
  const [is100, setIs100] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const [fullresReady, setFullresReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const startDragPos = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);

  const previewSrc = getRrImageUrl(pair.previewFile.path, false, undefined, 2);
  const fullresSrc = getRrImageUrl(pair.previewFile.path, true);
  const [currentSrc, setCurrentSrc] = useState(previewSrc);

  // Progressive loading: Start with 512px preview fast-path, upgrade to full-res
  useEffect(() => {
    setIs100(false);
    setPosition({ x: 0, y: 0 });
    setFullresReady(false);
    setCurrentSrc(previewSrc);

    const img = new Image();
    img.src = fullresSrc;
    if (img.complete && img.naturalWidth > 0) {
      setCurrentSrc(fullresSrc);
      setFullresReady(true);
    } else {
      img.onload = () => {
        setCurrentSrc(fullresSrc);
        setFullresReady(true);
      };
    }
  }, [pair.previewFile.path, previewSrc, fullresSrc]);

  const clampAndSetPosition = useCallback((x: number, y: number) => {
    if (!containerRef.current || !imageRef.current) return;
    const contRect = containerRef.current.getBoundingClientRect();

    const imgW = imageRef.current.naturalWidth;
    const imgH = imageRef.current.naturalHeight;

    const maxTx = Math.max(0, (imgW - contRect.width) / 2);
    const maxTy = Math.max(0, (imgH - contRect.height) / 2);

    setPosition({
      x: Math.max(-maxTx, Math.min(maxTx, x)),
      y: Math.max(-maxTy, Math.min(maxTy, y)),
    });
  }, []);

  const toggleZoom = useCallback((e?: ReactMouseEvent) => {
    if (is100) {
      setIs100(false);
      setPosition({ x: 0, y: 0 });
    } else {
      setIs100(true);
      if (e && containerRef.current && imageRef.current) {
        const contRect = containerRef.current.getBoundingClientRect();
        const clickX = e.clientX - contRect.left - contRect.width / 2;
        const clickY = e.clientY - contRect.top - contRect.height / 2;

        const imgRect = imageRef.current.getBoundingClientRect();
        const ratioX = imgRect.width > 0 ? imageRef.current.naturalWidth / imgRect.width : 1;
        const ratioY = imgRect.height > 0 ? imageRef.current.naturalHeight / imgRect.height : 1;

        clampAndSetPosition(-clickX * ratioX, -clickY * ratioY);
      } else {
        setPosition({ x: 0, y: 0 });
      }
    }
  }, [is100, clampAndSetPosition]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (hasPrev) onPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (hasNext) onNext();
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        onToggleSelection(pair.files.map((f) => f.path), !pair.selected);
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        toggleZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasPrev, hasNext, onPrev, onNext, onClose, onToggleSelection, pair, toggleZoom]);

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    dragDistance.current = 0;
    if (!is100) return;

    e.preventDefault();
    setIsDragging(true);
    startDragPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    if (isMinimapDragging) {
      handleMinimapMove(e);
      return;
    }
    if (!isDragging || !is100) return;

    dragDistance.current += Math.abs(e.movementX) + Math.abs(e.movementY);
    clampAndSetPosition(
      e.clientX - startDragPos.current.x,
      e.clientY - startDragPos.current.y
    );
  };

  const onMouseUp = () => {
    setIsDragging(false);
    setIsMinimapDragging(false);
  };

  const handleImageClick = (e: ReactMouseEvent) => {
    if (dragDistance.current > 5) {
      // Was a drag, do not toggle zoom
      return;
    }
    toggleZoom(e);
  };

  const onWheel = (e: WheelEvent) => {
    if (!is100 || !containerRef.current || !imageRef.current) return;
    e.preventDefault();

    const contRect = containerRef.current.getBoundingClientRect();
    const imgW = imageRef.current.naturalWidth;
    const imgH = imageRef.current.naturalHeight;

    const maxTx = Math.max(0, (imgW - contRect.width) / 2);
    const maxTy = Math.max(0, (imgH - contRect.height) / 2);

    setPosition((prev) => ({
      x: Math.max(-maxTx, Math.min(maxTx, prev.x - e.deltaX)),
      y: Math.max(-maxTy, Math.min(maxTy, prev.y - e.deltaY)),
    }));
  };

  const onMinimapMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setIsMinimapDragging(true);
    handleMinimapMove(e);
  };

  const handleMinimapMove = (e: ReactMouseEvent | MouseEvent) => {
    if (!minimapRef.current || !containerRef.current || !imageRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();

    let px = (e.clientX - rect.left) / rect.width;
    let py = (e.clientY - rect.top) / rect.height;

    px = Math.max(0, Math.min(1, px));
    py = Math.max(0, Math.min(1, py));

    const contRect = containerRef.current.getBoundingClientRect();
    const imgW = imageRef.current.naturalWidth;
    const imgH = imageRef.current.naturalHeight;

    const maxTx = Math.max(0, (imgW - contRect.width) / 2);
    const maxTy = Math.max(0, (imgH - contRect.height) / 2);

    setPosition({
      x: (0.5 - px) * maxTx * 2,
      y: (0.5 - py) * maxTy * 2,
    });
  };

  // Calculate minimap indicator
  let mmWidth = "100%";
  let mmHeight = "100%";
  let mmTx = 0;
  let mmTy = 0;

  if (is100 && containerRef.current && imageRef.current) {
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const iW_nat = imageRef.current.naturalWidth;
    const iH_nat = imageRef.current.naturalHeight;

    if (iW_nat > 0 && iH_nat > 0) {
      const ratioX = Math.min(1, cW / iW_nat);
      const ratioY = Math.min(1, cH / iH_nat);
      mmWidth = `${ratioX * 100}%`;
      mmHeight = `${ratioY * 100}%`;

      const maxTx = Math.max(0, (iW_nat - cW) / 2);
      const maxTy = Math.max(0, (iH_nat - cH) / 2);

      if (maxTx > 0) {
        const panPctX = (maxTx - position.x) / (2 * maxTx);
        mmTx = panPctX * (1 - ratioX) * 100;
      } else {
        mmTx = (1 - ratioX) * 50;
      }

      if (maxTy > 0) {
        const panPctY = (maxTy - position.y) / (2 * maxTy);
        mmTy = panPctY * (1 - ratioY) * 100;
      } else {
        mmTy = (1 - ratioY) * 50;
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-150"
      onClick={(e) => {
        // If clicking directly on backdrop outside of container elements
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Header Bar */}
      <div className="h-14 px-5 bg-black/80 border-b border-white/10 flex items-center justify-between z-30 flex-shrink-0">
        {/* Left: Close button & File info */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={`${t("preview.lightboxClose")} (Esc)`}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-white truncate max-w-[280px]">
              {pair.stem}
            </span>

            {pair.rawFile && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-medium">
                {pair.rawFile.name.split(".").pop()?.toUpperCase()}
              </span>
            )}
            {pair.jpgFile && (
              <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent font-mono font-medium">
                JPG
              </span>
            )}

            <span className="text-xs text-white/40 font-mono">
              {(pair.totalSize / (1024 * 1024)).toFixed(1)} MB
            </span>

            <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full ml-1">
              {t("preview.photoCounter", { current: currentIndex + 1, total: totalCount })}
            </span>
          </div>
        </div>

        {/* Center: Zoom Mode Controls */}
        <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10">
          <button
            onClick={() => {
              setIs100(false);
              setPosition({ x: 0, y: 0 });
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              !is100
                ? "bg-white/20 text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>{t("preview.lightboxFit")}</span>
          </button>
          <button
            onClick={() => {
              setIs100(true);
              setPosition({ x: 0, y: 0 });
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              is100
                ? "bg-accent text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>{t("preview.lightbox100")}</span>
          </button>
        </div>

        {/* Right: Selection toggle & Shortcut hint */}
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(
                pair.files.map((f) => f.path),
                !pair.selected
              );
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              pair.selected
                ? "bg-accent/20 border-accent/40 text-accent hover:bg-accent/30"
                : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <div className={`custom-checkbox cursor-pointer ${pair.selected ? "checked" : ""}`}>
              {pair.selected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5L4.5 7.5L8 3"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span>{t("preview.selectedForImport")}</span>
          </button>

          <div className="hidden xl:flex items-center gap-1 text-[11px] text-white/40 border-l border-white/10 pl-3">
            <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/15 text-[10px] text-white/70">
              Space
            </kbd>
            <span>Auswahl</span>
            <span className="mx-1 text-white/20">&bull;</span>
            <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/15 text-[10px] text-white/70">
              Z
            </kbd>
            <span>Zoom</span>
            <span className="mx-1 text-white/20">&bull;</span>
            <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/15 text-[10px] text-white/70">
              Esc
            </kbd>
            <span>Schließen</span>
          </div>
        </div>
      </div>

      {/* Main Center Area with Viewer */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-hidden flex items-center justify-center bg-black/90 cursor-default"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Navigation buttons */}
        {hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md transition-all z-20 shadow-2xl hover:scale-105 active:scale-95"
            title="Vorheriges Bild (Pfeiltaste links)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md transition-all z-20 shadow-2xl hover:scale-105 active:scale-95"
            title="Nächstes Bild (Pfeiltaste rechts)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Minimap for 1:1 Sensor Navigation */}
        {is100 && (
          <div
            ref={minimapRef}
            onMouseDown={onMinimapMouseDown}
            className="absolute bottom-6 right-6 h-28 bg-black/75 border border-white/25 rounded-lg shadow-2xl overflow-hidden flex items-center justify-center z-40 cursor-crosshair"
            style={{
              aspectRatio:
                imageRef.current?.naturalWidth && imageRef.current?.naturalHeight
                  ? `${imageRef.current.naturalWidth} / ${imageRef.current.naturalHeight}`
                  : "3/2",
            }}
          >
            <img
              src={currentSrc}
              alt=""
              className="w-full h-full object-fill opacity-50 pointer-events-none"
            />
            <div
              className="absolute border-2 border-accent bg-accent/25 pointer-events-none rounded-[2px]"
              style={{
                width: mmWidth,
                height: mmHeight,
                left: `${mmTx}%`,
                top: `${mmTy}%`,
              }}
            />
          </div>
        )}

        {/* The Image */}
        <img
          ref={imageRef}
          src={currentSrc}
          alt={pair.stem}
          onMouseDown={onMouseDown}
          onClick={handleImageClick}
          className={`select-none ${!isDragging ? "transition-transform duration-150" : ""}`}
          style={{
            cursor: is100 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
            transform: is100
              ? `translate(${position.x}px, ${position.y}px)`
              : "scale(1)",
            maxWidth: is100 ? "none" : "100%",
            maxHeight: is100 ? "none" : "100%",
            objectFit: is100 ? "none" : "contain",
          }}
          draggable={false}
        />

        {/* Loading badge for fullres arrival */}
        {!fullresReady && (
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white/60 text-xs px-2.5 py-1 rounded-md border border-white/10 pointer-events-none animate-pulse">
            Lade Sensor-Schärfe...
          </div>
        )}
      </div>
    </div>
  );
}
