import { isMac, isWindows } from './platform';
import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Normalizes a file path into a valid Tauri protocol URL across macOS and Windows.
 * On Windows WebView2, Tauri maps custom protocols to http://<protocol>.localhost/<path>.
 * On macOS, Tauri maps them to <protocol>://localhost/<path>.
 * convertFileSrc automatically selects the correct format for the current OS!
 */
export function getRrImageUrl(
  path: string | undefined | null, 
  fullres = false, 
  orientation?: number | null,
  scale?: number,
  size?: number | null,
  mtime?: number | null
): string {
  if (!path) return '';
  const params: string[] = [];
  if (fullres) params.push('fullres=true');
  if (orientation) params.push(`orient=${orientation}`);
  if (scale !== undefined) params.push(`scale=${scale}`);
  if (size !== undefined && size !== null) params.push(`size=${size}`);
  if (mtime !== undefined && mtime !== null) params.push(`mtime=${mtime}`);
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
 * Whether paths compare case-insensitively. Mirrors the backend (`normalize_path_for_comparison`):
 * macOS and Windows file systems ignore case by default, Linux file systems do not, so there
 * "IMG_0001.JPG" and "img_0001.jpg" in one folder are two different files.
 */
export const PATHS_CASE_INSENSITIVE: boolean = isMac || isWindows;

/**
 * Case-folds a path or path segment for comparisons, but only where the platform ignores case.
 */
export function foldPathCase(s: string, caseInsensitive: boolean = PATHS_CASE_INSENSITIVE): string {
  return caseInsensitive ? s.toLowerCase() : s;
}

/**
 * Normalizes slashes, removes trailing slashes, and case-folds where the platform ignores case.
 * Use this (not an ad-hoc `.toLowerCase()`) for every path comparison or map key.
 */
export function normalizePath(p: string | undefined | null): string {
  if (!p) return '';
  return foldPathCase(normalizeSlash(p));
}

export const RAW_EXTENSIONS = new Set([
  'cr2', 'cr3', 'arw', 'nef', 'dng', 'orf', 'raf', 'rw2', 'pef', '3fr', 'x3f', 'nrw',
  'rwl', 'fff', 'iiq', 'crw', 'erf'
]);

export function isRawFilename(filename: string | undefined | null): boolean {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? RAW_EXTENSIONS.has(ext) : false;
}

export const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mts', 'm2ts'
]);

export function isVideoFilename(filename: string | undefined | null): boolean {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? VIDEO_EXTENSIONS.has(ext) : false;
}

export const COMPANION_IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'heic', 'heif', 'hif', 'webp', 'avif'
]);

export function isCompanionFilename(filename: string | undefined | null): boolean {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? COMPANION_IMAGE_EXTENSIONS.has(ext) : false;
}



