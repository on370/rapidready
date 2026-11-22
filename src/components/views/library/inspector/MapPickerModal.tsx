import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatDd, formatDms, parseCoordinates } from "../../../../utils/geo";

export interface GpsCandidate {
  latitude: number;
  longitude: number;
  altitude: number | null;
  count: number;
}

interface MapPickerModalProps {
  isOpen: boolean;
  initialMode: "view" | "edit";
  initialLatitude: number | null;
  initialLongitude: number | null;
  selectedCount: number;
  candidateLocations?: GpsCandidate[];
  externalMapProvider: "google" | "osm";
  onOpenExternal: (latitude: number, longitude: number) => void;
  onClose: () => void;
  onSave: (latitude: number, longitude: number, altitude?: number | null) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
}

interface PlaceSearchResult {
  id: string;
  lat: number;
  lon: number;
  primary: string;
  secondary: string;
}

const DEFAULT_MAP_CENTER = { lat: 48.137, lng: 11.575, zoom: 5 };
const EMPTY_CANDIDATES: GpsCandidate[] = [];
let lastMapView: { lat: number; lng: number; zoom: number } | null = null;

function createPinIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="relative flex items-center justify-center w-6 h-6">
      <span class="absolute w-6 h-6 rounded-full bg-accent/25 border border-accent/40"></span>
      <span class="relative w-3 h-3 rounded-full bg-accent border-2 border-white shadow-md"></span>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createCandidateIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="flex items-center justify-center w-6 h-6 rounded-full bg-slate-600/95 hover:bg-slate-500 text-white border-2 border-white shadow-md text-[10px] font-bold leading-none cursor-pointer">${count}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface NominatimItem {
  place_id?: number;
  lat: string;
  lon: string;
  display_name: string;
}

