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
