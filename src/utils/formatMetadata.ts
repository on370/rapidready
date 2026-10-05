/**
 * Formats a raw shutter speed string to standard photography conventions (e.g. "1/500s", "1/2.5s", "2s", "30s").
 * Prevents floating point precision overflows like "1/513.765947654489709870987" or "1/513.7659...s".
 */
export function formatShutterSpeed(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/s$/i, '').replace(/"$/i, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('1/')) {
    const denomStr = trimmed.slice(2).trim();
    const denom = parseFloat(denomStr);
    if (!isNaN(denom) && denom > 0) {
      if (denom >= 10) {
        return `1/${Math.round(denom)}s`;
      }
      if (Math.abs(denom - Math.round(denom)) < 0.05) {
        return `1/${Math.round(denom)}s`;
      }
      if (denom >= 1) {
        return `1/${denom.toFixed(1).replace(/\.0$/, '')}s`;
      }
      // Denominator < 1 (e.g. 1/0.5s = 2s)
      const secs = 1 / denom;
      return Math.abs(secs - Math.round(secs)) < 0.05
        ? `${Math.round(secs)}s`
        : `${secs.toFixed(1).replace(/\.0$/, '')}s`;
    }
  }

  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 0) {
    if (num < 1) {
      const denom = 1 / num;
      if (denom >= 10) {
        return `1/${Math.round(denom)}s`;
      }
      if (Math.abs(denom - Math.round(denom)) < 0.05) {
        return `1/${Math.round(denom)}s`;
      }
      return `1/${denom.toFixed(1).replace(/\.0$/, '')}s`;
    }
    return Math.abs(num - Math.round(num)) < 0.05
      ? `${Math.round(num)}s`
      : `${num.toFixed(1).replace(/\.0$/, '')}s`;
  }

  return raw.endsWith('s') ? raw : `${raw}s`;
}

/**
 * Formats aperture cleanly (e.g. "f/2.8", "f/4", "f/1.4", "f/11").
 */
export function formatAperture(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^f\/?/i, '').trim();
  if (!trimmed) return null;

  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 0) {
    if (num >= 10 && Math.abs(num - Math.round(num)) < 0.1) {
      return `f/${Math.round(num)}`;
    }
    const fixed = num.toFixed(1);
    if (fixed.endsWith('.0')) {
      return `f/${Math.round(num)}`;
    }
    return `f/${fixed}`;
  }

  return raw.toLowerCase().startsWith('f/') ? raw : `f/${raw}`;
}

/**
 * Formats ISO sensitivity cleanly (e.g. "ISO 100", "ISO 3200").
 */
export function formatIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^iso\s*/i, '').trim();
  if (!cleaned) return null;

  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 0) {
    return `ISO ${Math.round(num)}`;
  }
  return `ISO ${cleaned}`;
}

/**
 * Formats focal length cleanly (e.g. "24 mm", "50 mm", "70.5 mm").
 */
export function formatFocalLength(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const numPart = trimmed.replace(/\s*mm$/i, '').trim();
  const num = parseFloat(numPart);
  if (!isNaN(num) && num > 0) {
    if (Math.abs(num - Math.round(num)) < 0.05) {
      return `${Math.round(num)} mm`;
    }
    return `${num.toFixed(1).replace(/\.0$/, '')} mm`;
  }
  return trimmed.toLowerCase().endsWith('mm') ? trimmed : `${trimmed} mm`;
}

/**
 * Formats exposure bias / compensation cleanly (e.g. "±0.0 EV", "+0.7 EV", "-1.3 EV", "+1.0 EV").
 */