async function searchPlacesPhoton(query: string, signal: AbortSignal): Promise<PlaceSearchResult[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    throw new Error(`Photon HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { features?: PhotonFeature[] };
  const features = Array.isArray(data?.features) ? data.features : [];
  const results: PlaceSearchResult[] = [];

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const p = f.properties || {};
    const streetLine = [p.street, p.housenumber].filter(Boolean).join(" ");
    const primary = p.name || streetLine || p.city || p.state || p.country || query;
    const secondaryParts = [
      p.name && streetLine ? streetLine : undefined,
      p.postcode,
      p.city && p.city !== primary ? p.city : undefined,
      p.state && p.state !== primary ? p.state : undefined,
      p.country && p.country !== primary ? p.country : undefined,
    ].filter(Boolean);

    results.push({
      id: `photon-${p.osm_id ?? i}-${lat}-${lon}`,
      lat,
      lon,
      primary,
      secondary: secondaryParts.join(", "),
    });
  }
  return results;
}

async function searchPlacesNominatim(query: string, signal: AbortSignal): Promise<PlaceSearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`Nominatim HTTP ${resp.status}`);
  }
  const items = (await resp.json()) as NominatimItem[];
  if (!Array.isArray(items)) return [];

  const results: PlaceSearchResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const parts = item.display_name.split(",").map((s) => s.trim()).filter(Boolean);
    const primary = parts[0] || query;
    const secondary = parts.slice(1).join(", ");
    results.push({
      id: `nominatim-${item.place_id ?? i}-${lat}-${lon}`,
      lat,
      lon,
      primary,
      secondary,
    });
  }
  return results;
}

export function MapPickerModal({
  isOpen,
  initialMode,
  initialLatitude,
  initialLongitude,
  selectedCount,
  candidateLocations = EMPTY_CANDIDATES,
  externalMapProvider,
  onOpenExternal,
  onClose,
  onSave,
  onClear,
}: MapPickerModalProps) {
  const { t } = useTranslation("library");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const candidateMarkersRef = useRef<L.Marker[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [parsedAltitude, setParsedAltitude] = useState<number | null | undefined>(undefined);

  const [searchQuery, setSearchQuery] = useState("");
  const [coordsDetected, setCoordsDetected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchStatusMessage, setSearchStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const candidateLocationsRef = useRef(candidateLocations);
  candidateLocationsRef.current = candidateLocations;

  const candidatesKey = useMemo(
    () => candidateLocations.map((c) => `${c.latitude},${c.longitude},${c.altitude ?? ""},${c.count}`).join("|"),
    [candidateLocations]
  );

  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setIsSearching(false);
      setIsSaving(false);
      setSearchResults([]);
      setIsDropdownOpen(false);
      setSearchStatusMessage(null);
      setSearchQuery("");
      setCoordsDetected(false);
      setParsedAltitude(undefined);
      return;
    }

    const candidates = candidateLocationsRef.current;
    setMode(initialMode);
    if (initialMode === "edit" && candidates.length === 1) {
      const single = candidates[0];
      setPicked({ lat: single.latitude, lng: single.longitude });
      setParsedAltitude(single.altitude);
    } else if (initialMode === "edit" && candidates.length > 1) {
      setPicked(null);
      setParsedAltitude(undefined);
    } else if (initialLatitude != null && initialLongitude != null) {
      setPicked({ lat: initialLatitude, lng: initialLongitude });
      setParsedAltitude(undefined);
    } else {
      setPicked(null);
      setParsedAltitude(undefined);
    }
    setSearchQuery("");
    setCoordsDetected(false);
    setSearchResults([]);
    setIsDropdownOpen(false);
    setSearchStatusMessage(null);
  }, [isOpen, initialMode, initialLatitude, initialLongitude, candidatesKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (isSaving) return;
        if (isDropdownOpen) {
          setIsDropdownOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, isSaving, isDropdownOpen, onClose]);

  const placeOrMoveMarker = useCallback((lat: number, lng: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        icon: createPinIcon(),
        draggable: modeRef.current === "edit",
        zIndexOffset: 100,
      }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setPicked({ lat: pos.lat, lng: pos.lng });
        setParsedAltitude(undefined);
      });
      markerRef.current = marker;
    }

    if (modeRef.current === "edit") {
      markerRef.current.dragging?.enable();
    } else {
      markerRef.current.dragging?.disable();
    }
    setPicked({ lat, lng });
  }, []);

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    const candidates = candidateLocationsRef.current;
    const isSingleCandidateEdit = initialMode === "edit" && candidates.length === 1;
    const isMultiCandidateEdit = initialMode === "edit" && candidates.length > 1;
    const hasInitial = initialLatitude != null && initialLongitude != null;

    const startLat = isSingleCandidateEdit
      ? candidates[0].latitude
      : hasInitial
        ? initialLatitude
        : (lastMapView?.lat ?? DEFAULT_MAP_CENTER.lat);
    const startLng = isSingleCandidateEdit
      ? candidates[0].longitude
      : hasInitial
        ? initialLongitude
        : (lastMapView?.lng ?? DEFAULT_MAP_CENTER.lng);
    const startZoom = isSingleCandidateEdit || hasInitial
      ? 14
      : (lastMapView?.zoom ?? DEFAULT_MAP_CENTER.zoom);

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: startZoom,
      zoomControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    if (isSingleCandidateEdit) {
      placeOrMoveMarker(candidates[0].latitude, candidates[0].longitude);
    } else if (isMultiCandidateEdit) {
      const boundsPoints: [number, number][] = [];
      for (const cand of candidates) {
        boundsPoints.push([cand.latitude, cand.longitude]);
        const cMarker = L.marker([cand.latitude, cand.longitude], {
          icon: createCandidateIcon(cand.count),
          draggable: false,
          zIndexOffset: 0,
        }).addTo(map);
        cMarker.bindTooltip(`${cand.count}× · ${formatDms(cand.latitude, cand.longitude)}`, {
          direction: "top",
          offset: [0, -10],
        });
        cMarker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setParsedAltitude(cand.altitude);
          setCoordsDetected(false);
          placeOrMoveMarker(cand.latitude, cand.longitude);
        });
        candidateMarkersRef.current.push(cMarker);
      }
      if (boundsPoints.length > 0) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [48, 48], maxZoom: 14 });
      }
    } else if (hasInitial) {
      placeOrMoveMarker(initialLatitude, initialLongitude);
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (modeRef.current !== "edit") return;
      setParsedAltitude(undefined);
      setCoordsDetected(false);
      placeOrMoveMarker(e.latlng.lat, e.latlng.lng);
    });

    const saveView = () => {
      const center = map.getCenter();
      lastMapView = {
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      };
    };
    map.on("moveend", saveView);
    map.on("zoomend", saveView);

    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize();
      if (isMultiCandidateEdit && candidates.length > 1) {
        map.fitBounds(
          L.latLngBounds(candidates.map((c) => [c.latitude, c.longitude] as [number, number])),
          { padding: [48, 48], maxZoom: 14 }
        );
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      candidateMarkersRef.current.forEach((m) => m.remove());
      candidateMarkersRef.current = [];
      markerRef.current = null;
      mapInstanceRef.current = null;
      map.remove();
    };
  }, [isOpen, initialMode, initialLatitude, initialLongitude, candidatesKey, placeOrMoveMarker]);

  useEffect(() => {
    if (!isOpen) return;
    if (markerRef.current) {
      if (mode === "edit") {
        markerRef.current.dragging?.enable();
      } else {
        markerRef.current.dragging?.disable();
      }
    }
    if (mode === "view") {
      setIsDropdownOpen(false);
      setSearchStatusMessage(null);
    }
    const rafId = window.requestAnimationFrame(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [mode, isOpen]);

  if (!isOpen) return null;

  const externalLabel = externalMapProvider === "osm" ? "OpenStreetMap" : "Google Maps";

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    setSearchStatusMessage(null);

    if (!value.trim()) {
      setCoordsDetected(false);
      setSearchResults([]);
      setIsDropdownOpen(false);
      return;
    }

    const res = parseCoordinates(value);
    if (res.success && res.coords) {
      const { latitude, longitude, altitude } = res.coords;
      setCoordsDetected(true);
      setParsedAltitude(altitude ?? undefined);
      setSearchResults([]);
      setIsDropdownOpen(false);
      placeOrMoveMarker(latitude, longitude);
      const map = mapInstanceRef.current;
      if (map) {
        map.setView([latitude, longitude], Math.max(map.getZoom(), 14));
      }
    } else {
      setCoordsDetected(false);
    }
  };

  const handleSearchSubmit = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const coordRes = parseCoordinates(trimmed);
    if (coordRes.success && coordRes.coords) {
      const { latitude, longitude, altitude } = coordRes.coords;
      setCoordsDetected(true);
      setParsedAltitude(altitude ?? undefined);
      setSearchResults([]);
      setIsDropdownOpen(false);
      setSearchStatusMessage(null);
      placeOrMoveMarker(latitude, longitude);
      const map = mapInstanceRef.current;
      if (map) {
        map.setView([latitude, longitude], Math.max(map.getZoom(), 14));
      }
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setSearchStatusMessage(null);

    try {
      let results: PlaceSearchResult[] = [];
      let photonFailed = false;

      try {
        results = await searchPlacesPhoton(trimmed, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        photonFailed = true;
      }

      if (results.length === 0 && !controller.signal.aborted) {
        try {
          results = await searchPlacesNominatim(trimmed, controller.signal);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (photonFailed || err) {
            setSearchResults([]);
            setIsDropdownOpen(false);
            setSearchStatusMessage(t("inspector.mapSearchError"));
            return;
          }
        }
      }

      if (controller.signal.aborted) return;

      if (results.length > 0) {
        setSearchResults(results);
        setIsDropdownOpen(true);
        setSearchStatusMessage(null);
      } else {
        setSearchResults([]);
        setIsDropdownOpen(false);
        setSearchStatusMessage(t("inspector.mapSearchNoResults"));
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const handleSelectSearchResult = (item: PlaceSearchResult) => {
    placeOrMoveMarker(item.lat, item.lon);
    setParsedAltitude(undefined);
    setCoordsDetected(false);
    setIsDropdownOpen(false);
    setSearchStatusMessage(null);
    mapInstanceRef.current?.setView([item.lat, item.lon], 14);
  };

  const handleApply = async () => {
    if (!picked || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(picked.lat, picked.lng, parsedAltitude);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!onClear || isSaving) return;
    setIsSaving(true);
    try {
      await onClear();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 ${isSaving ? "cursor-wait" : ""}`}
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        className={`w-[92vw] max-w-3xl h-[76vh] max-h-[680px] flex flex-col bg-app-panel border border-app-border rounded-2xl shadow-2xl overflow-hidden ${isSaving ? "cursor-wait" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-app-border bg-app-card/60 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-3.5 h-3.5 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-txt-primary truncate">
                {mode === "view" ? t("inspector.mapViewerTitle") : t("inspector.mapPickerTitle")}
              </h2>
              <p className={`text-[11px] text-txt-tertiary truncate ${mode === "view" ? "font-mono" : ""}`}>
                {mode === "view"
                  ? picked
                    ? formatDms(picked.lat, picked.lng)
                    : ""
                  : t("inspector.mapPickerHint")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {picked && (
              <button
                type="button"
                onClick={() => onOpenExternal(picked.lat, picked.lng)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-accent hover:bg-accent/10 border border-accent/25 transition-colors"
                title={externalLabel}
              >
                <span>{externalLabel}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            {mode === "view" && (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-txt-primary bg-app-hover hover:bg-app-border border border-app-border transition-colors"
              >
                <Pencil className="w-3 h-3" />
                <span>{t("inspector.mapViewerEdit")}</span>
              </button>
            )}

            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              title={t("inspector.mapClose")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Smart Search & Coordinate Bar (Edit Mode Only) */}
        {mode === "edit" && (
          <div className="relative z-[1000] px-4 py-2.5 border-b border-app-border bg-app-panel flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <Search className="w-3.5 h-3.5 text-txt-tertiary absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder={t("inspector.mapSearchPlaceholder")}
                  className="w-full bg-app-deepest border border-app-border focus:border-accent rounded-lg pl-8 pr-7 py-1.5 text-xs text-txt-primary placeholder:text-txt-tertiary focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchInputChange("")}
                    className="absolute right-2 p-0.5 text-txt-tertiary hover:text-txt-primary rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={!searchQuery.trim() || isSearching}
                onClick={handleSearchSubmit}
                className="px-3 py-1.5 text-xs font-medium bg-app-card hover:bg-app-hover border border-app-border text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                {isSearching && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>{t("inspector.mapSearchButton")}</span>
              </button>
            </div>

            {coordsDetected && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{t("inspector.mapCoordsDetected")}</span>
              </div>
            )}

            {searchStatusMessage && !coordsDetected && (
              <div className="mt-1.5 text-[11px] text-txt-tertiary">
                {searchStatusMessage}
              </div>
            )}

            {isDropdownOpen && searchResults.length > 0 && (
              <div className="absolute left-4 right-4 top-full mt-1 z-[1000] bg-app-panel border border-app-border rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(item)}
                    className="w-full text-left px-3 py-2 hover:bg-app-hover border-b border-app-border/40 last:border-b-0 transition-colors"
                  >
                    <div className="font-medium text-xs text-txt-primary truncate">
                      {item.primary}
                    </div>
                    {item.secondary && (
                      <div className="text-[11px] text-txt-tertiary truncate">
                        {item.secondary}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Map Body */}
        <div
          className={`flex-1 relative min-h-0 bg-app-deepest [&_.leaflet-tile-pane]:brightness-[0.88] [&_.leaflet-tile-pane]:contrast-[1.04] ${
            mode === "edit" && !isSaving ? "rr-map-edit" : ""
          }`}
        >
          <div ref={mapContainerRef} className="w-full h-full" />

          {isSaving && (
            <div className="absolute inset-0 z-[1100] bg-black/45 backdrop-blur-[2px] flex items-center justify-center cursor-wait">
              <div className="bg-app-panel/95 border border-app-border rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2.5 text-xs text-txt-primary">
                <Loader2 className="w-4 h-4 animate-spin text-accent flex-shrink-0" />
                <span>{t("inspector.gpsSavingBatch", { count: selectedCount })}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-app-border bg-app-card/60 flex-shrink-0">
          {mode === "view" ? (
            <>
              <div className="min-w-0">
                {picked && (
                  <>
                    <p className="text-xs font-mono font-medium text-txt-primary truncate">
                      {formatDms(picked.lat, picked.lng)}
                    </p>
                    <p className="text-[10px] font-mono text-txt-tertiary truncate">
                      {formatDd(picked.lat, picked.lng)}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium bg-app-hover hover:bg-app-border text-txt-primary rounded-lg transition-colors flex-shrink-0"
              >
                {t("inspector.mapClose")}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                {picked ? (
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-medium text-txt-primary truncate">
                      {formatDms(picked.lat, picked.lng)}
                    </p>
                    <p className="text-[10px] font-mono text-txt-tertiary truncate">
                      {formatDd(picked.lat, picked.lng)}
                    </p>
                  </div>
                ) : candidateLocations.length > 1 ? (
                  <span className="text-xs text-txt-tertiary">
                    {t("inspector.mapPickerSelectCandidate", { count: candidateLocations.length })}
                  </span>
                ) : (
                  <span className="text-xs text-txt-tertiary">
                    {t("inspector.mapPickerNoPoint")}
                  </span>
                )}

                {selectedCount > 1 && (
                  <div className="text-[10px] text-accent/90 bg-accent/10 border border-accent/20 rounded-md px-2 py-1 flex items-center gap-1.5 flex-shrink-0">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    <span>{t("inspector.gpsBatchBadge", { count: selectedCount })}</span>
                  </div>
                )}

                {(initialLatitude != null || candidateLocations.length > 0) && onClear && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleClear}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-md transition-colors flex-shrink-0"
                    title={t("inspector.removeGps")}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t("inspector.removeGps")}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-txt-secondary hover:text-txt-primary hover:bg-app-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {t("inspector.gpsCancel")}
                </button>
                <button
                  type="button"
                  disabled={!picked || isSaving}
                  onClick={handleApply}
                  className="px-3.5 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-app-deepest disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow transition-colors flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("inspector.gpsSaving")}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t("inspector.gpsApply")}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
