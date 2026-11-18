// Tiny registry so "open in RapidRAW" (shortcut, context menu, toolbar) can ask the library grid
// for its current list without threading props through every caller. Dependency-free on purpose
// (settingsStore imports it).

export interface ResolvedRapidRawList {
  paths: string[];
  active: string;
  title: string;
}

export type RapidRawListSource = (activePath: string) => ResolvedRapidRawList | null;

let currentSource: RapidRawListSource | null = null;

export function setRapidRawListSource(source: RapidRawListSource): () => void {
  currentSource = source;
  return () => {
    if (currentSource === source) currentSource = null;
  };
}

export function resolveRapidRawList(activePath: string): ResolvedRapidRawList | null {
  if (!currentSource) return null;
  try {
    return currentSource(activePath);
  } catch (err) {
    console.warn('[RapidRAW list] Failed to build list:', err);
    return null;
  }
}