export function formatExposureBias(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/ev$/i, '').trim();
  if (!trimmed) return null;

  // Direct check for zero or already-formatted zero symbols
  if (
    trimmed === '0' ||
    trimmed === '0.0' ||
    trimmed === '-0.0' ||
    trimmed === '+0.0' ||
    trimmed === '±0.0' ||
    trimmed === '±0' ||
    trimmed === '+/- 0.0' ||
    trimmed === '+/-0.0' ||
    trimmed === '+/- 0' ||
    trimmed === '+-0.0' ||
    trimmed === '+ +/- 0.0' ||
    trimmed === '+±0.0' ||
    /^[±\+\-\/\s]*0(\.0+)?$/.test(trimmed)
  ) {
    return '±0.0 EV';
  }

  let num: number | null = null;
  if (trimmed.includes('/')) {
    const [numStr, denomStr] = trimmed.split('/');
    const n = parseFloat(numStr.replace(/^\+/, ''));
    const d = parseFloat(denomStr.replace(/^\+/, ''));
    if (!isNaN(n) && !isNaN(d) && d !== 0) {
      num = n / d;
    }
  } else {
    // Strip leading ± or +/- or + to parse cleanly, preserving leading -
    const cleanStr = trimmed
      .replace(/^±\s*/, '')
      .replace(/^\+\/-\s*/, '')
      .replace(/^\+\s*/, '')
      .trim();
    const parsed = parseFloat(cleanStr);
    if (!isNaN(parsed)) {
      num = parsed;
    }
  }

  if (num !== null) {
    if (Math.abs(num) < 0.05) {
      return '±0.0 EV';
    }
    if (num > 0) {
      return `+${num.toFixed(1)} EV`;
    }
    // Negative number: e.g. -0.3, -1.7
    return `${num.toFixed(1)} EV`;
  }

  if (trimmed.startsWith('±')) {
    return `${trimmed} EV`;
  }
  if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
    return `${trimmed} EV`;
  }
  return `+${trimmed} EV`;
}

export interface FormattedDimensions {
  dimensions: string;       // e.g. "6000 × 4000 px"
  megapixels: string;       // e.g. "24.0 MP"
  aspectRatio?: string;     // e.g. "3:2"
  fullSummary: string;      // e.g. "6000 × 4000 px · 24.0 MP"
}

/**
 * Formats image dimensions in pixels, megapixels, and aspect ratio.
 * Automatically accounts for visual orientation (90° / 270° swaps width and height).
 */
export function formatDimensions(
  width?: number | null,
  height?: number | null,
  orientation?: number | null
): FormattedDimensions | null {
  if (!width || !height || width <= 0 || height <= 0) return null;

  // Orientation 5, 6, 7, 8: 90° or 270° rotation -> swap display width & height
  const isRotated = orientation !== null && orientation !== undefined && [5, 6, 7, 8].includes(orientation);
  const displayW = isRotated ? height : width;
  const displayH = isRotated ? width : height;

  const mp = (width * height) / 1_000_000;
  const mpStr = `${mp.toFixed(1)} MP`;

  // Detect common photographic aspect ratios
  const ratio = displayW / displayH;
  let aspectStr = '';
  if (Math.abs(ratio - 3 / 2) < 0.02) aspectStr = '3:2';
  else if (Math.abs(ratio - 2 / 3) < 0.02) aspectStr = '2:3';
  else if (Math.abs(ratio - 4 / 3) < 0.02) aspectStr = '4:3';
  else if (Math.abs(ratio - 3 / 4) < 0.02) aspectStr = '3:4';
  else if (Math.abs(ratio - 16 / 9) < 0.02) aspectStr = '16:9';
  else if (Math.abs(ratio - 9 / 16) < 0.02) aspectStr = '9:16';
  else if (Math.abs(ratio - 1) < 0.02) aspectStr = '1:1';

  const dimensions = `${displayW} × ${displayH} px`;
  const fullSummary = `${dimensions} · ${mpStr}${aspectStr ? ` (${aspectStr})` : ''}`;

  return {
    dimensions,
    megapixels: mpStr,
    aspectRatio: aspectStr || undefined,
    fullSummary,
  };
}

/**
 * Formats an ISO or EXIF date string into clean date + time (e.g. "2024-05-12 14:32:10").
 */
export function formatDisplayDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const clean = trimmed.replace('T', ' ');
  return clean.length >= 19 ? clean.substring(0, 19) : clean;
}

/**
 * Determines if two date strings are significantly different (more than 5 seconds apart).
 * Prevents showing redundant "Modified" lines when capture and file timestamps only differ by a couple seconds.
 */
export function areDatesDifferent(dateA?: string | null, dateB?: string | null): boolean {
  if (!dateA || !dateB) return false;
  const tA = new Date(dateA.replace(' ', 'T')).getTime();
  const tB = new Date(dateB.replace(' ', 'T')).getTime();
  if (isNaN(tA) || isNaN(tB)) {
    return dateA.trim().substring(0, 16) !== dateB.trim().substring(0, 16);
  }
  return Math.abs(tA - tB) > 5000;
}
