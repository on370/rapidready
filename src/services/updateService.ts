import buildInfo from '../build-info.json';
import { useSettingsStore } from '../stores/settingsStore';
import i18n from '../i18n';

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
  isRc: boolean;
  rcNumber: number;
}

export function parseVersion(ver: string): ParsedVersion {
  const clean = ver.trim().replace(/^v/i, '');
  const [core, ...preParts] = clean.split('-');
  const [majStr, minStr, patStr] = (core || '').split('.');
  const major = parseInt(majStr, 10) || 0;
  const minor = parseInt(minStr, 10) || 0;
  const patch = parseInt(patStr, 10) || 0;

  const pre = preParts.join('-').toLowerCase();
  const isRc = /rc/i.test(pre);
  let rcNumber = 0;
  if (isRc) {
    const rcMatch = pre.match(/rc\.?(\d+)/i);
    if (rcMatch) {
      rcNumber = parseInt(rcMatch[1], 10);
    }
  }

  const isBeta = pre.length > 0;
  let betaNumber = 0;
  if (pre.includes('beta')) {
    const betaMatch = pre.match(/beta\.?(\d+)/i);
    if (betaMatch) {
      betaNumber = parseInt(betaMatch[1], 10);
    }
  }

  return { major, minor, patch, isBeta, betaNumber, isRc, rcNumber };
}

export function compareVersions(aStr: string, bStr: string): number {
  const a = parseVersion(aStr);
  const b = parseVersion(bStr);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Equal core version: stable release is newer than any beta / pre-release
  if (!a.isBeta && b.isBeta) return 1;
  if (a.isBeta && !b.isBeta) return -1;
  if (!a.isBeta && !b.isBeta) return 0;

  // Both are pre-releases:
  // If betaNumbers differ (e.g. beta.2 vs beta.1):
  if (a.betaNumber !== b.betaNumber) {
    return a.betaNumber - b.betaNumber;
  }

  // Same beta level:
  // A release candidate (RC) is older than a full/final beta release!
  // e.g. 0.3.7-beta (isRc = false) > 0.3.7-beta-RC1 (isRc = true)
  if (!a.isRc && b.isRc) return 1;
  if (a.isRc && !b.isRc) return -1;

  // If both are RCs, compare RC numbers (e.g. RC2 > RC1)
  if (a.isRc && b.isRc) {
    return a.rcNumber - b.rcNumber;
  }

  return 0;
}

export const isCurrentBeta = parseVersion(buildInfo.version).isBeta;

export const STABLE_TAG_REGEX = /^v?\d+\.\d+\.\d+$/;
export const BETA_TAG_REGEX = /^v?\d+\.\d+\.\d+-beta(?:\.?\d+)?$/i;

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

    // Filter eligible releases: only accept tags matching x.y.z or x.y.z-beta
    const eligibleReleases = releases.filter((r) => {
      if (r.draft) return false;

      const isStable = STABLE_TAG_REGEX.test(r.tag_name);
      const isBetaRelease = BETA_TAG_REGEX.test(r.tag_name);

      // Only official release schemas are considered
      if (!isStable && !isBetaRelease) {
        return false;
      }

      // If current app is not a beta, NEVER consider beta releases
      if (!isCurrentBeta && isBetaRelease) {
        return false;
      }

      // If current app is beta, but user disabled beta update notifications:
      if (isCurrentBeta && isBetaRelease && !settings.includeBetaUpdates) {
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
    let errMsg = err?.message || 'Network error';
    if (errMsg === 'Load failed' || errMsg.toLowerCase().includes('failed to fetch')) {
      errMsg = i18n.t('settings:updates.connectionError', {
        defaultValue: 'Keine Verbindung zu GitHub möglich (Offline oder Anfrage blockiert)'
      });
    }
    return {
      hasUpdate: false,
      currentVersion: buildInfo.version,
      error: errMsg,
    };
  }
}
