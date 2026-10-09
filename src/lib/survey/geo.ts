export type LngLat = [number, number];

const EARTH_M = 6_371_000;

export function haversine(a: LngLat, b: LngLat): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dlat = lat2 - lat1;
  const dlng = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += haversine(coords[i - 1], coords[i]);
  return total;
}

function crossTrackMeters(point: LngLat, start: LngLat, end: LngLat): number {
  const lat0 = (start[1] * Math.PI) / 180;
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_540;
  const bx = (end[0] - start[0]) * kx;
  const by = (end[1] - start[1]) * ky;
  const px = (point[0] - start[0]) * kx;
  const py = (point[1] - start[1]) * ky;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Douglas–Peucker in meters. Keeps endpoints. */
export function simplify(points: LngLat[], epsilonM: number): LngLat[] {
  if (points.length <= 2) return points.slice();
  let maxD = 0;
  let index = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i += 1) {
    const distance = crossTrackMeters(points[i], points[0], points[last]);
    if (distance > maxD) {
      maxD = distance;
      index = i;
    }
  }
  if (maxD > epsilonM) {
    const left = simplify(points.slice(0, index + 1), epsilonM);
    const right = simplify(points.slice(index), epsilonM);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[last]];
}

export function simplifyToCap(points: LngLat[], epsilonM: number, cap: number): LngLat[] {
  let epsilon = epsilonM;
  let simplified = simplify(points, epsilon);
  while (simplified.length > cap && epsilon < 40) {
    epsilon *= 1.7;
    simplified = simplify(points, epsilon);
  }
  return simplified.length >= 2 ? simplified : points.slice();
}

export interface Sample {
  lng: number;
  lat: number;
  accuracy: number | null;
  t: number;
}

const MIN_MOVE_M = 2;
const MIN_INTERVAL_MS = 1_500;

/** Drop stationary jitter and impossible jumps so a walk stays a light line. */
export function shouldAcceptSample(last: Sample | null, next: Sample): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return false;
  if (!last) return true;
  const moved = haversine([last.lng, last.lat], [next.lng, next.lat]);
  const dt = next.t - last.t;
  if (dt < 0) return false;
  if ((next.accuracy ?? 999) > 50 && moved < 12) return false;
  if (moved < MIN_MOVE_M && dt < 10_000) return false;
  if (dt < MIN_INTERVAL_MS && moved < 8) return false;
  if (dt > 400 && moved / (dt / 1000) > 45) return false;
  return true;
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (Math.abs(meters) >= 1000) {
    return `${(meters / 1000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`;
  }
  return `${meters.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} m`;
}

export function formatAccuracy(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  const digits = meters >= 10 ? 0 : 1;
  return `±${meters.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} m`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 2) return "agora";
  if (seconds < 60) return `há ${seconds} s`;
  return `há ${Math.floor(seconds / 60)} min`;
}

export function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function parseCoord(value: string): number | null {
  const number = Number(value.replace(",", ".").trim());
  return Number.isFinite(number) ? number : null;
}

export function roundCoord(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function makeTeamCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function formatTeamCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export function normalizeTeamCode(code: string): string | null {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-Z0-9]{8}$/.test(clean) ? clean : null;
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "obra";
}
