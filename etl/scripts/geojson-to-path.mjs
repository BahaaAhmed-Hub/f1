// Converts a circuit's GeoJSON outline into the SVG path shape index.html
// renders: a closed path normalised into the 0..500 viewBox with a 35px margin,
// aspect ratio preserved.
//
//   node etl/scripts/geojson-to-path.mjs <circuit-id>        e.g. es-2026
//   node etl/scripts/geojson-to-path.mjs --verify <id> <svg> compare to a known layout
import { readFile } from 'node:fs/promises';

const GEOJSON = '/home/user/bacinger/f1-circuits/f1-circuits.geojson';
const BOX = 500;
const MARGIN = 35;          // matches every existing path: coordinates span 35..465

export async function feature(id) {
  const data = JSON.parse(await readFile(GEOJSON, 'utf8'));
  const f = data.features.find(x => x.properties?.id === id);
  if (!f) throw new Error(`no circuit with id "${id}"`);
  return f;
}

/**
 * Longitude degrees shrink with latitude, so a raw lon/lat plot stretches a
 * circuit horizontally. Scale x by cos(latitude) to keep the shape true, and
 * flip y because SVG counts downwards while latitude counts up.
 */
export function toPath(coords, { rotate = 0, flipX = false } = {}) {
  const meanLat = coords.reduce((a, [, lat]) => a + lat, 0) / coords.length;
  const k = Math.cos(meanLat * Math.PI / 180);

  let pts = coords.map(([lon, lat]) => [lon * k, -lat]);

  if (rotate) {
    const r = rotate * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    pts = pts.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  }
  if (flipX) pts = pts.map(([x, y]) => [-x, y]);

  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);

  const span = BOX - 2 * MARGIN;
  const scale = Math.min(span / (x1 - x0), span / (y1 - y0));
  const offX = (BOX - (x1 - x0) * scale) / 2;
  const offY = (BOX - (y1 - y0) * scale) / 2;

  const out = pts.map(([x, y]) =>
    [(x - x0) * scale + offX, (y - y0) * scale + offY]);

  // Drop a duplicated closing vertex; "Z" closes the path.
  const [fx, fy] = out[0], [lx, ly] = out.at(-1);
  if (Math.hypot(fx - lx, fy - ly) < 0.5) out.pop();

  return `M ${out.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')} Z`;
}

/** Turby-shape comparison: resample both outlines and measure mean divergence. */
export function similarity(pathA, pathB) {
  const parse = p => {
    const n = (p.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]]);
  };
  const resample = (pts, N = 180) => {
    const d = [0];
    for (let i = 1; i < pts.length; i++)
      d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = d.at(-1);
    return Array.from({ length: N }, (_, i) => {
      const t = (i / N) * total;
      let j = d.findIndex(v => v >= t); if (j < 1) j = 1;
      const f = (t - d[j - 1]) / (d[j] - d[j - 1] || 1);
      return [pts[j - 1][0] + f * (pts[j][0] - pts[j - 1][0]),
              pts[j - 1][1] + f * (pts[j][1] - pts[j - 1][1])];
    });
  };
  const A = resample(parse(pathA)), B = resample(parse(pathB));
  // Outlines may start at different points, so try every rotation and direction.
  let best = Infinity;
  for (const seq of [B, [...B].reverse()]) {
    for (let s = 0; s < seq.length; s++) {
      let sum = 0;
      for (let i = 0; i < A.length; i++) {
        const b = seq[(i + s) % seq.length];
        sum += Math.hypot(A[i][0] - b[0], A[i][1] - b[1]);
      }
      best = Math.min(best, sum / A.length);
    }
  }
  return best;   // mean distance in viewBox units (0..500)
}

if (import.meta.filename === process.argv[1]) {
  const [, , ...args] = process.argv;
  const f = await feature(args[0] === '--verify' ? args[1] : args[0]);
  console.log(toPath(f.geometry.coordinates));
}
