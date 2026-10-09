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
  .validator((data: unknown) => parsePayload(data))
  .handler(async ({ data }): Promise<SyncResult> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    for (const project of data.projects) {
      await sql.query(
        `insert into projects (id, team_code, name, place, created_at, updated_at)
         select $1, $2, $3, $4, $5, $6
         where not exists (
           select 1 from deletions d
           where d.id = $1 and d.team_code = $2 and d.deleted_at >= $6::timestamptz
         )
         on conflict (id) do update set
           name = excluded.name,
           place = excluded.place,
           updated_at = excluded.updated_at
         where projects.team_code = excluded.team_code`,
        [project.id, data.teamCode, project.name, project.place, project.createdAt, project.updatedAt],
      );
    }
    for (const feature of data.features) {
      await sql.query(
        `insert into features (
           id, team_code, project_id, type, kind, seq, lat, lng, geometry,
           accuracy, heading, speed, note, length_m, point_count, sample_count,
           origin, recorded_at, updated_at
         )
         select $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
           $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19
         where not exists (
           select 1 from deletions d
           where d.id = $1 and d.team_code = $2 and d.deleted_at >= $19::timestamptz
         )
         on conflict (id) do update set
           type = excluded.type,
           kind = excluded.kind,
           seq = excluded.seq,
           lat = excluded.lat,
           lng = excluded.lng,
           geometry = excluded.geometry,
           accuracy = excluded.accuracy,
           heading = excluded.heading,
           speed = excluded.speed,
           note = excluded.note,
           length_m = excluded.length_m,
           point_count = excluded.point_count,
           sample_count = excluded.sample_count,
           origin = excluded.origin,
           updated_at = excluded.updated_at
         where features.team_code = excluded.team_code`,
        [
          feature.id,
          data.teamCode,
          feature.projectId,
          feature.type,
          feature.kind,
          feature.seq,
          feature.lat,
          feature.lng,
          JSON.stringify(feature.coordinates),
          feature.accuracy,
          feature.heading,
          feature.speed,
          feature.note,
          feature.lengthM,
          feature.pointCount,
          feature.sampleCount,
          feature.origin,
          feature.recordedAt,
          feature.updatedAt,
        ],
      );
    }
    for (const id of data.deletedFeatureIds) {
      await sql.query(`delete from features where id = $1 and team_code = $2`, [id, data.teamCode]);
      await sql.query(
        `insert into deletions (id, team_code, kind, deleted_at) values ($1, $2, 'feature', now())
         on conflict (id) do update set deleted_at = now(), team_code = excluded.team_code, kind = 'feature'`,
        [id, data.teamCode],
      );
    }
    for (const id of data.deletedProjectIds) {
      await sql.query(`delete from features where project_id = $1 and team_code = $2`, [id, data.teamCode]);
      await sql.query(`delete from projects where id = $1 and team_code = $2`, [id, data.teamCode]);
      await sql.query(
        `insert into deletions (id, team_code, kind, deleted_at) values ($1, $2, 'project', now())
         on conflict (id) do update set deleted_at = now(), team_code = excluded.team_code, kind = 'project'`,
        [id, data.teamCode],
      );
    }
    for (const project of data.projects) {
      await sql.query(
        `delete from deletions where id = $1 and team_code = $2 and deleted_at < $3::timestamptz`,
        [project.id, data.teamCode, project.updatedAt],
      );
    }
    for (const feature of data.features) {
      await sql.query(
        `delete from deletions where id = $1 and team_code = $2 and deleted_at < $3::timestamptz`,
        [feature.id, data.teamCode, feature.updatedAt],
      );
    }
    const projects = await sql.query<Record<string, unknown>>(
      `select id, name, place, created_at, updated_at from projects where team_code = $1`,
      [data.teamCode],
    );
    const features = await sql.query<Record<string, unknown>>(
      `select id, project_id, type, kind, seq, lat, lng, geometry, accuracy, heading, speed,
              note, length_m, point_count, sample_count, origin, recorded_at, updated_at
       from features where team_code = $1`,
      [data.teamCode],
    );
    const deletions = await sql.query<{ id: string; kind: string }>(
      `select id, kind from deletions where team_code = $1`,
      [data.teamCode],
    );
    return {
      projects: projects.map(rowProject),
      features: features.flatMap((row) => {
        const feature = rowFeature(row);
        return feature ? [feature] : [];
      }),
      deletedProjectIds: deletions.filter((row) => row.kind === "project").map((row) => row.id),
      deletedFeatureIds: deletions.filter((row) => row.kind === "feature").map((row) => row.id),
    };
  });
