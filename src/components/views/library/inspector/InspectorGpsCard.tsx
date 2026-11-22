import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, MapPin, ExternalLink, Pencil, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LibraryImage, useLibraryStore } from "../../../../stores/libraryStore";
import { useSettingsStore } from "../../../../stores/settingsStore";
import { useToastStore } from "../../../../stores/toastStore";
import { formatDms, formatDd } from "../../../../utils/geo";
import { OsmMiniMap } from "./OsmMiniMap";
import { GpsCandidate, MapPickerModal } from "./MapPickerModal";

export type { GpsCandidate };

const EMPTY_CANDIDATES: GpsCandidate[] = [];

interface InspectorGpsCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
  isMapOpen: boolean;
  onToggleMap: () => void;
}

export function InspectorGpsCard({
  activeImage,
  isCollapsed,
  onToggle,
  isMapOpen,
  onToggleMap,
}: InspectorGpsCardProps) {
  const { t } = useTranslation("library");
  const selectedPaths = useLibraryStore((s) => s.selectedPaths);
  const images = useLibraryStore((s) => s.images);
  const updateBatchGps = useLibraryStore((s) => s.updateBatchGps);
  const gpsMapProvider = useSettingsStore((s) => s.gpsMapProvider);

  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapModalMode, setMapModalMode] = useState<"view" | "edit">("view");
  const [copiedGps, setCopiedGps] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setCopiedGps(false);
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
  }, [activeImage.path]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const isMultiSelected = selectedPaths.has(activeImage.path) && selectedPaths.size > 1;

  const candidateLocations = useMemo<GpsCandidate[]>(() => {
    if (!isMapModalOpen || !isMultiSelected) {
      return EMPTY_CANDIDATES;
    }
    const groups = new Map<string, GpsCandidate>();
    for (const img of images) {
      if (!selectedPaths.has(img.path)) continue;
      if (img.latitude == null || img.longitude == null) continue;
      const key = `${img.latitude.toFixed(4)},${img.longitude.toFixed(4)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(key, {
          latitude: img.latitude,
          longitude: img.longitude,
          altitude: img.altitude ?? null,
          count: 1,
        });
      }
    }
    if (groups.size === 0) {
      return EMPTY_CANDIDATES;
    }
    return Array.from(groups.values());
  }, [isMapModalOpen, isMultiSelected, images, selectedPaths]);

  const externalProvider: "google" | "osm" = gpsMapProvider === "osm" ? "osm" : "google";

  const handleOpenExternalMaps = (lat: number, lon: number) => {
    const url =
      externalProvider === "osm"
        ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
        : `https://www.google.com/maps?q=${lat},${lon}`;
    openUrl(url).catch(console.error);
  };

  const handleCopyGps = async () => {
    if (activeImage.latitude == null || activeImage.longitude == null) return;
    const coordStr = `${activeImage.latitude.toFixed(6)}, ${activeImage.longitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(coordStr);
      setCopiedGps(true);
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedGps(false);
        copyTimeoutRef.current = null;
      }, 1500);
    } catch (err) {
      console.error("Failed to copy GPS coordinates:", err);
    }
  };

  const saveGpsCoordinates = async (latitude: number, longitude: number, altitude: number | null) => {
    const pathsToUpdate =
      selectedPaths.has(activeImage.path) && selectedPaths.size > 1
        ? Array.from(selectedPaths)
        : [activeImage.path];

    updateBatchGps(pathsToUpdate, { latitude, longitude, altitude });

    try {
      const res = await invoke<{ total: number; succeeded: number; failed: number }>("set_gps_batch", {
        paths: pathsToUpdate,
        latitude,
        longitude,
        altitude,
      });
      if (res && res.failed > 0) {
        useToastStore.getState().showWarning(
          t("errors.batchSaveFailed", {
            failed: res.failed,
            total: res.total,
          }),
          t("inspector.gpsSaveFailed")
        );
      } else {
        useToastStore.getState().showSuccess(
          t("inspector.gpsAppliedToast", { count: pathsToUpdate.length }),
          t("inspector.location")
        );
      }
    } catch (err) {
      console.error("Failed to save GPS coordinates:", err);
      useToastStore.getState().showError(String(err), t("inspector.gpsSaveFailed"));
    }
  };

  const handleClearGps = async () => {
    const pathsToUpdate =
      selectedPaths.has(activeImage.path) && selectedPaths.size > 1
        ? Array.from(selectedPaths)
        : [activeImage.path];

    updateBatchGps(pathsToUpdate, { latitude: null, longitude: null, altitude: null });

    try {
      const res = await invoke<{ total: number; succeeded: number; failed: number }>("set_gps_batch", {
        paths: pathsToUpdate,
        latitude: null,
        longitude: null,
        altitude: null,
      });
      if (res && res.failed > 0) {
        useToastStore.getState().showWarning(
          t("errors.batchSaveFailed", {
            failed: res.failed,
            total: res.total,
          }),
          t("inspector.gpsSaveFailed")
        );
      } else {
        useToastStore.getState().showSuccess(
          t("inspector.gpsRemovedToast", { count: pathsToUpdate.length }),
          t("inspector.location")
        );
      }
    } catch (err) {
      console.error("Failed to clear GPS coordinates:", err);
      useToastStore.getState().showError(String(err), t("inspector.gpsSaveFailed"));
    }
  };

  const hasCoords = activeImage.latitude != null && activeImage.longitude != null;

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
      <div
        onClick={onToggle}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          )}
          <MapPin className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider group-hover:text-txt-secondary transition-colors">
            {t("inspector.location")}
          </h3>
        </div>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {hasCoords && (
            <button
              onClick={() => handleOpenExternalMaps(activeImage.latitude!, activeImage.longitude!)}
              className="flex items-center gap-1 text-[10px] text-accent hover:underline hover:text-accent/80 transition-colors mr-1"
              title={externalProvider === "osm" ? "OpenStreetMap" : "Google Maps"}
            >
              <span>{externalProvider === "osm" ? "OpenStreetMap" : "Google Maps"}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
          <button
            onClick={() => {
              setMapModalMode("edit");
              setIsMapModalOpen(true);
            }}
            className="p-1 text-txt-tertiary hover:text-txt-primary hover:bg-app-hover rounded transition-colors"
            title={hasCoords ? t("inspector.editGps") : t("inspector.addGps")}
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-1.5 text-[11px]">
          <div>
            <span className="text-txt-tertiary block text-[10px]">{t("inspector.coordinates")}</span>
            {hasCoords ? (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-txt-primary font-mono text-[11px] font-medium select-text">
                    {formatDms(activeImage.latitude!, activeImage.longitude!)}
                  </p>
                  <p className="text-txt-tertiary font-mono text-[10px] select-text">
                    {formatDd(activeImage.latitude!, activeImage.longitude!)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyGps}
                  className="p-1 text-txt-tertiary hover:text-txt-primary hover:bg-app-hover rounded transition-colors flex-shrink-0"
                  title={copiedGps ? t("inspector.gpsCopied") : t("inspector.copyGps")}
                >
                  {copiedGps ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ) : (
              <>
                <p className="text-txt-tertiary font-mono text-[11px]">{t("inspector.noGps")}</p>
                <p className="text-txt-tertiary font-mono text-[10px]">—</p>
              </>
            )}
          </div>

          <div className="pt-1 border-t border-app-border/40 flex justify-between items-center">
            <span className="text-txt-tertiary text-[10px]">{t("inspector.altitude")}</span>
            <span
              className={`font-mono text-[11px] ${
                activeImage.altitude != null ? "text-txt-primary font-medium" : "text-txt-tertiary"
              }`}
            >
              {activeImage.altitude != null ? `${Math.round(activeImage.altitude)} m` : "—"}
            </span>
          </div>

          {/* Separately Collapsible OSM Map Preview */}
          <div className="pt-1.5 border-t border-app-border/30">
            <div
              onClick={onToggleMap}
              className="flex items-center justify-between cursor-pointer select-none py-0.5 group/maptoggle"
            >
              <div className="flex items-center gap-1 min-w-0">
                {isMapOpen ? (
                  <ChevronDown className="w-3 h-3 text-txt-tertiary group-hover/maptoggle:text-txt-secondary transition-colors flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-txt-tertiary group-hover/maptoggle:text-txt-secondary transition-colors flex-shrink-0" />
                )}
                <span className="text-[10px] font-medium text-txt-tertiary group-hover/maptoggle:text-txt-secondary transition-colors">
                  {t("inspector.mapPreview")}
                </span>
              </div>
            </div>

            {isMapOpen && (
              <div className="pt-1.5">
                <OsmMiniMap
                  latitude={activeImage.latitude ?? null}
                  longitude={activeImage.longitude ?? null}
                  onMapClick={
                    hasCoords
                      ? () => {
                          setMapModalMode("view");
                          setIsMapModalOpen(true);
                        }
                      : undefined
                  }
                  onAddGpsClick={() => {
                    setMapModalMode("edit");
                    setIsMapModalOpen(true);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <MapPickerModal
        isOpen={isMapModalOpen}
        initialMode={mapModalMode}
        initialLatitude={activeImage.latitude ?? null}
        initialLongitude={activeImage.longitude ?? null}
        selectedCount={isMultiSelected ? selectedPaths.size : 1}
        candidateLocations={candidateLocations}
        externalMapProvider={externalProvider}
        onOpenExternal={handleOpenExternalMaps}
        onClose={() => setIsMapModalOpen(false)}
        onSave={(lat, lon, alt) =>
          saveGpsCoordinates(lat, lon, alt !== undefined ? alt : activeImage.altitude ?? null)
        }
        onClear={handleClearGps}
      />
    </div>
  );
}
