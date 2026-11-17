import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { HardDrive, FolderOpen, FolderInput, RotateCcw, RefreshCw, Trash2, AlertTriangle, ChevronDown } from "lucide-react";
import { useDialogStore } from "../../../stores/dialogStore";

interface CacheStats {
  chunk_bytes: number;
  preview_bytes: number;
  chunk_count: number;
  preview_count: number;
  total_cached_items: number;
}

interface CacheSettingsInfo {
  activeDir: string | null;
  defaultDir: string;
  location: string | null;
  configuredDir: string;
  restartRequired: boolean;
  pendingMoveExisting: boolean | null;
  maxBytes: number | null;
  freeBytes: number | null;
  stats: CacheStats;
  lastMoveError: string | null;
}

const GB = 1024 ** 3;
const LIMIT_CHOICES_GB = [5, 10, 25, 50, 100, 250, 500];

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Settings → Disk cache: where thumbnails and previews of the archive are kept, how big that cache
 * may get, and clearing it.
 */
export function CacheSettingsCard() {
  const { t } = useTranslation("settings");
  const [info, setInfo] = useState<CacheSettingsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setInfo(await invoke<CacheSettingsInfo>("get_cache_settings"));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (action: () => Promise<CacheSettingsInfo | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setInfo(next);
      else await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const usedBytes = info ? info.stats.chunk_bytes + info.stats.preview_bytes : 0;

  /** Asks whether to move the existing cache or start empty, then saves the new location. */
  const changeLocation = async (location: string | null) => {
    if (!info) return;
    let moveExisting = true;
    if (usedBytes > 0) {
      const choice = await useDialogStore.getState().confirmWithChoice({
        title: t("cache.moveDialog.title"),
        message: t("cache.moveDialog.message", {
          to: location ? `${location}${location.includes("\\") ? "\\" : "/"}RapidReady Cache` : info.defaultDir,
        }),
        confirmLabel: t("cache.moveDialog.confirm"),
        cancelLabel: t("cache.moveDialog.cancel"),
        choices: [
          { id: "move", label: t("cache.moveDialog.move", { size: formatBytes(usedBytes) }), description: t("cache.moveDialog.moveDesc") },
          { id: "fresh", label: t("cache.moveDialog.fresh"), description: t("cache.moveDialog.freshDesc") },
        ],
        defaultChoiceId: "move",
      });
      if (choice === null) return;
      moveExisting = choice === "move";
    }
    await run(() => invoke<CacheSettingsInfo>("set_cache_location", { location, moveExisting }));
  };

  const pickFolder = async () => {
    const selected = await open({ directory: true, title: t("cache.location.pickTitle") });
    if (selected && typeof selected === "string") await changeLocation(selected);
  };

  const clearCache = async () => {
    const confirmed = await useDialogStore.getState().confirmDestructive({
      title: t("cache.clear.confirmTitle"),
      message: t("cache.clear.confirmMessage", { size: formatBytes(usedBytes) }),
      confirmLabel: t("cache.clear.confirmButton"),
      cancelLabel: t("cache.moveDialog.cancel"),
    });
    if (confirmed) await run(() => invoke("clear_disk_cache"));
  };

  const limitGb = info?.maxBytes ? Math.round(info.maxBytes / GB) : null;
  const limitChoices = limitGb && !LIMIT_CHOICES_GB.includes(limitGb) ? [...LIMIT_CHOICES_GB, limitGb].sort((a, b) => a - b) : LIMIT_CHOICES_GB;
  const overLimit = !!info?.maxBytes && usedBytes > info.maxBytes;

  return (
    <div className="bg-app-card border border-app-border rounded-xl overflow-hidden" data-settings-card="cache">
      <div className="px-5 py-3 border-b border-app-border flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-txt-secondary" />
        <div>
          <h3 className="text-sm font-semibold text-txt-primary">{t("cache.title")}</h3>
          <p className="text-xs text-txt-secondary mt-0.5">{t("cache.subtitle")}</p>
        </div>
      </div>

      {!info ? (
        <div className="px-5 py-4 text-xs text-txt-tertiary">{error ?? t("cache.loading")}</div>
      ) : (
        <div className="divide-y divide-app-border">
          {/* Location */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-txt-primary flex items-center gap-2">
                  {t("cache.location.title")}
                  {!info.location && (
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-txt-tertiary border border-app-border px-1.5 rounded">
                      {t("cache.location.default")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-txt-tertiary font-mono break-all mt-1" data-cache-dir>
                  {info.configuredDir}
                </p>
                <p className="text-xs text-txt-tertiary mt-1">
                  {info.freeBytes !== null ? t("cache.location.free", { size: formatBytes(info.freeBytes) }) : t("cache.location.freeUnknown")}
                  {" · "}
                  {t("cache.location.hint")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={pickFolder}
                className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-hover text-xs font-medium text-txt-primary flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <FolderInput className="w-3.5 h-3.5" />
                {t("cache.location.change")}
              </button>
              {info.location && (
                <button
                  disabled={busy}
                  onClick={() => changeLocation(null)}
                  className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-hover text-xs font-medium text-txt-primary flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("cache.location.useDefault")}
                </button>
              )}
              {info.activeDir && (
                <button
                  onClick={() => invoke("show_in_finder", { path: info.activeDir }).catch((e) => setError(String(e)))}
                  className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-hover text-xs font-medium text-txt-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t("cache.location.open")}
                </button>
              )}
            </div>

            {info.restartRequired && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-3" data-cache-restart>
                <p className="text-xs text-amber-300">
                  {info.pendingMoveExisting ? t("cache.restart.move") : t("cache.restart.fresh")}
                </p>
                <button
                  onClick={() => invoke("restart_app")}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold bg-accent text-white hover:bg-accent/90 transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t("cache.restart.button")}
                </button>
              </div>
            )}
            {!info.activeDir && !info.restartRequired && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {t("cache.unavailable")}
              </div>
            )}
            {info.lastMoveError && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {t("cache.moveFailed", { error: info.lastMoveError })}
              </div>
            )}
          </div>

          {/* Size limit */}
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="max-w-md">
              <p className="text-sm text-txt-primary">{t("cache.limit.title")}</p>
              <p className="text-xs text-txt-tertiary mt-0.5">
                {t("cache.limit.used", {
                  size: formatBytes(usedBytes),
                  count: info.stats.total_cached_items,
                  items: info.stats.total_cached_items.toLocaleString(),
                })}
                {overLimit && ` · ${t("cache.limit.trimming")}`}
              </p>
              <p className="text-xs text-txt-tertiary mt-1">{t("cache.limit.desc")}</p>
            </div>
            <div className="relative flex items-center flex-shrink-0">
              <select
                disabled={busy}
                value={limitGb ?? "unlimited"}
                onChange={(e) =>
                  run(() =>
                    invoke<CacheSettingsInfo>("set_cache_size_limit", {
                      maxBytes: e.target.value === "unlimited" ? null : Number(e.target.value) * GB,
                    }),
                  )
                }
                className="bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent cursor-pointer appearance-none pr-7 font-medium"
                style={{ colorScheme: "dark" }}
                data-cache-limit
              >
                <option value="unlimited">{t("cache.limit.unlimited")}</option>
                {limitChoices.map((gb) => (
                  <option key={gb} value={gb}>
                    {gb} GB
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary absolute right-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Clear */}
          <div className="px-5 py-4 flex items-center justify-between gap-4 bg-app-deepest/30">
            <p className="text-xs text-txt-tertiary max-w-md">{t("cache.clear.desc")}</p>
            <button
              disabled={busy || usedBytes === 0 || !info.activeDir}
              onClick={clearCache}
              className="px-3 py-1.5 rounded-lg border border-app-border hover:border-danger/40 hover:bg-danger/10 hover:text-danger text-xs font-medium text-txt-primary flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("cache.clear.button")}
            </button>
          </div>

          {error && <div className="px-5 py-3 text-xs text-danger">{error}</div>}
        </div>
      )}
    </div>
  );
}
