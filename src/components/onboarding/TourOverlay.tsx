import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useNavigationStore } from '../../stores/navigationStore';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

// Lightweight parser for bold (**bold**) and inline code (`code`) in tour text
function FormattedTourText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-xs text-txt-secondary leading-relaxed">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) return <div key={lineIdx} className="h-1" />;

        // Tokenize line into bold, code, and text parts
        const parts = line.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);

        return (
          <p key={lineIdx}>
            {parts.map((part, partIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={partIdx} className="font-semibold text-txt-primary">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return (
                  <code
                    key={partIdx}
                    className="font-mono text-[11px] bg-app-deepest px-1.5 py-0.5 rounded border border-app-border text-accent"
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              if (part.startsWith('*') && part.endsWith('*')) {
                return (
                  <em key={partIdx} className="italic text-txt-tertiary">
                    {part.slice(1, -1)}
                  </em>
                );
              }
              return <span key={partIdx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function TourOverlay() {
  const { t } = useTranslation('onboarding');
  const {
    isTourActive,
    currentStepIndex,
    stepsToShow,
    nextStep,
    prevStep,
    skipTour,
  } = useOnboardingStore();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentStep = stepsToShow[currentStepIndex];

  // Measure target element position
  const measureTarget = useCallback(() => {
    if (!currentStep) return;

    const el = document.querySelector(currentStep.targetSelector);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setTargetRect(null);
      return;
    }

    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      right: rect.right,
    });
  }, [currentStep]);

  // Navigate to target view, run beforeShow, and measure target
  useEffect(() => {
    if (!isTourActive || !currentStep) return;

    let isMounted = true;

    const prepareStep = async () => {
      // 1. Switch active view if targetView is defined and not currently active
      if (currentStep.targetView) {
        const activeView = useNavigationStore.getState().activeView;
        if (activeView !== currentStep.targetView) {
          useNavigationStore.getState().setActiveView(currentStep.targetView);
        }
      }

      // 2. Run beforeShow callback (e.g. switch to Loupe or expand panel)
      if (currentStep.beforeShow) {
        try {
          await currentStep.beforeShow();
        } catch (e) {
          console.error('Failed to run beforeShow for tour step:', e);
        }
      }

      // 3. Give DOM a moment to mount / transition, then measure
      setTimeout(() => {
        if (!isMounted) return;

        const el = document.querySelector(currentStep.targetSelector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          measureTarget();
          setTimeout(() => { if (isMounted) measureTarget(); }, 200);
          setTimeout(() => { if (isMounted) measureTarget(); }, 400);
        } else {
          // Retry once after slightly longer delay
          setTimeout(() => {
            if (!isMounted) return;
            const retryEl = document.querySelector(currentStep.targetSelector);
            if (retryEl) {
              retryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
              measureTarget();
            } else {
              // Target element genuinely missing in DOM: silently skip to next step
              console.warn(`[Tour] Target ${currentStep.targetSelector} not found. Skipping.`);
              nextStep();
            }
          }, 250);
        }
      }, 100);
    };

    prepareStep();

    return () => {
      isMounted = false;
    };
  }, [isTourActive, currentStepIndex, currentStep, measureTarget, nextStep]);

  // Update target on resize and scroll
  useEffect(() => {
    if (!isTourActive) return;

    const handleUpdate = () => {
      measureTarget();
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isTourActive, measureTarget]);

  // Keyboard navigation: ArrowRight / Enter -> Next, ArrowLeft -> Prev, Escape -> Skip
  useEffect(() => {
    if (!isTourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        skipTour(true);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourActive, nextStep, prevStep, skipTour]);

  // Calculate Popover Position & Viewport Containment
  const popoverStyle = useMemo(() => {
    if (!targetRect) {
      // Fallback: center in screen if target rect not measured
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const popoverWidth = popoverRef.current ? popoverRef.current.offsetWidth : 360;
    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 240;
    const margin = 14;
    const padding = 8;
    const viewportMargin = 16;

    const preferred = currentStep.placement || 'bottom';

    // Build search order based on preferred placement
    const order: Array<'right' | 'left' | 'bottom' | 'top'> = (() => {
      switch (preferred) {
        case 'right': return ['right', 'left', 'bottom', 'top'];
        case 'left': return ['left', 'right', 'bottom', 'top'];
        case 'top': return ['top', 'bottom', 'right', 'left'];
        case 'bottom':
        default: return ['bottom', 'top', 'right', 'left'];
      }
    })();

    // Target boundaries including spotlight padding
    const tLeft = targetRect.left - padding;
    const tRight = targetRect.right + padding;
    const tTop = targetRect.top - padding;
    const tBottom = targetRect.bottom + padding;

    // Helper: test if [x, y, popoverWidth, popoverHeight] overlaps targetRect
    const overlapsTarget = (x: number, y: number) => {
      return (
        x < tRight &&
        x + popoverWidth > tLeft &&
        y < tBottom &&
        y + popoverHeight > tTop
      );
    };

    // Calculate candidate positions for each direction
    type Candidate = {
      dir: 'right' | 'left' | 'bottom' | 'top';
      x: number;
      y: number;
      fitsInViewport: boolean;
      overlaps: boolean;
      availableSpace: number;
    };

    const candidates: Candidate[] = order.map((dir) => {
      let x = 0;
      let y = 0;
      let fitsInViewport = false;
      let availableSpace = 0;

      if (dir === 'right') {
        x = targetRect.right + padding + margin;
        // Vertically center on target, then clamp within viewport
        y = targetRect.top + targetRect.height / 2 - popoverHeight / 2;
        y = Math.max(viewportMargin, Math.min(y, window.innerHeight - popoverHeight - viewportMargin));
        availableSpace = window.innerWidth - (targetRect.right + padding + margin);
        fitsInViewport = x + popoverWidth <= window.innerWidth - viewportMargin;
      } else if (dir === 'left') {
        x = targetRect.left - padding - margin - popoverWidth;
        y = targetRect.top + targetRect.height / 2 - popoverHeight / 2;
        y = Math.max(viewportMargin, Math.min(y, window.innerHeight - popoverHeight - viewportMargin));
        availableSpace = targetRect.left - padding - margin;
        fitsInViewport = x >= viewportMargin;
      } else if (dir === 'bottom') {
        // Horizontally center on target, then clamp within viewport
        x = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
        x = Math.max(viewportMargin, Math.min(x, window.innerWidth - popoverWidth - viewportMargin));
        y = targetRect.bottom + padding + margin;
        availableSpace = window.innerHeight - (targetRect.bottom + padding + margin);
        fitsInViewport = y + popoverHeight <= window.innerHeight - viewportMargin;
      } else {
        // 'top'
        x = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
        x = Math.max(viewportMargin, Math.min(x, window.innerWidth - popoverWidth - viewportMargin));
        y = targetRect.top - padding - margin - popoverHeight;
        availableSpace = targetRect.top - padding - margin;
        fitsInViewport = y >= viewportMargin;
      }

      const overlaps = overlapsTarget(x, y);

      return { dir, x, y, fitsInViewport, overlaps, availableSpace };
    });

    // 1. First priority: First direction in preferred order that fits in viewport AND does NOT overlap target
    const bestCandidate = candidates.find((c) => c.fitsInViewport && !c.overlaps);
    if (bestCandidate) {
      return {
        top: `${bestCandidate.y}px`,
        left: `${bestCandidate.x}px`,
      };
    }

    // 2. Second priority: Any candidate that does NOT overlap, clamped to viewport
    const nonOverlapping = candidates.find((c) => !c.overlaps);
    if (nonOverlapping) {
      const clampedX = Math.max(viewportMargin, Math.min(nonOverlapping.x, window.innerWidth - popoverWidth - viewportMargin));
      const clampedY = Math.max(viewportMargin, Math.min(nonOverlapping.y, window.innerHeight - popoverHeight - viewportMargin));
      return {
        top: `${clampedY}px`,
        left: `${clampedX}px`,
      };
    }

    // 3. Third priority: Candidate with the maximum available space outside the target
    const sortedBySpace = [...candidates].sort((a, b) => b.availableSpace - a.availableSpace);
    const fallback = sortedBySpace[0];
    const clampedX = Math.max(viewportMargin, Math.min(fallback.x, window.innerWidth - popoverWidth - viewportMargin));
    const clampedY = Math.max(viewportMargin, Math.min(fallback.y, window.innerHeight - popoverHeight - viewportMargin));

    return {
      top: `${clampedY}px`,
      left: `${clampedX}px`,
    };
  }, [targetRect, currentStep]);

  if (!isTourActive || !currentStep) return null;

  const isLastStep = currentStepIndex === stepsToShow.length - 1;
  const isFirstStep = currentStepIndex === 0;

  const padding = 6;
  const targetX = targetRect ? Math.max(0, targetRect.left - padding) : 0;
  const targetY = targetRect ? Math.max(0, targetRect.top - padding) : 0;
  const targetW = targetRect ? targetRect.width + padding * 2 : 0;
  const targetH = targetRect ? targetRect.height + padding * 2 : 0;

  return (
    <div className="fixed inset-0 z-[9000] overflow-hidden select-none pointer-events-auto">
      {/* SVG Spotlight Cutout Backdrop */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none transition-all duration-300"
        style={{ width: '100vw', height: '100vh' }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* White covers entire screen */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black punch-through cutout around target with rounded corners */}
            {targetRect && (
              <rect
                x={targetX}
                y={targetY}
                width={targetW}
                height={targetH}
                rx="10"
                ry="10"
                fill="black"
                className="transition-all duration-300 ease-out"
              />
            )}
          </mask>
        </defs>

        {/* Dimmed backdrop masked with spotlight */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#tour-spotlight-mask)"
          className="pointer-events-auto cursor-default"
          onClick={() => nextStep()}
        />
      </svg>

      {/* Pulsing Accent Glow Ring around target */}
      {targetRect && (
        <div
          className="fixed pointer-events-none rounded-xl ring-2 ring-accent/80 shadow-[0_0_24px_rgba(6,182,212,0.4)] transition-all duration-300 ease-out animate-pulse"
          style={{
            top: `${targetY}px`,
            left: `${targetX}px`,
            width: `${targetW}px`,
            height: `${targetH}px`,
          }}
        />
      )}

      {/* Callout Popover Card */}
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="fixed z-[9100] w-[340px] sm:w-[380px] bg-app-panel border border-app-border rounded-2xl shadow-2xl p-5 text-txt-primary flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Step counter + dots + close */}
        <div className="flex items-center justify-between border-b border-app-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
              {t('ui.stepCounter', {
                current: currentStepIndex + 1,
                total: stepsToShow.length,
              })}
            </span>

            {/* Step progress pills / dots */}
            <div className="flex items-center gap-1 ml-1.5">
              {stepsToShow.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === currentStepIndex
                      ? 'w-4 bg-accent'
                      : i < currentStepIndex
                      ? 'w-1.5 bg-accent/40'
                      : 'w-1.5 bg-app-border'
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => skipTour(true)}
            className="p-1 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer"
            title={t('ui.skipTour', 'Tour beenden')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-txt-primary flex items-center gap-2">
            <span>{t(`${currentStep.i18nKey}.title`)}</span>
          </h3>

          <FormattedTourText text={t(`${currentStep.i18nKey}.body`)} />
        </div>

        {/* Action Controls Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-app-border/40 mt-1">
          <button
            type="button"
            onClick={() => skipTour(true)}
            className="text-[11px] text-txt-tertiary hover:text-txt-secondary transition-colors cursor-pointer"
          >
            {t('ui.skipTour', 'Tour beenden')}
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-hover text-xs font-medium text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('ui.prev', 'Zurück')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 text-xs font-semibold shadow-md shadow-accent/20 transition-all cursor-pointer active:scale-95"
            >
              <span>{isLastStep ? t('ui.finish', 'Verstanden!') : t('ui.next', 'Weiter')}</span>
              {isLastStep ? <Check className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
