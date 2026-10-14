/**
 * Street-structure geometry: CALÇADA | MEIO-FIO | ASFALTO | MEIO-FIO | CALÇADA.
 * - straightenLine: turns noisy GPS tracks into straight runs joined by smooth curves.
 * - followCurb: rebuilds a sidewalk parallel to its curb, on the outer side.
 * - snapToLine: places points (caixa-ralo, piso tátil) on their reference line.
 * Works in a local metric plane; never invents positions beyond the recorded ones.
 */
import type { FieldRecord } from "@/lib/survey/types";

type LngLat = [number, number];
type XY = [number, number];

interface Plane {
  to: (p: LngLat) => XY;
  from: (p: XY) => LngLat;
}

function plane(ref: LngLat): Plane {
  const kx = 111_320 * Math.cos((ref[1] * Math.PI) / 180);
  const ky = 110_540;
  return {
    to: (p) => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky],
    from: (p) => [Math.round((ref[0] + p[0] / kx) * 1e7) / 1e7, Math.round((ref[1] + p[1] / ky) * 1e7) / 1e7],
  };
}

const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const add = (a: XY, b: XY): XY => [a[0] + b[0], a[1] + b[1]];
const mul = (a: XY, k: number): XY => [a[0] * k, a[1] * k];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const len = (a: XY) => Math.hypot(a[0], a[1]);
const unit = (a: XY): XY => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [1, 0];
};

function segDist(p: XY, a: XY, b: XY) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  const q = add(a, mul(ab, t));
  return { d: len(sub(p, q)), t, q, side: Math.sign(cross(ab, sub(p, a))) || 1 };
}

