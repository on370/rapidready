/**
 * Platform detection helpers for cross-platform UI display (macOS vs Windows/Linux).
 */
export const isMac: boolean = typeof navigator !== 'undefined' && 
  (navigator.platform?.toLowerCase().includes('mac') || 
   navigator.userAgent?.toLowerCase().includes('macintosh') ||
   navigator.userAgent?.toLowerCase().includes('mac os'));

export const isWindows: boolean = typeof navigator !== 'undefined' && 
  (navigator.platform?.toLowerCase().includes('win') || 
   navigator.userAgent?.toLowerCase().includes('windows'));

/**
 * Linux / other Unix desktops (anything that is neither macOS nor Windows).
 * Android user agents contain "Linux" too, but RapidReady only ships desktop builds.
 */
export const isLinux: boolean = typeof navigator !== 'undefined' && !isMac && !isWindows &&
  (navigator.platform?.toLowerCase().includes('linux') ||
   navigator.userAgent?.toLowerCase().includes('linux') ||
   navigator.userAgent?.toLowerCase().includes('x11'));

/**
 * Picks the platform-specific label for "reveal in file manager" actions:
 * Finder on macOS, Explorer on Windows, the generic file manager on Linux.
 */
export function revealLabel<T>(labels: { finder: T; explorer: T; fileManager: T }): T {
  if (isMac) return labels.finder;
  if (isLinux) return labels.fileManager;
  return labels.explorer;
}

/**
 * Modifier symbol / string prefix for shortcuts (e.g. "⌘" on Mac, "Ctrl+" on Windows)
 */
export const modSymbol: string = isMac ? '⌘' : 'Ctrl+';

/**
 * Shift symbol / string prefix for shortcuts (e.g. "⇧" on Mac, "Shift+" on Windows)
 */
export const shiftSymbol: string = isMac ? '⇧' : 'Shift+';

/**
 * Modifier key name (e.g. "Cmd" on Mac, "Ctrl" on Windows)
 */
export const modName: string = isMac ? 'Cmd' : 'Ctrl';
