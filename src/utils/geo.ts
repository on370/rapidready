export interface ParsedGpsCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  formattedDms: string;
  formattedDd: string;
  sourceType: 'url_google' | 'url_apple' | 'url_osm' | 'geo_uri' | 'dms' | 'dmm' | 'dd';
}

export interface ParseGpsResult {
  success: boolean;
  coords?: ParsedGpsCoordinates;
  error?: string;
}

/**
 * Formats a single coordinate (latitude or longitude) as standard photographic DMS:
 * e.g. 48° 08' 13.8" N or 11° 34' 31.5" E
 */
export function formatDmsCoord(val: number, isLat: boolean): string {
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${deg}° ${String(min).padStart(2, '0')}' ${sec.padStart(4, '0')}" ${dir}`;
}

/**
 * Formats a pair of coordinates as standard photographic DMS:
 * e.g. 48° 08' 14" N, 11° 34' 32" E
 */
export function formatDms(lat: number, lon: number): string {
  return `${formatDmsCoord(lat, true)}, ${formatDmsCoord(lon, false)}`;
}

/**
 * Formats a pair of coordinates as Decimal Degrees:
 * e.g. 48.137154°, 11.575421°
 */
export function formatDd(lat: number, lon: number): string {
  return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
}

/**
 * Validates coordinate ranges:
 * -90 <= lat <= 90
 * -180 <= lon <= 180
 */
export function validateCoordinates(lat: number, lon: number): { valid: boolean; error?: string } {
  if (isNaN(lat) || isNaN(lon)) {
    return { valid: false, error: 'Ungültige Zahlenwerte für Koordinaten.' };
  }
  if (lat < -90 || lat > 90) {
    return {
      valid: false,
      error: `Breitengrad außerhalb des gültigen Bereichs (${lat.toFixed(4)}° liegt nicht zwischen -90° und +90°).`
    };
  }
  if (lon < -180 || lon > 180) {
    return {
      valid: false,
      error: `Längengrad außerhalb des gültigen Bereichs (${lon.toFixed(4)}° liegt nicht zwischen -180° und +180°).`
    };
  }
  return { valid: true };
}

/**
 * Normalizes prime and quote characters in coordinate strings:
 * Converts unicode primes, typographical single/double quotes, and backticks.
 */