/** Douglas–Peucker returning kept indices. */
function dpIndices(pts: XY[], eps: number): number[] {
  const keep = new Set<number>([0, pts.length - 1]);
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let best = -1;
    let bestD = eps;
    for (let i = s + 1; i < e; i += 1) {
      const d = segDist(pts[i], pts[s], pts[e]).d;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep.add(best);
      stack.push([s, best], [best, e]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

function turnDeg(a: XY, b: XY, c: XY): number {
  const u = unit(sub(b, a));
  const v = unit(sub(c, b));
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
}

/** Least-squares (PCA) line through points: centroid + direction. */
function fitLine(pts: XY[], hint: XY) {
  const n = pts.length;
  const c: XY = [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) {
    const dx = p[0] - c[0], dy = p[1] - c[1];
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let d: XY = [Math.cos(ang), Math.sin(ang)];
  if (n < 3 || !Number.isFinite(ang)) d = unit(hint);
  if (dot(d, hint) < 0) d = mul(d, -1);
  return { c, d };
}

function project(p: XY, line: { c: XY; d: XY }): XY {
  return add(line.c, mul(line.d, dot(sub(p, line.c), line.d)));
}

function intersect(a: { c: XY; d: XY }, b: { c: XY; d: XY }): XY | null {
  const den = cross(a.d, b.d);
  if (Math.abs(den) < 1e-6) return null;
  const t = cross(sub(b.c, a.c), b.d) / den;
  return add(a.c, mul(a.d, t));
}

const MIN_TURN_DEG = 22; // abaixo disso é oscilação, não esquina
const NOISE_M = 2.5; // ruído típico do GPS em caminhada
const CURVE_R = 6; // raio da emborcadura (m)

function straightenXY(raw: XY[]): XY[] {
  // Remove duplicates.
  const pts = raw.filter((p, i) => i === 0 || len(sub(p, raw[i - 1])) > 0.05);
  if (pts.length < 2) return pts;
  if (pts.length === 2) return pts;
  let idx = dpIndices(pts, NOISE_M);
  // Merge vertices that are only small direction changes or tiny wiggles.
  for (let changed = true; changed && idx.length > 2; ) {
    changed = false;
    for (let k = 1; k < idx.length - 1; k += 1) {
      const a = pts[idx[k - 1]], b = pts[idx[k]], c = pts[idx[k + 1]];
      const short = Math.min(len(sub(b, a)), len(sub(c, b))) < 4;
      if (turnDeg(a, b, c) < MIN_TURN_DEG || (short && turnDeg(a, b, c) < 60)) {
        idx.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
  // Fit one straight line per run, using every raw sample of that run.
  const runs = [] as Array<{ c: XY; d: XY }>;
  for (let k = 0; k < idx.length - 1; k += 1) {
    const slice = pts.slice(idx[k], idx[k + 1] + 1);
    runs.push(fitLine(slice, sub(pts[idx[k + 1]], pts[idx[k]])));
  }
  const corners: XY[] = [project(pts[0], runs[0])];
  for (let k = 1; k < runs.length; k += 1) {
    const hit = intersect(runs[k - 1], runs[k]);
    const orig = pts[idx[k]];
    corners.push(hit && len(sub(hit, orig)) < 15 ? hit : orig);
  }
  corners.push(project(pts[pts.length - 1], runs[runs.length - 1]));
  // Smooth curve (emborcadura) only at real corners.
  const out: XY[] = [corners[0]];
  for (let k = 1; k < corners.length - 1; k += 1) {
    const a = corners[k - 1], p = corners[k], b = corners[k + 1];
    const inD = unit(sub(p, a)), outD = unit(sub(b, p));
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(inD, outD))));
    const t = Math.min(CURVE_R * Math.tan(theta / 2), 0.45 * len(sub(p, a)), 0.45 * len(sub(b, p)));
    if (t < 0.3) {
      out.push(p);
      continue;
    }
    const s = sub(p, mul(inD, t)), e = add(p, mul(outD, t));
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      out.push(add(add(mul(s, (1 - u) ** 2), mul(p, 2 * u * (1 - u))), mul(e, u * u)));
    }
  }
  out.push(corners[corners.length - 1]);
  return out;
}

export function straightenLine(coords: LngLat[]): LngLat[] {
  if (coords.length < 2) return coords.slice();
  const pl = plane(coords[0]);
  const out = straightenXY(coords.map(pl.to)).map(pl.from);
  return out.length >= 2 ? out : coords.slice();
}

function nearestOnPolyline(p: XY, line: XY[]) {
  let best = { d: Infinity, side: 1, s: 0, q: line[0] };
  let acc = 0;
  for (let i = 1; i < line.length; i += 1) {
    const r = segDist(p, line[i - 1], line[i]);
    const segLen = len(sub(line[i], line[i - 1]));
    if (r.d < best.d) best = { d: r.d, side: r.side, s: acc + r.t * segLen, q: r.q };
    acc += segLen;
  }
  return best;
}

function offsetPolyline(line: XY[], dist: number): XY[] {
  return line.map((p, i) => {
    const prev = line[Math.max(0, i - 1)], next = line[Math.min(line.length - 1, i + 1)];
    const nIn = i > 0 ? unit(sub(p, prev)) : unit(sub(next, p));
    const nOut = i < line.length - 1 ? unit(sub(next, p)) : nIn;
    const tan = unit(add(nIn, nOut));
    const normal: XY = [-tan[1], tan[0]];
    const miter = Math.min(2, 1 / Math.max(0.5, dot(normal, [-nIn[1], nIn[0]])));
    return add(p, mul(normal, dist * miter));
  });
}

function subPolyline(line: XY[], s0: number, s1: number): XY[] {
  const [a, b] = s0 <= s1 ? [s0, s1] : [s1, s0];
  const out: XY[] = [];
  let acc = 0;
  const at = (i: number, s: number): XY => {
    const l = len(sub(line[i], line[i - 1]));
    return add(line[i - 1], mul(sub(line[i], line[i - 1]), l ? (s - acc) / l : 0));
  };
  for (let i = 1; i < line.length; i += 1) {
    const l = len(sub(line[i], line[i - 1]));
    const end = acc + l;
    if (end >= a && acc <= b) {
      if (!out.length) out.push(at(i, Math.max(a, acc)));
      out.push(end <= b ? line[i] : at(i, b));
    }
    acc = end;
  }
  return s0 <= s1 ? out : out.reverse();
}

function linesOf(features: FieldRecord[], projectId: string, type: FieldRecord["type"]) {
  return features.filter((f) => f.projectId === projectId && f.type === type && f.kind === "line" && f.coordinates.length >= 2);
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export interface ShapeResult {
  coordinates: LngLat[];
  info: string | null;
  warning: string | null;
}

/** Straighten a new line and apply the street relation for its type. */
export function shapeLine(type: FieldRecord["type"], raw: LngLat[], features: FieldRecord[], projectId: string): ShapeResult {
  const straight = straightenLine(raw);
  if (raw.length < 2) return { coordinates: straight, info: null, warning: null };
  const pl = plane(raw[0]);
  const rawXY = raw.map(pl.to);
  const asphalt = linesOf(features, projectId, "asfalto").map((f) => f.coordinates.map(pl.to));
  const nearAsphalt = (p: XY) => Math.min(Infinity, ...asphalt.map((l) => nearestOnPolyline(p, l).d));

  if (type === "calcada") {
    // A calçada segue o meio-fio mais próximo, paralela e do lado externo.
    let best: { line: XY[]; score: number } | null = null;
    for (const curb of linesOf(features, projectId, "meiofio")) {
      const line = curb.coordinates.map(pl.to);
      const ds = rawXY.map((p) => nearestOnPolyline(p, line).d);
      const near = ds.filter((d) => d < 12).length / ds.length;
      const score = median(ds);
      if (near >= 0.6 && score < 10 && (!best || score < best.score)) best = { line, score };
    }
    if (best) {
      const curb = best.line;
      const hits = rawXY.map((p) => nearestOnPolyline(p, curb));
      let side = Math.sign(hits.reduce((s, h) => s + h.side, 0)) || 1;
      // Lado externo = lado oposto ao asfalto, quando há asfalto registrado.
      const asphaltSides = asphalt.flatMap((l) => l.map((p) => nearestOnPolyline(p, curb)).filter((h) => h.d < 15).map((h) => h.side));
      if (asphaltSides.length) side = -(Math.sign(asphaltSides.reduce((a, b) => a + b, 0)) || -side);
      const dist = Math.max(0.8, Math.min(6, median(hits.map((h) => h.d))));
      const parallel = offsetPolyline(curb, side * dist);
      const s0 = nearestOnPolyline(rawXY[0], parallel).s;
      const s1 = nearestOnPolyline(rawXY[rawXY.length - 1], parallel).s;
      const piece = subPolyline(parallel, s0, s1);
      if (piece.length >= 2 && Math.abs(s1 - s0) >= 3) {
        return { coordinates: piece.map(pl.from), info: "Calçada alinhada paralela ao meio-fio.", warning: null };
      }
    }
    const crosses = asphalt.length && straight.map(pl.to).some((p) => nearAsphalt(p) < 1.5);
    return {
      coordinates: straight,
      info: null,
      warning: crosses ? "A calçada passa sobre o asfalto. Confira o trajeto." : linesOf(features, projectId, "meiofio").length ? null : "Sem meio-fio próximo: calçada gravada só alinhada.",
    };
  }

  if (type === "meiofio" && asphalt.length) {
    const ds = straight.map(pl.to).map(nearAsphalt);
    if (median(ds) < 1.5) {
      return { coordinates: straight, info: null, warning: "Meio-fio está no centro do asfalto. Ande pela borda da via." };
    }
  }
  return { coordinates: straight, info: null, warning: null };
}

/** Caixa-ralo → meio-fio; piso tátil → calçada. Returns snapped position when a reference is near. */
export function snapPoint(type: FieldRecord["type"], lat: number, lng: number, features: FieldRecord[], projectId: string, excludeId?: string) {
  const target = type === "ralo" ? "meiofio" : type === "tatil" ? "calcada" : null;
  if (!target) return null;
  const pl = plane([lng, lat]);
  let best: { q: XY; d: number } | null = null;
  for (const f of linesOf(features, projectId, target)) {
    if (f.id === excludeId) continue;
    const hit = nearestOnPolyline([0, 0], f.coordinates.map(pl.to));
    if (hit.d < 8 && (!best || hit.d < best.d)) best = { q: hit.q, d: hit.d };
  }
  if (!best) return null;
  const [sLng, sLat] = pl.from(best.q);
  return { lat: sLat, lng: sLng, moved: best.d, label: target === "meiofio" ? "meio-fio" : "calçada" };
}
