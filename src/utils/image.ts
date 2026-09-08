import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Normalizes a file path into a valid Tauri protocol URL across macOS and Windows.
 * On Windows WebView2, Tauri maps custom protocols to http://<protocol>.localhost/<path>.
 * On macOS, Tauri maps them to <protocol>://localhost/<path>.
 * convertFileSrc automatically selects the correct format for the current OS!
 */
export function getRrImageUrl(path: string | undefined | null, fullres = false, orientation?: number | null): string {
  if (!path) return '';
  const params: string[] = [];
  if (fullres) params.push('fullres=true');
  if (orientation) params.push(`orient=${orientation}`);
  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  try {
    const base = convertFileSrc(path, 'rr-image');
    return `${base}${queryString}`;
  } catch (e) {
    // Fallback if convertFileSrc fails (e.g. unit tests or standalone browser)
    const safePath = path.replace(/\\/g, '/');
    const normalized = safePath.startsWith('/') ? safePath.slice(1) : safePath;
    const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');
    const base = isWindows ? `http://rr-image.localhost/${normalized}` : `rr-image://localhost/${normalized}`;
    return `${base}${queryString}`;
  }
}

/**
 * Normalizes slashes and removes trailing slashes (preserves original case).
 */
export function normalizeSlash(p: string | undefined | null): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Normalizes slashes, removes trailing slashes, and lowercases for cross-platform comparison
 */
export function normalizePath(p: string | undefined | null): string {
  if (!p) return '';
  return normalizeSlash(p).toLowerCase();
}

