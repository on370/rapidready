import { parseCoordinates } from './geo.ts';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
assert.strictEqual = (a: any, b: any, msg?: string) => {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
};

console.log('Testing geo parser...');

// 1. Google Maps URLs
{
  const r1 = parseCoordinates('https://www.google.com/maps/@48.137154,11.575421,17z');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.sourceType, 'url_google');
  assert.strictEqual(r1.coords?.latitude, 48.137154);
  assert.strictEqual(r1.coords?.longitude, 11.575421);

  const r2 = parseCoordinates('https://www.google.de/maps/place/Munich/@48.137154,11.575421,17z/data=!3m1!4b1');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.coords?.latitude, 48.137154);
  assert.strictEqual(r2.coords?.longitude, 11.575421);

  const r3 = parseCoordinates('https://maps.google.com/?q=48.137154,11.575421');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.coords?.latitude, 48.137154);
  assert.strictEqual(r3.coords?.longitude, 11.575421);

  const r4 = parseCoordinates('https://maps.google.com/?ll=48.137154,11.575421');
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.coords?.latitude, 48.137154);
  assert.strictEqual(r4.coords?.longitude, 11.575421);

  const r5 = parseCoordinates('https://www.google.com/maps/search/?api=1&query=48.137154%2C11.575421');
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.coords?.latitude, 48.137154);
  assert.strictEqual(r5.coords?.longitude, 11.575421);
}

// 2. Apple Maps URLs
{
  const r1 = parseCoordinates('https://maps.apple.com/?ll=48.137154,11.575421');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.sourceType, 'url_apple');
  assert.strictEqual(r1.coords?.latitude, 48.137154);
  assert.strictEqual(r1.coords?.longitude, 11.575421);

  const r2 = parseCoordinates('https://maps.apple.com/?q=Munich&sll=48.137154,11.575421');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.coords?.latitude, 48.137154);
  assert.strictEqual(r2.coords?.longitude, 11.575421);
}

// 3. OpenStreetMap URLs
{
  const r1 = parseCoordinates('https://www.openstreetmap.org/?mlat=48.137154&mlon=11.575421#map=16/48.1372/11.5754');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.sourceType, 'url_osm');
  assert.strictEqual(r1.coords?.latitude, 48.137154);
  assert.strictEqual(r1.coords?.longitude, 11.575421);

  const r2 = parseCoordinates('https://www.openstreetmap.org/#map=16/48.137154/11.575421');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.coords?.sourceType, 'url_osm');
  assert.strictEqual(r2.coords?.latitude, 48.137154);
  assert.strictEqual(r2.coords?.longitude, 11.575421);
}

// 4. Geo URIs
{
  const r1 = parseCoordinates('geo:48.137154,11.575421');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.sourceType, 'geo_uri');
  assert.strictEqual(r1.coords?.latitude, 48.137154);
  assert.strictEqual(r1.coords?.longitude, 11.575421);

  const r2 = parseCoordinates('geo:48.137154,11.575421,520');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.coords?.latitude, 48.137154);
  assert.strictEqual(r2.coords?.longitude, 11.575421);
  assert.strictEqual(r2.coords?.altitude, 520);
}

// 5. Degrees, Minutes, Seconds (DMS)
{
  const r1 = parseCoordinates('48° 08\' 14" N, 11° 34\' 32" E');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.sourceType, 'dms');
  assert(Math.abs((r1.coords?.latitude ?? 0) - 48.137222) < 0.001);
  assert(Math.abs((r1.coords?.longitude ?? 0) - 11.575555) < 0.001);

  // Unicode primes and German 'O' (Ost)
  const r2 = parseCoordinates('48° 08′ 13.8″ N, 11° 34′ 31.5″ O');
  assert.strictEqual(r2.success, true);
  assert(Math.abs((r2.coords?.latitude ?? 0) - 48.137166) < 0.001);
  assert(Math.abs((r2.coords?.longitude ?? 0) - 11.575416) < 0.001);

  // South and West hemispheres
  const r3 = parseCoordinates('33° 51\' 30" S, 151° 12\' 36" W');
  assert.strictEqual(r3.success, true);
  assert((r3.coords?.latitude ?? 0) < 0);
  assert((r3.coords?.longitude ?? 0) < 0);

  // Prefix cardinals
  const r4 = parseCoordinates('N 48° 08\' 14", E 11° 34\' 32"');
  assert.strictEqual(r4.success, true);
  assert(Math.abs((r4.coords?.latitude ?? 0) - 48.137222) < 0.001);
}

// 6. Degrees Decimal Minutes (DMM)
{
  const r1 = parseCoordinates('48° 08.230\' N, 11° 34.525\' E');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.sourceType, 'dmm');
  assert(Math.abs((r1.coords?.latitude ?? 0) - 48.137166) < 0.001);
  assert(Math.abs((r1.coords?.longitude ?? 0) - 11.575416) < 0.001);
}

// 7. Decimal Degrees (DD)
{
  // Standard dot notation
  const r1 = parseCoordinates('48.137154, 11.575421');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.coords?.latitude, 48.137154);
  assert.strictEqual(r1.coords?.longitude, 11.575421);

  // Space separated
  const r2 = parseCoordinates('48.137154 11.575421');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.coords?.latitude, 48.137154);
  assert.strictEqual(r2.coords?.longitude, 11.575421);

  // German comma notation with semicolon
  const r3 = parseCoordinates('48,137154; 11,575421');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.coords?.latitude, 48.137154);
  assert.strictEqual(r3.coords?.longitude, 11.575421);

  // German comma notation with comma separator
  const r4 = parseCoordinates('48,137154, 11,575421');
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.coords?.latitude, 48.137154);
  assert.strictEqual(r4.coords?.longitude, 11.575421);

  // German comma notation with space
  const r5 = parseCoordinates('48,137154 11,575421');
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.coords?.latitude, 48.137154);
  assert.strictEqual(r5.coords?.longitude, 11.575421);

  // With cardinal and degree symbols
  const r6 = parseCoordinates('48.137154° N, 11.575421° E');
  assert.strictEqual(r6.success, true);
  assert.strictEqual(r6.coords?.latitude, 48.137154);
  assert.strictEqual(r6.coords?.longitude, 11.575421);

  // Swapped order with cardinal: East first, then North
  const r7 = parseCoordinates('11.575421° E, 48.137154° N');
  assert.strictEqual(r7.success, true);
  assert.strictEqual(r7.coords?.latitude, 48.137154);
  assert.strictEqual(r7.coords?.longitude, 11.575421);
}

// 8. Range Validation
{
  const r1 = parseCoordinates('95.123456, 11.575421');
  assert.strictEqual(r1.success, false);
  assert(!!r1.error?.includes('Breitengrad'));

  const r2 = parseCoordinates('48.137154, 195.575421');
  assert.strictEqual(r2.success, false);
  assert(!!r2.error?.includes('Längengrad'));

  const r3 = parseCoordinates('abc, def');
  assert.strictEqual(r3.success, false);
}

console.log('All geo parser tests passed successfully! 🎉');
