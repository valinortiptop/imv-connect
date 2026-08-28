/** Encode/decode Google encoded polylines (pure, isomorphic). */

export function decodePolyline(str: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords: [number, number][] = [];
  while (index < str.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

function encodeValue(v: number, out: string[]) {
  let value = v < 0 ? ~(v << 1) : v << 1;
  while (value >= 0x20) {
    out.push(String.fromCharCode((0x20 | (value & 0x1f)) + 63));
    value >>= 5;
  }
  out.push(String.fromCharCode(value + 63));
}

export function encodePolyline(points: [number, number][]): string {
  const out: string[] = [];
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    encodeValue(iLat - prevLat, out);
    encodeValue(iLng - prevLng, out);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out.join("");
}

/** Junta varias polilíneas codificadas en una sola. */
export function mergePolylines(encoded: (string | null | undefined)[]): string | null {
  const path: [number, number][] = [];
  for (const e of encoded) {
    if (!e) continue;
    for (const p of decodePolyline(e)) {
      const last = path[path.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      path.push(p);
    }
  }
  return path.length ? encodePolyline(path) : null;
}
