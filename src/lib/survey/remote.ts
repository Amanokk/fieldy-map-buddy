import { createServerFn } from "@tanstack/react-start";
import {
  isFeatureType,
  type FeatureType,
  type Origin,
  type SyncFeature,
  type SyncPayload,
  type SyncProject,
  type SyncResult,
} from "@/lib/survey/types";

function asText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .slice(0, max);
}

function asIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function asNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function asCoords(value: unknown): [number, number][] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const coords: [number, number][] = [];
  for (const pair of raw.slice(0, 2000)) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat]);
  }
  return coords;
}

function asIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 80)
    .slice(0, max);
}

function parsePayload(data: unknown): SyncPayload {
  if (!data || typeof data !== "object") throw new Error("Dados inválidos.");
  const body = data as Partial<SyncPayload>;
  const teamCode = asText(body.teamCode, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{8}$/.test(teamCode)) throw new Error("Código da equipe inválido.");
  const projects = (Array.isArray(body.projects) ? body.projects : []).slice(0, 80).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as SyncProject;
    if (typeof row.id !== "string" || !row.id) return [];
    return [
      {
        id: asText(row.id, 80),
        name: asText(row.name, 120) || "Obra",
        place: asText(row.place, 160),
        createdAt: asIso(row.createdAt),
        updatedAt: asIso(row.updatedAt),
      },
    ];
  });
  const features = (Array.isArray(body.features) ? body.features : []).slice(0, 400).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as SyncFeature;
    if (typeof row.id !== "string" || typeof row.projectId !== "string") return [];
    if (!isFeatureType(String(row.type))) return [];
    const lat = asNum(row.lat);
    const lng = asNum(row.lng);
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const kind = row.kind === "line" ? "line" : "point";
    const origin: Origin = row.origin === "manual" ? "manual" : "gps";
    let coordinates = asCoords(row.coordinates);
    if (!coordinates.length) coordinates = [[lng, lat]];
    return [
      {
        id: asText(row.id, 80),
        projectId: asText(row.projectId, 80),
        type: row.type as FeatureType,
        kind,
        seq: Math.max(1, Math.round(asNum(row.seq) ?? 1)),
        lat,
        lng,
        coordinates,
        accuracy: asNum(row.accuracy),
        heading: asNum(row.heading),
        speed: asNum(row.speed),
        note: asText(row.note, 4000),
        lengthM: asNum(row.lengthM),
        pointCount: Math.max(1, Math.round(asNum(row.pointCount) ?? coordinates.length)),
        sampleCount: Math.max(1, Math.round(asNum(row.sampleCount) ?? coordinates.length)),
        origin,
        recordedAt: asIso(row.recordedAt),
        updatedAt: asIso(row.updatedAt),
      } satisfies SyncFeature,
    ];
  });
  return {
    teamCode,
    projects,
    features,
    deletedProjectIds: asIds(body.deletedProjectIds, 200),
    deletedFeatureIds: asIds(body.deletedFeatureIds, 800),
  };
}

function rowProject(row: Record<string, unknown>): SyncProject {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    place: String(row.place ?? ""),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function rowFeature(row: Record<string, unknown>): SyncFeature | null {
  const type = String(row.type ?? "");
  if (!isFeatureType(type)) return null;
  const lat = asNum(row.lat);
  const lng = asNum(row.lng);
  if (lat == null || lng == null) return null;
  const coordinates = asCoords(row.geometry);
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    type,
    kind: row.kind === "line" ? "line" : "point",
    seq: Math.round(asNum(row.seq) ?? 1),
    lat,
    lng,
    coordinates: coordinates.length ? coordinates : [[lng, lat]],
    accuracy: asNum(row.accuracy),
    heading: asNum(row.heading),
    speed: asNum(row.speed),
    note: String(row.note ?? ""),
    lengthM: asNum(row.length_m),
    pointCount: Math.round(asNum(row.point_count) ?? 1),
    sampleCount: Math.round(asNum(row.sample_count) ?? 1),
    origin: row.origin === "manual" ? "manual" : "gps",
    recordedAt: asIso(row.recorded_at),
    updatedAt: asIso(row.updated_at),
  };
}

