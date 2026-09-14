import buildInfo from '../build-info.json';
import { useSettingsStore } from '../stores/settingsStore';

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  published_at: string;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  isBeta: boolean;
  betaNumber: number;
}

export function parseVersion(ver: string): ParsedVersion {
  const clean = ver.trim().replace(/^v/i, '');
  const [core, ...preParts] = clean.split('-');
  const [majStr, minStr, patStr] = core.split('.');
  const major = parseInt(majStr, 10) || 0;
  const minor = parseInt(minStr, 10) || 0;
  const patch = parseInt(patStr, 10) || 0;

  const pre = preParts.join('-').toLowerCase();
  const isBeta = pre.includes('beta') || pre.includes('alpha') || pre.includes('rc');

  let betaNumber = 0;
  if (isBeta) {
    const numMatch = pre.match(/beta\.?(\d+)/i);
    if (numMatch) {
      betaNumber = parseInt(numMatch[1], 10);
    }
  }

  return { major, minor, patch, isBeta, betaNumber };
}

export function compareVersions(aStr: string, bStr: string): number {
  const a = parseVersion(aStr);
  const b = parseVersion(bStr);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Equal core version: stable release is newer than beta
  if (!a.isBeta && b.isBeta) return 1;
  if (a.isBeta && !b.isBeta) return -1;

  if (a.isBeta && b.isBeta) {
    return a.betaNumber - b.betaNumber;
  }

  return 0;
}

export const isCurrentBeta = parseVersion(buildInfo.version).isBeta;

export interface CheckUpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestRelease?: GitHubRelease;
  error?: string;
}

export async function checkAppUpdate(manual = false): Promise<CheckUpdateResult> {
  const settings = useSettingsStore.getState();
  if (!manual && !settings.checkForUpdates) {
    return { hasUpdate: false, currentVersion: buildInfo.version };
  }

  try {
    const res = await fetch('https://api.github.com/repos/on370/rapidready/releases?per_page=10', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: HTTP ${res.status}`);
    }

    const releases: GitHubRelease[] = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      return { hasUpdate: false, currentVersion: buildInfo.version };
    }

    // Filter eligible releases
    const eligibleReleases = releases.filter((r) => {
      if (r.draft) return false;
      const isReleaseBeta = r.prerelease || r.tag_name.toLowerCase().includes('beta');

      // If current app is not a beta, NEVER consider beta releases
      if (!isCurrentBeta && isReleaseBeta) {
        return false;
      }

      // If current app is beta, but user disabled beta update notifications:
      if (isCurrentBeta && isReleaseBeta && !settings.includeBetaUpdates) {
        return false;
      }

      // Only consider releases strictly newer than current app version
      return compareVersions(r.tag_name, buildInfo.version) > 0;
    });

    if (eligibleReleases.length === 0) {
      return { hasUpdate: false, currentVersion: buildInfo.version };
    }

    // Sort descending so the highest version is first
    eligibleReleases.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
    const latestRelease = eligibleReleases[0];

    return {
      hasUpdate: true,
      currentVersion: buildInfo.version,
      latestRelease,
    };
  } catch (err: any) {
    console.error('Failed to check for updates:', err);
    return {
      hasUpdate: false,
      currentVersion: buildInfo.version,
      error: err?.message || 'Network error',
    };
  }
}
