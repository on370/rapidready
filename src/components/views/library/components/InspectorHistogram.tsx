import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface InspectorHistogramProps {
  imageRef: React.RefObject<HTMLImageElement | null>;
  triggerUpdate: string;
  mode: 'overlay' | 'full';
  hasFlag?: boolean;
}

interface HistogramData {
  rBins: Uint32Array;
  gBins: Uint32Array;
  bBins: Uint32Array;
  lumBins: Uint32Array;
  maxVal: number;
  shadowClipPct: number;
  highlightClipPct: number;
}

export function InspectorHistogram({ imageRef, triggerUpdate, mode, hasFlag = false }: InspectorHistogramProps) {
  const { t } = useTranslation('library');
  const [data, setData] = useState<HistogramData | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;

    const computeHistogram = () => {
      const img = imageRef.current;
      if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        return;
      }

      try {
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        const canvas = offscreenCanvasRef.current;

        // Downsample to max edge 160px for < 2ms execution time
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        let w = 160;
        let h = 106;
        if (naturalW >= naturalH) {
          w = 160;
          h = Math.max(1, Math.round(160 * (naturalH / naturalW)));
        } else {
          h = 160;
          w = Math.max(1, Math.round(160 * (naturalW / naturalH)));
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h).data;

        const rBins = new Uint32Array(256);
        const gBins = new Uint32Array(256);
        const bBins = new Uint32Array(256);
        const lumBins = new Uint32Array(256);
        let shadowCount = 0;
        let highlightCount = 0;
        const totalPixels = w * h;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const lum = Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));

          rBins[r]++;
          gBins[g]++;
          bBins[b]++;
          lumBins[lum]++;

          if (lum <= 2) shadowCount++;
          if (lum >= 253) highlightCount++;
        }

        // Ignore edge bins 0 & 255 for curve scaling so clipping spikes do not flatten the histogram
        let maxVal = 1;
        for (let x = 1; x < 255; x++) {
          if (rBins[x] > maxVal) maxVal = rBins[x];
          if (gBins[x] > maxVal) maxVal = gBins[x];
          if (bBins[x] > maxVal) maxVal = bBins[x];
          if (lumBins[x] > maxVal) maxVal = lumBins[x];
        }

        if (active) {
          setData({
            rBins,
            gBins,
            bBins,
            lumBins,
            maxVal,
            shadowClipPct: (shadowCount / totalPixels) * 100,
            highlightClipPct: (highlightCount / totalPixels) * 100,
          });
        }
      } catch (err) {
        // In case image is cross-origin tainted
        console.warn('Inspector histogram computation bypassed:', err);
      }
    };

    // Try computing immediately, or wait for load event
    const img = imageRef.current;
    if (img) {
      if (img.complete && img.naturalWidth > 0) {
        computeHistogram();
      } else {
        const onLoad = () => {
          if (active) computeHistogram();
        };
        img.addEventListener('load', onLoad, { once: true });
        return () => {
          active = false;
          img.removeEventListener('load', onLoad);
        };
      }
    }

    return () => {
      active = false;
    };
  }, [imageRef, triggerUpdate]);

  const { rPath, gPath, bPath, lumPath, lumStroke } = useMemo(() => {
    if (!data) return { rPath: '', gPath: '', bPath: '', lumPath: '', lumStroke: '' };
    const { rBins, gBins, bBins, lumBins, maxVal } = data;
    const h = 100;

    const buildPolygon = (bins: Uint32Array) => {
      let p = `M 0,${h}`;
      for (let x = 0; x < 256; x++) {
        let raw = bins[x];
        if (x === 0) raw = Math.min(raw, Math.max(bins[1], maxVal * 0.9));
        if (x === 255) raw = Math.min(raw, Math.max(bins[254], maxVal * 0.9));
        const val = Math.min(raw, maxVal);
        const y = Math.max(2, Math.min(h, h - (val / maxVal) * (h - 4)));
        p += ` L ${x},${y.toFixed(1)}`;
      }
      p += ` L 255,${h} Z`;
      return p;
    };

    const buildStroke = (bins: Uint32Array) => {
      let p = '';
      for (let x = 0; x < 256; x++) {
        let raw = bins[x];
        if (x === 0) raw = Math.min(raw, Math.max(bins[1], maxVal * 0.9));
        if (x === 255) raw = Math.min(raw, Math.max(bins[254], maxVal * 0.9));
        const val = Math.min(raw, maxVal);
        const y = Math.max(2, Math.min(h, h - (val / maxVal) * (h - 4)));
        p += (x === 0 ? `M 0,${y.toFixed(1)}` : ` L ${x},${y.toFixed(1)}`);
      }
      return p;
    };

    return {
      rPath: buildPolygon(rBins),
      gPath: buildPolygon(gBins),
      bPath: buildPolygon(bBins),
      lumPath: buildPolygon(lumBins),
      lumStroke: buildStroke(lumBins),
    };
  }, [data]);

  const isFull = mode === 'full';

  return (
    <div
      className={
        isFull
          ? "absolute inset-0 bg-[#121215] p-3 flex flex-col justify-between z-20 select-none animate-in fade-in duration-150"
          : `absolute top-2 left-2 ${hasFlag ? 'right-9' : 'right-2'} h-13 bg-black/70 backdrop-blur-md border border-white/15 rounded-lg p-1.5 flex flex-col justify-between z-20 pointer-events-none select-none shadow-xl overflow-hidden animate-in fade-in duration-150`
      }
    >
      {/* Full Mode Header with Clipping Badges */}
      {isFull && (
        <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-1.5 mb-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 font-medium transition-colors ${
                data && data.shadowClipPct > 0.1 ? 'text-cyan-400 font-semibold' : 'text-txt-tertiary opacity-60'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  data && data.shadowClipPct > 0.1 ? 'bg-cyan-400 animate-pulse' : 'bg-txt-tertiary opacity-40'
                }`}
              />
              ▼ {t('inspector.shadowClipping', 'Tiefen')}{' '}
              {data && data.shadowClipPct > 0.1 ? `(${data.shadowClipPct.toFixed(1)}%)` : ''}
            </span>
          </div>

          <span className="text-[10px] font-semibold text-txt-secondary uppercase tracking-wider font-sans">
            {t('inspector.histogramTitle', 'RGB + Luma')}
          </span>

          <div className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 font-medium transition-colors ${
                data && data.highlightClipPct > 0.1 ? 'text-amber-400 font-semibold' : 'text-txt-tertiary opacity-60'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  data && data.highlightClipPct > 0.1 ? 'bg-amber-400 animate-pulse' : 'bg-txt-tertiary opacity-40'
                }`}
              />
              ▲ {t('inspector.highlightClipping', 'Lichter')}{' '}
              {data && data.highlightClipPct > 0.1 ? `(${data.highlightClipPct.toFixed(1)}%)` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Overlay Mode Clipping Indicator Dots */}
      {!isFull && data && (
        <>
          {data.shadowClipPct > 0.5 && (
            <span 
              className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-500/50 z-30" 
              title={t('inspector.shadowClipping', 'Tiefen')}
            />
          )}
          {data.highlightClipPct > 0.5 && (
            <span 
              className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-500/50 z-30" 
              title={t('inspector.highlightClipping', 'Lichter')}
            />
          )}
        </>
      )}

      {/* SVG Plot */}
      <div className="relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <svg
          viewBox="0 0 256 100"
          preserveAspectRatio="none"
          className="w-full h-full overflow-hidden block"
        >
          {/* Subtle Vertical Zone Grid Lines (25%, 50%, 75%) */}
          <line x1="64" y1="0" x2="64" y2="100" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <line x1="128" y1="0" x2="128" y2="100" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
          <line x1="192" y1="0" x2="192" y2="100" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

          {data && (
            <g style={{ mixBlendMode: 'screen' }}>
              {/* Red Channel */}
              <path d={rPath} fill="rgba(239, 68, 68, 0.4)" />
              {/* Green Channel */}
              <path d={gPath} fill="rgba(34, 197, 94, 0.4)" />
              {/* Blue Channel */}
              <path d={bPath} fill="rgba(59, 130, 246, 0.4)" />
            </g>
          )}

          {data && (
            <>
              {/* Luminance Fill & Stroke */}
              <path d={lumPath} fill="rgba(255, 255, 255, 0.12)" />
              <path
                d={lumStroke}
                fill="none"
                stroke="rgba(255, 255, 255, 0.9)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
      </div>

      {/* Full Mode Footer Labels */}
      {isFull && (
        <div className="flex items-center justify-between text-[9px] font-mono text-txt-tertiary pt-1 border-t border-white/5 flex-shrink-0">
          <span>0 (Black)</span>
          <span>64</span>
          <span>128</span>
          <span>192</span>
          <span>255 (White)</span>
        </div>
      )}
    </div>
  );
}
