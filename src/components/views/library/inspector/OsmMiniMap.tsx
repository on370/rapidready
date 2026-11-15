import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPinOff, Minus, Plus } from "lucide-react";
import {
  OSM_DEFAULT_ZOOM,
  OSM_MAX_ZOOM,
  OSM_MIN_ZOOM,
  OSM_TILE_SIZE,
  getOsmTileUrl,
  latLonToSlippyTile,
  wrapTileX,
} from "../../../../utils/geo";

interface OsmMiniMapProps {
  latitude: number | null;
  longitude: number | null;
  onMapClick?: () => void;
  onAddGpsClick?: () => void;
}

const COORDINATE_DEBOUNCE_MS = 280;
const GRID_OFFSETS = [-1, 0, 1] as const;

export function OsmMiniMap({ latitude, longitude, onMapClick, onAddGpsClick }: OsmMiniMapProps) {
  const { t } = useTranslation("library");
  const [zoom, setZoom] = useState(OSM_DEFAULT_ZOOM);
  const [debouncedCoords, setDebouncedCoords] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude,
    longitude,
  });
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (latitude == null || longitude == null) {
      setDebouncedCoords({ latitude: null, longitude: null });
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedCoords({ latitude, longitude });
    }, COORDINATE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [latitude, longitude]);

  const slippy = useMemo(
    () =>
      debouncedCoords.latitude != null && debouncedCoords.longitude != null
        ? latLonToSlippyTile(debouncedCoords.latitude, debouncedCoords.longitude, zoom)
        : null,
    [debouncedCoords.latitude, debouncedCoords.longitude, zoom]
  );

  const gridKey = slippy ? `${slippy.zoom}:${slippy.tileX}:${slippy.tileY}` : "empty";
  const [tileStatus, setTileStatus] = useState<Record<string, "loaded" | "error">>({});

  useEffect(() => {
    setTileStatus({});
  }, [gridKey]);

  const tiles = useMemo(() => {
    if (!slippy) return [];
    const maxTiles = 2 ** slippy.zoom;
    const list: Array<{
      key: string;
      url: string | null;
      col: number;
      row: number;
      isCenter: boolean;
    }> = [];

    for (let rowIdx = 0; rowIdx < GRID_OFFSETS.length; rowIdx++) {
      const dy = GRID_OFFSETS[rowIdx];
      const ny = slippy.tileY + dy;
      const isValidY = ny >= 0 && ny < maxTiles;

      for (let colIdx = 0; colIdx < GRID_OFFSETS.length; colIdx++) {
        const dx = GRID_OFFSETS[colIdx];
        const nx = wrapTileX(slippy.tileX + dx, slippy.zoom);
        const key = `${slippy.zoom}/${nx}/${ny}`;
        list.push({
          key,
          url: isValidY ? getOsmTileUrl(slippy.zoom, nx, ny) : null,
          col: colIdx,
          row: rowIdx,
          isCenter: dx === 0 && dy === 0,
        });
      }
    }
    return list;
  }, [slippy]);

  const validTiles = useMemo(() => tiles.filter((tile) => tile.url !== null), [tiles]);
  const failedCount = useMemo(
    () => validTiles.filter((tile) => tileStatus[tile.key] === "error").length,
    [validTiles, tileStatus]
  );
  const loadedCount = useMemo(
    () => validTiles.filter((tile) => tileStatus[tile.key] === "loaded").length,
    [validTiles, tileStatus]
  );

  if (latitude == null || longitude == null || !slippy) {
    return (
      <div className="relative w-full h-[152px] rounded-lg overflow-hidden border border-app-border/60 bg-app-deepest/60 select-none flex flex-col items-center justify-center gap-1.5 px-4 text-center">
        <MapPinOff className="w-4 h-4 text-txt-tertiary/70" />
        <span className="text-[11px] text-txt-tertiary leading-snug">
          {t("inspector.mapNoGpsPlaceholder")}
        </span>
        {onAddGpsClick && (
          <button
            type="button"
            onClick={onAddGpsClick}
            className="text-[10px] text-accent hover:underline hover:text-accent/80 transition-colors mt-0.5"
          >
            {t("inspector.addGps")}
          </button>
        )}
      </div>
    );
  }

  const centerTile = tiles.find((tile) => tile.isCenter);
  const isOfflineOrBlocked =
    validTiles.length > 0 &&
    (failedCount === validTiles.length ||
      (centerTile != null && tileStatus[centerTile.key] === "error" && loadedCount === 0));

  const gridSize = OSM_TILE_SIZE * 3;

  return (
    <div
      onClick={onMapClick}
      role={onMapClick ? "button" : undefined}
      tabIndex={onMapClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onMapClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onMapClick();
        }
      }}
      title={onMapClick ? t("inspector.mapClickToOpen") : undefined}
      className={`relative w-full h-[152px] rounded-lg overflow-hidden border border-app-border/60 bg-app-deepest select-none ${
        onMapClick ? "cursor-pointer group/map" : ""
      }`}
    >
      {/* 3x3 Slippy Map Tile Grid centered on exact pin pixel */}
      {!isOfflineOrBlocked && (
        <div
          className="absolute pointer-events-none"
          style={{
            width: `${gridSize}px`,
            height: `${gridSize}px`,
            left: `calc(50% - ${slippy.pinX}px)`,
            top: `calc(50% - ${slippy.pinY}px)`,
          }}
        >
          {tiles.map((tile) => {
            const status = tileStatus[tile.key];
            const posStyle = {
              left: `${tile.col * OSM_TILE_SIZE}px`,
              top: `${tile.row * OSM_TILE_SIZE}px`,
              width: `${OSM_TILE_SIZE}px`,
              height: `${OSM_TILE_SIZE}px`,
            };

            if (!tile.url || status === "error") {
              return <div key={tile.key} className="absolute bg-app-deepest" style={posStyle} />;
            }

            return (
              <img
                key={tile.key}
                src={tile.url}
                alt=""
                draggable={false}
                onLoad={() =>
                  setTileStatus((prev) =>
                    prev[tile.key] === "loaded" ? prev : { ...prev, [tile.key]: "loaded" }
                  )
                }
                onError={() =>
                  setTileStatus((prev) =>
                    prev[tile.key] === "error" ? prev : { ...prev, [tile.key]: "error" }
                  )
                }
                className="absolute block brightness-[0.88] contrast-[1.04]"
                style={posStyle}
              />
            );
          })}
        </div>
      )}

      {/* Offline / Blocked Fallback */}
      {isOfflineOrBlocked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center bg-app-deepest/95">
          <MapPinOff className="w-4 h-4 text-txt-tertiary" />
          <span className="text-[11px] text-txt-tertiary leading-snug">
            {t("inspector.mapOfflineFallback")}
          </span>
        </div>
      ) : (
        /* Centered Photo Location Pin */
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-center">
          <span className="absolute w-6 h-6 rounded-full bg-accent/25 border border-accent/40" />
          <span className="relative w-3 h-3 rounded-full bg-accent border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.65)]" />
        </div>
      )}

      {/* Compact Zoom Controls Overlay */}
      {!isOfflineOrBlocked && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1.5 right-1.5 z-20 flex flex-col bg-app-deepest/85 backdrop-blur-sm border border-app-border/70 rounded-md overflow-hidden shadow-sm"
        >
          <button
            type="button"
            disabled={zoom >= OSM_MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(OSM_MAX_ZOOM, z + 1))}
            className="p-1 text-txt-secondary hover:text-txt-primary hover:bg-app-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            title={t("inspector.mapZoomIn")}
          >
            <Plus className="w-3 h-3" />
          </button>
          <div className="h-px bg-app-border/60" />
          <button
            type="button"
            disabled={zoom <= OSM_MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(OSM_MIN_ZOOM, z - 1))}
            className="p-1 text-txt-secondary hover:text-txt-primary hover:bg-app-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            title={t("inspector.mapZoomOut")}
          >
            <Minus className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Subtle OSM Attribution */}
      <div className="absolute bottom-1 right-1.5 z-20 pointer-events-none px-1.5 py-0.5 rounded bg-app-deepest/80 text-[9px] leading-none text-txt-secondary/90">
        © OpenStreetMap
      </div>
    </div>
  );
}