function normalizeQuotes(str: string): string {
  return str
    .replace(/[\u2018\u2019\u2032\u00B4\`]/g, "'") // single quotes / primes
    .replace(/[\u201C\u201D\u2033]/g, '"')         // double quotes / double primes
    .replace(/''/g, '"');                          // two single quotes as double quote
}

/**
 * Parses cardinal direction character and returns multiplier (+1 or -1).
 * Supports German 'O' (Ost) for East as well as 'E'.
 */
function getCardinalMultiplier(cardinal: string): number {
  const c = cardinal.trim().toUpperCase();
  if (c === 'S' || c === 'W') return -1;
  return 1;
}

/**
 * Universal client-side parser for GPS coordinates and map links.
 * Accepts:
 * - Google Maps URLs (@lat,lon, ?q=lat,lon, ?ll=lat,lon)
 * - Apple Maps URLs (?ll=lat,lon, ?sll=lat,lon, ?coordinate=lat,lon)
 * - OpenStreetMap URLs (?mlat=lat&mlon=lon, #map=zoom/lat/lon)
 * - Geo URIs (geo:lat,lon[,alt])
 * - Degrees Minutes Seconds (DMS): 48° 08' 14" N, 11° 34' 32" E
 * - Degrees Decimal Minutes (DMM): 48° 08.230' N, 11° 34.525' E
 * - Decimal Degrees (DD): 48.137154, 11.575421 / 48,137154; 11,575421
 */
export function parseCoordinates(rawInput: string): ParseGpsResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { success: false, error: 'Keine Eingabe vorhanden.' };
  }

  // Decode URL encoding if present (e.g. %2C, %20, %C2%B0, +)
  let input = trimmed;
  if (input.includes('%') || input.startsWith('http') || input.startsWith('geo:')) {
    try {
      input = decodeURIComponent(input.replace(/\+/g, ' '));
    } catch {
      // Keep original if decodeURIComponent fails
    }
  }

  // 1. Google Maps URLs
  if (/google\.[a-z.]+\/maps/i.test(input) || /maps\.google\.[a-z.]+/i.test(input)) {
    // Pattern A: @lat,lon (e.g. @48.137154,11.575421,17z)
    const atMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lon = parseFloat(atMatch[2]);
      const val = validateCoordinates(lat, lon);
      if (!val.valid) return { success: false, error: val.error };
      return {
        success: true,
        coords: {
          latitude: lat,
          longitude: lon,
          formattedDms: formatDms(lat, lon),
          formattedDd: formatDd(lat, lon),
          sourceType: 'url_google'
        }
      };
    }

    // Pattern B: Query params q=lat,lon or ll=lat,lon or query=lat,lon or destination=lat,lon
    const qMatch = input.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
    if (qMatch) {
      const lat = parseFloat(qMatch[1]);
      const lon = parseFloat(qMatch[2]);
      const val = validateCoordinates(lat, lon);
      if (!val.valid) return { success: false, error: val.error };
      return {
        success: true,
        coords: {
          latitude: lat,
          longitude: lon,
          formattedDms: formatDms(lat, lon),
          formattedDd: formatDd(lat, lon),
          sourceType: 'url_google'
        }
      };
    }
  }

  // 2. Apple Maps URLs
  if (/maps\.apple\.com/i.test(input)) {
    const appleMatch = input.match(/[?&](?:ll|sll|coordinate|q)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
    if (appleMatch) {
      const lat = parseFloat(appleMatch[1]);
      const lon = parseFloat(appleMatch[2]);
      const val = validateCoordinates(lat, lon);
      if (!val.valid) return { success: false, error: val.error };
      return {
        success: true,
        coords: {
          latitude: lat,
          longitude: lon,
          formattedDms: formatDms(lat, lon),
          formattedDd: formatDd(lat, lon),
          sourceType: 'url_apple'
        }
      };
    }
  }

  // 3. OpenStreetMap URLs
  if (/openstreetmap\.org/i.test(input)) {
    // Pattern A: ?mlat=48.137&mlon=11.575
    const mlatMatch = input.match(/[?&]mlat=(-?\d+\.\d+)/i);
    const mlonMatch = input.match(/[?&]mlon=(-?\d+\.\d+)/i);
    if (mlatMatch && mlonMatch) {
      const lat = parseFloat(mlatMatch[1]);
      const lon = parseFloat(mlonMatch[1]);
      const val = validateCoordinates(lat, lon);
      if (!val.valid) return { success: false, error: val.error };
      return {
        success: true,
        coords: {
          latitude: lat,
          longitude: lon,
          formattedDms: formatDms(lat, lon),
          formattedDd: formatDd(lat, lon),
          sourceType: 'url_osm'
        }
      };
    }

    // Pattern B: #map=16/48.137154/11.575421
    const mapHashMatch = input.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/i);
    if (mapHashMatch) {
      const lat = parseFloat(mapHashMatch[1]);
      const lon = parseFloat(mapHashMatch[2]);
      const val = validateCoordinates(lat, lon);
      if (!val.valid) return { success: false, error: val.error };
      return {
        success: true,
        coords: {
          latitude: lat,
          longitude: lon,
          formattedDms: formatDms(lat, lon),
          formattedDd: formatDd(lat, lon),
          sourceType: 'url_osm'
        }
      };
    }
  }

  // 4. Geo URIs (RFC 5870): geo:lat,lon[,alt]
  if (/^geo:/i.test(input)) {
    const geoMatch = input.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?/i);
    if (geoMatch) {
      const lat = parseFloat(geoMatch[1]);
      const lon = parseFloat(geoMatch[2]);
      const alt = geoMatch[3] ? parseFloat(geoMatch[3]) : undefined;
      const val = validateCoordinates(lat, lon);
      if (!val.valid) return { success: false, error: val.error };
      return {
        success: true,
        coords: {
          latitude: lat,
          longitude: lon,
          altitude: alt,
          formattedDms: formatDms(lat, lon),
          formattedDd: formatDd(lat, lon),
          sourceType: 'geo_uri'
        }
      };
    }
  }

  // Normalize quotes and spaces for textual coordinate parsing
  const clean = normalizeQuotes(input);

  // 5. Degrees, Minutes, Seconds (DMS)
  // Supports formats like:
  // - 48° 08' 14" N, 11° 34' 32" E
  // - 48°08'13.8"N 11°34'31.5"E
  // - N 48° 08' 14", E 11° 34' 32"
  // - 48° 08' 14" N 11° 34' 32" O (German Ost)
  // Regular expression for single DMS coordinate part:
  // (Optional Cardinal)(Deg)° (Min)' (Sec)[" (Optional Cardinal)]
  const dmsPartRegex = /(?:([NSEWO])\s*)?(\d{1,3})[°\s]+(\d{1,2})['\s]+(\d{1,2}(?:[.,]\d+)?)(?:"|'')?\s*([NSEWO])?/gi;
  const dmsMatches = [...clean.matchAll(dmsPartRegex)];

  if (dmsMatches.length >= 2) {
    const parseDmsPart = (m: RegExpMatchArray, isLatDefault: boolean) => {
      const cardPrefix = m[1];
      const deg = parseInt(m[2], 10);
      const min = parseInt(m[3], 10);
      const sec = parseFloat(m[4].replace(',', '.'));
      const cardSuffix = m[5];

      const cardinal = (cardPrefix || cardSuffix || (isLatDefault ? 'N' : 'E')).toUpperCase();
      let decimal = deg + min / 60 + sec / 3600;
      if (cardinal === 'S' || cardinal === 'W') {
        decimal = -decimal;
      }
      return { val: decimal, cardinal };
    };

    const first = parseDmsPart(dmsMatches[0], true);
    const second = parseDmsPart(dmsMatches[1], false);

    // If first has E/W/O and second has N/S, swap
    let lat = first.val;
    let lon = second.val;
    if (['E', 'W', 'O'].includes(first.cardinal) && ['N', 'S'].includes(second.cardinal)) {
      lat = second.val;
      lon = first.val;
    }

    const val = validateCoordinates(lat, lon);
    if (!val.valid) return { success: false, error: val.error };
    return {
      success: true,
      coords: {
        latitude: lat,
        longitude: lon,
        formattedDms: formatDms(lat, lon),
        formattedDd: formatDd(lat, lon),
        sourceType: 'dms'
      }
    };
  }

  // 6. Degrees, Decimal Minutes (DMM / NMEA)
  // e.g. 48° 08.230' N, 11° 34.525' E
  const dmmPartRegex = /(?:([NSEWO])\s*)?(\d{1,3})[°\s]+(\d{1,2}[.,]\d+)'?\s*([NSEWO])?/gi;
  const dmmMatches = [...clean.matchAll(dmmPartRegex)];

  if (dmmMatches.length >= 2) {
    const parseDmmPart = (m: RegExpMatchArray, isLatDefault: boolean) => {
      const cardPrefix = m[1];
      const deg = parseInt(m[2], 10);
      const min = parseFloat(m[3].replace(',', '.'));
      const cardSuffix = m[4];

      const cardinal = (cardPrefix || cardSuffix || (isLatDefault ? 'N' : 'E')).toUpperCase();
      let decimal = deg + min / 60;
      if (cardinal === 'S' || cardinal === 'W') {
        decimal = -decimal;
      }
      return { val: decimal, cardinal };
    };

    const first = parseDmmPart(dmmMatches[0], true);
    const second = parseDmmPart(dmmMatches[1], false);

    let lat = first.val;
    let lon = second.val;
    if (['E', 'W', 'O'].includes(first.cardinal) && ['N', 'S'].includes(second.cardinal)) {
      lat = second.val;
      lon = first.val;
    }

    const val = validateCoordinates(lat, lon);
    if (!val.valid) return { success: false, error: val.error };
    return {
      success: true,
      coords: {
        latitude: lat,
        longitude: lon,
        formattedDms: formatDms(lat, lon),
        formattedDd: formatDd(lat, lon),
        sourceType: 'dmm'
      }
    };
  }

  // 7. Decimal Degrees (DD)
  // Can be:
  // - 48.137154, 11.575421
  // - 48.137154 11.575421
  // - 48,137154; 11,575421
  // - 48,137154 11,575421
  // - 48,137154, 11,575421 (comma used as both decimal and separator)
  // - With cardinal: 48.137154° N, 11.575421° E / N 48.137154, E 11.575421
  
  // Case A: Semicolon or comma separator with German decimal commas (e.g. "48,137154; 11,575421" or "48,137154, 11,575421")
  const commaDecimalPair = clean.match(
    /(?:([NSEWO])\s*)?(-?\d+),(\d+)[°\s]*([NSEWO])?\s*[,;]\s*(?:([NSEWO])\s*)?(-?\d+),(\d+)[°\s]*([NSEWO])?/i
  );
  if (commaDecimalPair) {
    const card1 = (commaDecimalPair[1] || commaDecimalPair[4] || '').toUpperCase();
    const val1 = parseFloat(`${commaDecimalPair[2]}.${commaDecimalPair[3]}`) * (card1 ? getCardinalMultiplier(card1) : 1);

    const card2 = (commaDecimalPair[5] || commaDecimalPair[8] || '').toUpperCase();
    const val2 = parseFloat(`${commaDecimalPair[6]}.${commaDecimalPair[7]}`) * (card2 ? getCardinalMultiplier(card2) : 1);

    let lat = val1;
    let lon = val2;
    if (['E', 'W', 'O'].includes(card1) && ['N', 'S'].includes(card2)) {
      lat = val2;
      lon = val1;
    }

    const val = validateCoordinates(lat, lon);
    if (!val.valid) return { success: false, error: val.error };
    return {
      success: true,
      coords: {
        latitude: lat,
        longitude: lon,
        formattedDms: formatDms(lat, lon),
        formattedDd: formatDd(lat, lon),
        sourceType: 'dd'
      }
    };
  }

  // Case B: Space separated German decimal commas (e.g. "48,137154 11,575421" or "48,137154° N 11,575421° E")
  const spaceCommaPair = clean.match(
    /(?:([NSEWO])\s*)?(-?\d+),(\d+)[°\s]*([NSEWO])?\s+(?:([NSEWO])\s*)?(-?\d+),(\d+)[°\s]*([NSEWO])?/i
  );
  if (spaceCommaPair) {
    const card1 = (spaceCommaPair[1] || spaceCommaPair[4] || '').toUpperCase();
    const val1 = parseFloat(`${spaceCommaPair[2]}.${spaceCommaPair[3]}`) * (card1 ? getCardinalMultiplier(card1) : 1);

    const card2 = (spaceCommaPair[5] || spaceCommaPair[8] || '').toUpperCase();
    const val2 = parseFloat(`${spaceCommaPair[6]}.${spaceCommaPair[7]}`) * (card2 ? getCardinalMultiplier(card2) : 1);

    let lat = val1;
    let lon = val2;
    if (['E', 'W', 'O'].includes(card1) && ['N', 'S'].includes(card2)) {
      lat = val2;
      lon = val1;
    }

    const val = validateCoordinates(lat, lon);
    if (!val.valid) return { success: false, error: val.error };
    return {
      success: true,
      coords: {
        latitude: lat,
        longitude: lon,
        formattedDms: formatDms(lat, lon),
        formattedDd: formatDd(lat, lon),
        sourceType: 'dd'
      }
    };
  }

  // Case C: Standard dot decimal numbers (e.g. "48.137154, 11.575421", "48.137154 11.575421", "48.137154° N, 11.575421° E")
  const dotDecimalPair = clean.match(
    /(?:([NSEWO])\s*)?(-?\d+(?:\.\d+)?)[°\s]*([NSEWO])?\s*[,;\s]\s*(?:([NSEWO])\s*)?(-?\d+(?:\.\d+)?)[°\s]*([NSEWO])?/i
  );
  if (dotDecimalPair) {
    const card1 = (dotDecimalPair[1] || dotDecimalPair[3] || '').toUpperCase();
    let val1 = parseFloat(dotDecimalPair[2]);
    if (card1) val1 = Math.abs(val1) * getCardinalMultiplier(card1);

    const card2 = (dotDecimalPair[4] || dotDecimalPair[6] || '').toUpperCase();
    let val2 = parseFloat(dotDecimalPair[5]);
    if (card2) val2 = Math.abs(val2) * getCardinalMultiplier(card2);

    let lat = val1;
    let lon = val2;
    if (['E', 'W', 'O'].includes(card1) && ['N', 'S'].includes(card2)) {
      lat = val2;
      lon = val1;
    }

    const val = validateCoordinates(lat, lon);
    if (!val.valid) return { success: false, error: val.error };
    return {
      success: true,
      coords: {
        latitude: lat,
        longitude: lon,
        formattedDms: formatDms(lat, lon),
        formattedDd: formatDd(lat, lon),
        sourceType: 'dd'
      }
    };
  }

  return {
    success: false,
    error: 'Format nicht erkannt. Bitte einen Karten-Link oder Koordinaten (DMS, DD, DMM) eingeben.'
  };
}
