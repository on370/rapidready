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
