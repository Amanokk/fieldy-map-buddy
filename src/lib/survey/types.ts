export const FEATURE_TYPES = [
  "ralo",
  "deficiente",
  "calcada",
  "tatil",
  "meiofio",
  "asfalto",
] as const;

export type FeatureType = (typeof FEATURE_TYPES)[number];
export type SyncStatus = "pending" | "synced";
export type Origin = "gps" | "manual";

export interface TypeMeta {
  id: FeatureType;
  label: string;
  plural: string;
  mark: string;
  recording: string;
  kind: "point" | "line";
  color: string;
  casing: string;
  iconInk: string;
}

export const CATALOG: Record<FeatureType, TypeMeta> = {
  ralo: {
    id: "ralo",
    label: "Caixa-ralo",
    plural: "Caixas-ralo",
    mark: "CAIXA-RALO",
    recording: "CAIXA-RALO",
    kind: "point",
    color: "#e10600",
    casing: "#ffffff",
    iconInk: "#ffffff",
  },
  deficiente: {
    id: "deficiente",
    label: "Deficiente",
    plural: "Deficiente",
    mark: "DEFICIENTE",
    recording: "DEFICIENTE",
    kind: "point",
    color: "#1565c0",
    casing: "#ffffff",
    iconInk: "#ffffff",
  },
  calcada: {
    id: "calcada",
    label: "Calçada",
    plural: "Calçada",
    mark: "INICIAR CALÇADA",
    recording: "CALÇADA",
    kind: "line",
    color: "#5ecaf5",
    casing: "#0d3a4d",
    iconInk: "#102027",
  },
  tatil: {
    id: "tatil",
    label: "Piso tátil",
    plural: "Piso tátil",
    mark: "INICIAR PISO TÁTIL",
    recording: "PISO TÁTIL",
    kind: "line",
    color: "#ffd000",
    casing: "#5c4300",
    iconInk: "#1c1503",
  },
  meiofio: {
    id: "meiofio",
    label: "Meio-fio",
    plural: "Meio-fio",
    mark: "INICIAR MEIO-FIO",
    recording: "MEIO-FIO",
    kind: "line",
    color: "#1b8a3e",
    casing: "#ffffff",
    iconInk: "#ffffff",
  },
  asfalto: {
    id: "asfalto",
    label: "Asfalto",
    plural: "Asfalto",
    mark: "INICIAR ASFALTO",
    recording: "ASFALTO",
    kind: "line",
    color: "#222222",
    casing: "#ffffff",
    iconInk: "#ffffff",
  },
};

export type Filters = Record<FeatureType, boolean>;

export const DEFAULT_FILTERS: Filters = {
  ralo: true,
  deficiente: true,
  calcada: true,
  tatil: true,
  meiofio: true,
  asfalto: true,
};

export interface Project {
  id: string;
  name: string;
  place: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface FieldRecord {
  id: string;
  projectId: string;
  type: FeatureType;
  kind: "point" | "line";
  seq: number;
  lat: number;
  lng: number;
  coordinates: [number, number][];
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  note: string;
  lengthM: number | null;
  pointCount: number;
  sampleCount: number;
  origin: Origin;
  recordedAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  photoIds: string[];
}

export interface PhotoRec {
  id: string;
  featureId: string;
  createdAt: string;
  blob: Blob;
}

export interface Tombstone {
  id: string;
  kind: "project" | "feature";
}

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface MapCenter {
  lat: number;
  lng: number;
  zoom: number;
}

export interface LineDraft {
  type: FeatureType;
  paused: boolean;
  startedAt: string;
  points: Array<{ lng: number; lat: number; accuracy: number | null; t: number }>;
}

export interface SyncProject {
  id: string;
  name: string;
  place: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncFeature {
  id: string;
  projectId: string;
  type: FeatureType;
  kind: "point" | "line";
  seq: number;
  lat: number;
  lng: number;
  coordinates: [number, number][];
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  note: string;
  lengthM: number | null;
  pointCount: number;
  sampleCount: number;
  origin: Origin;
  recordedAt: string;
  updatedAt: string;
}

export interface SyncPayload {
  teamCode: string;
  projects: SyncProject[];
  features: SyncFeature[];
  deletedProjectIds: string[];
  deletedFeatureIds: string[];
}

export interface SyncResult {
  projects: SyncProject[];
  features: SyncFeature[];
  deletedProjectIds: string[];
  deletedFeatureIds: string[];
}

export type SheetState =
  | null
  | { kind: "mark" }
  | { kind: "finish" }
  | { kind: "detail"; id: string }
  | { kind: "project" };

export const LOW_ACCURACY_M = 15;

export function isFeatureType(value: string): value is FeatureType {
  return (FEATURE_TYPES as readonly string[]).includes(value);
}

export function recordTitle(record: Pick<FieldRecord, "type" | "seq">): string {
  return `${CATALOG[record.type].label} ${String(record.seq).padStart(3, "0")}`;
}

export function toSyncProject(project: Project): SyncProject {
  return {
    id: project.id,
    name: project.name,
    place: project.place,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function toSyncFeature(record: FieldRecord): SyncFeature {
  return {
    id: record.id,
    projectId: record.projectId,
    type: record.type,
    kind: record.kind,
    seq: record.seq,
    lat: record.lat,
    lng: record.lng,
    coordinates: record.coordinates,
    accuracy: record.accuracy,
    heading: record.heading,
    speed: record.speed,
    note: record.note,
    lengthM: record.lengthM,
    pointCount: record.pointCount,
    sampleCount: record.sampleCount,
    origin: record.origin,
    recordedAt: record.recordedAt,
    updatedAt: record.updatedAt,
  };
}

export function pointMarkerHtml(type: FeatureType, selected: boolean): string {
  const meta = CATALOG[type];
  const ring = selected
    ? "0 0 0 3px var(--color-accent)"
    : "0 1px 4px rgba(0,0,0,.45)";
  return `<div class="vc-pin" style="background:${meta.color};color:${meta.iconInk};box-shadow:${ring}">${glyph(type)}</div>`;
}

function glyph(type: FeatureType): string {
  const ink = CATALOG[type].iconInk;
  if (type === "ralo") {
    return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1" fill="none" stroke="${ink}" stroke-width="1.4"/><path d="M2.2 6h11.6M2.2 10h11.6M6 2.2v11.6M10 2.2v11.6" stroke="${ink}" stroke-width="1.15"/></svg>`;
  }
  if (type === "deficiente") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.4" r="2" fill="${ink}"/><path d="M4.6 9.1h8.2c.7 0 1.2.6 1.1 1.3l-.7 2.4" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><path d="M12 9.1v2.3l-1.7 2.5" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.5" cy="16.7" r="3.5" fill="none" stroke="${ink}" stroke-width="1.8"/><path d="M12.6 15.2l3.1 1.1 1.6 2.9" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return "";
}