export const syncBundle = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parsePayload(data))
  .handler(async ({ data }): Promise<SyncResult> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const team = data.teamCode;
    const fail = (e: { message: string } | null) => {
      if (e) throw new Error(e.message);
    };

    const { data: delRows, error: dErr } = await db.from("deletions").select("id, kind, deleted_at").eq("team_code", team);
    fail(dErr);
    const deletedAt = new Map((delRows ?? []).map((r) => [r.id, new Date(r.deleted_at).getTime()]));
    const alive = (id: string, updatedAt: string) => {
      const d = deletedAt.get(id);
      return d == null || new Date(updatedAt).getTime() > d;
    };

    // Never touch rows owned by another team.
    const ids = [...data.projects.map((p) => p.id), ...data.features.map((f) => f.id)];
    const foreign = new Set<string>();
    if (ids.length) {
      const [p, f] = await Promise.all([
        db.from("projects").select("id, team_code").in("id", data.projects.map((x) => x.id).concat("__")),
        db.from("features").select("id, team_code").in("id", data.features.map((x) => x.id).concat("__")),
      ]);
      fail(p.error);
      fail(f.error);
      for (const r of [...(p.data ?? []), ...(f.data ?? [])]) if (r.team_code !== team) foreign.add(r.id);
    }

    const projects = data.projects.filter((p) => !foreign.has(p.id) && alive(p.id, p.updatedAt));
    if (projects.length) {
      const { error } = await db.from("projects").upsert(
        projects.map((p) => ({ id: p.id, team_code: team, name: p.name, place: p.place, created_at: p.createdAt, updated_at: p.updatedAt })),
      );
      fail(error);
    }
    const features = data.features.filter((f) => !foreign.has(f.id) && alive(f.id, f.updatedAt) && !data.deletedProjectIds.includes(f.projectId));
    if (features.length) {
      const { error } = await db.from("features").upsert(
        features.map((f) => ({
          id: f.id, team_code: team, project_id: f.projectId, type: f.type, kind: f.kind, seq: f.seq,
          lat: f.lat, lng: f.lng, geometry: f.coordinates, accuracy: f.accuracy, heading: f.heading, speed: f.speed,
          note: f.note, length_m: f.lengthM, point_count: f.pointCount, sample_count: f.sampleCount,
          origin: f.origin, recorded_at: f.recordedAt, updated_at: f.updatedAt,
        })),
      );
      fail(error);
    }
    const now = new Date().toISOString();
    if (data.deletedFeatureIds.length) {
      fail((await db.from("features").delete().eq("team_code", team).in("id", data.deletedFeatureIds)).error);
      fail((await db.from("deletions").upsert(data.deletedFeatureIds.map((id) => ({ id, team_code: team, kind: "feature", deleted_at: now })))).error);
    }
    if (data.deletedProjectIds.length) {
      fail((await db.from("features").delete().eq("team_code", team).in("project_id", data.deletedProjectIds)).error);
      fail((await db.from("projects").delete().eq("team_code", team).in("id", data.deletedProjectIds)).error);
      fail((await db.from("deletions").upsert(data.deletedProjectIds.map((id) => ({ id, team_code: team, kind: "project", deleted_at: now })))).error);
    }

    const [pr, fr, dr] = await Promise.all([
      db.from("projects").select("*").eq("team_code", team),
      db.from("features").select("*").eq("team_code", team),
      db.from("deletions").select("id, kind").eq("team_code", team),
    ]);
    fail(pr.error);
    fail(fr.error);
    fail(dr.error);
    return {
      projects: (pr.data ?? []).map((r) => rowProject(r as Record<string, unknown>)),
      features: (fr.data ?? []).flatMap((r) => {
        const f = rowFeature(r as Record<string, unknown>);
        return f ? [f] : [];
      }),
      deletedProjectIds: (dr.data ?? []).filter((r) => r.kind === "project").map((r) => r.id),
      deletedFeatureIds: (dr.data ?? []).filter((r) => r.kind === "feature").map((r) => r.id),
    };
  });
