import { toast } from "sonner";
import { create } from "zustand";
import {
  exportCsv,
  exportGeoJson,
  exportKml,
  exportPackage,
  packagePhotosToRecords,
  parsePackage,
} from "@/lib/survey/export";
import {
  formatMeters,
  makeTeamCode,
  median,
  normalizeTeamCode,
  pathLength,
  shouldAcceptSample,
  simplifyToCap,
  uid,
  validLatLng,
  type Sample,
} from "@/lib/survey/geo";
import * as idb from "@/lib/survey/idb";
import { syncBundle } from "@/lib/survey/remote";
import {
  CATALOG,
  DEFAULT_FILTERS,
  recordTitle,
  toSyncFeature,
  toSyncProject,
  type FeatureType,
  type FieldRecord,
  type Filters,
  type GpsFix,
  type LineDraft,
  type MapCenter,
  type Origin,
  type Project,
  type SheetState,
  type SyncFeature,
  type SyncProject,
  type Tombstone,
} from "@/lib/survey/types";

export interface SyncUi {
  state: "idle" | "syncing" | "offline" | "error";
  lastSyncAt: string | null;
  message: string;
}

interface SurveyState {
  ready: boolean;
  bootError: string | null;
  projects: Project[];
  features: FieldRecord[];
  tombstones: Tombstone[];
  teamCode: string;
  activeProjectId: string | null;
  filters: Filters;
  tab: "campo" | "mapa" | "lista" | "resumo";
  fix: GpsFix | null;
  gpsError: string | null;
  follow: boolean;
  locateTick: number;
  mapCenter: MapCenter | null;
  recording: LineDraft | null;
  sheet: SheetState;
  highlightId: string | null;
  focusToken: { id: string; n: number } | null;
  hintSeen: boolean;
  sync: SyncUi;
  init: () => Promise<void>;
  setTab: (tab: SurveyState["tab"]) => void;
  setGpsError: (message: string | null) => void;
  onFix: (fix: GpsFix) => void;
  setFollow: (follow: boolean) => void;
  locate: () => void;
  setMapCenter: (center: MapCenter) => void;
  toggleFilter: (type: FeatureType) => void;
  openMark: () => void;
  openProject: () => void;
  openDetail: (id: string) => void;
  showOnMap: (id: string) => void;
  closeSheet: () => void;
  dismissHint: () => void;
  startLine: (type: FeatureType) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  requestFinish: () => void;
  cancelRecording: () => Promise<void>;
  commitPoint: (input: PointInput) => Promise<void>;
  commitLine: (input: { note: string; photos: Blob[] }) => Promise<boolean>;
  updateFeature: (id: string, patch: FeaturePatch, photos: Blob[]) => Promise<void>;
  removePhoto: (featureId: string, photoId: string) => Promise<void>;
  deleteFeature: (id: string) => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  saveProject: (id: string, name: string, place: string) => Promise<void>;
  createProject: (name: string, place: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setTeamCode: (code: string) => Promise<void>;
  syncNow: (manual?: boolean) => Promise<void>;
  exportActive: (format: "csv" | "geojson" | "kml" | "package") => Promise<void>;
  importPackageFile: (raw: unknown) => Promise<void>;
}

export interface PointInput {
  type: FeatureType;
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  origin: Origin;
  note: string;
  photos: Blob[];
}

export interface FeaturePatch {
  note: string;
  lat?: number;
  lng?: number;
}

let initOnce: Promise<void> | null = null;
let syncChain: Promise<void> = Promise.resolve();

function nowIso(): string {
  return new Date().toISOString();
}

function nextSeq(features: FieldRecord[], projectId: string, type: FeatureType): number {
  const seqs = features.filter((feature) => feature.projectId === projectId && feature.type === type);
  return seqs.reduce((max, feature) => Math.max(max, feature.seq), 0) + 1;
}

async function saveDraft(draft: LineDraft | null): Promise<void> {
  await idb.setMeta("draft", draft);
}

function projectOf(state: SurveyState): Project | null {
  return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
}

export const useSurvey = create<SurveyState>((set, get) => ({
  ready: false,
  bootError: null,
  projects: [],
  features: [],
  tombstones: [],
  teamCode: "",
  activeProjectId: null,
  filters: DEFAULT_FILTERS,
  tab: "campo",
  fix: null,
  gpsError: null,
  follow: true,
  locateTick: 0,
  mapCenter: null,
  recording: null,
  sheet: null,
  highlightId: null,
  focusToken: null,
  hintSeen: false,
  sync: { state: "idle", lastSyncAt: null, message: "" },

  init: () => {
    initOnce ??= (async () => {
      try {
        const [projects, features, tombstones, storedCode, activeId, draft, filters, hintSeen] =
          await Promise.all([
            idb.allProjects(),
            idb.allFeatures(),
            idb.allTombstones(),
            idb.getMeta<string>("teamCode"),
            idb.getMeta<string>("activeProjectId"),
            idb.loadDraft(),
            idb.loadFilters(),
            idb.getMeta<boolean>("hintSeen"),
          ]);
        let teamCode = storedCode && normalizeTeamCode(storedCode) ? storedCode : "";
        if (!teamCode) {
          teamCode = makeTeamCode();
          await idb.setMeta("teamCode", teamCode);
        }
        let list = projects;
        if (!list.length) {
          const created = blankProject();
          await idb.putProject(created);
          list = [created];
        }
        let active = activeId && list.some((project) => project.id === activeId) ? activeId : list[0].id;
        await idb.setMeta("activeProjectId", active);
        const safeDraft =
          draft && CATALOG[draft.type]?.kind === "line" && Array.isArray(draft.points) ? draft : null;
        set({
          ready: true,
          projects: list,
          features,
          tombstones,
          teamCode,
          activeProjectId: active,
          filters,
          recording: safeDraft,
          hintSeen: Boolean(hintSeen),
        });
        void get().syncNow(false);
      } catch (error) {
        set({
          ready: true,
          bootError: error instanceof Error ? error.message : "Não foi possível abrir o levantamento.",
        });
      }
    })();
    return initOnce;
  },

  setTab: (tab) => set({ tab }),
  setGpsError: (gpsError) => set({ gpsError }),
  setFollow: (follow) => set({ follow }),
  locate: () => set((state) => ({ follow: true, locateTick: state.locateTick + 1 })),
  setMapCenter: (mapCenter) => set({ mapCenter }),
  closeSheet: () => set({ sheet: null }),
  openMark: () => set({ sheet: { kind: "mark" } }),
  openProject: () => set({ sheet: { kind: "project" } }),
  openDetail: (id) => set({ sheet: { kind: "detail", id }, highlightId: id }),
  showOnMap: (id) =>
    set((state) => ({
      sheet: null,
      tab: "campo",
      highlightId: id,
      focusToken: { id, n: (state.focusToken?.n ?? 0) + 1 },
    })),

  dismissHint: () => {
    set({ hintSeen: true });
    void idb.setMeta("hintSeen", true);
  },

  toggleFilter: (type) => {
    const filters = { ...get().filters, [type]: !get().filters[type] };
    set({ filters });
    void idb.setMeta("filters", filters);
  },

  onFix: (fix) => {
    set({ fix, gpsError: null });
    const recording = get().recording;
    if (!recording || recording.paused) return;
    const last = recording.points[recording.points.length - 1] ?? null;
    const sample: Sample = {
      lng: fix.lng,
      lat: fix.lat,
      accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
      t: fix.timestamp,
    };
    if (!shouldAcceptSample(last, sample)) return;
    const next = { ...recording, points: [...recording.points, sample] };
    set({ recording: next });
    void saveDraft(next);
  },

  startLine: (type) => {
    if (CATALOG[type].kind !== "line") return;
    if (get().recording) {
      toast("Finalize o trecho que já está sendo gravado.");
      return;
    }
    const fix = get().fix;
    if (!fix || !validLatLng(fix.lat, fix.lng)) {
      toast("Ainda sem GPS. Espere o sinal para iniciar o trecho.");
      return;
    }
    const recording: LineDraft = {
      type,
      paused: false,
      startedAt: nowIso(),
      points: [
        {
          lng: fix.lng,
          lat: fix.lat,
          accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
          t: fix.timestamp,
        },
      ],
    };
    set({ recording, sheet: null, follow: true });
    void saveDraft(recording);
    toast(`Gravando ${CATALOG[type].label}. Caminhe o trecho.`);
  },

  pauseRecording: () => {
    const recording = get().recording;
    if (!recording || recording.paused) return;
    const next = { ...recording, paused: true };
    set({ recording: next });
    void saveDraft(next);
  },

  resumeRecording: () => {
    const recording = get().recording;
    if (!recording || !recording.paused) return;
    const next = { ...recording, paused: false };
    set({ recording: next, sheet: null, follow: true });
    void saveDraft(next);
  },

  requestFinish: () => {
    const recording = get().recording;
    if (!recording) return;
    if (recording.points.length < 2) {
      toast("Caminhe mais um pouco para fechar o trecho.");
      return;
    }
    const next = { ...recording, paused: true };
    set({ recording: next, sheet: { kind: "finish" } });
    void saveDraft(next);
  },

  cancelRecording: async () => {
    set({ recording: null, sheet: null });
    await saveDraft(null);
    toast("Gravação descartada.");
  },

  commitPoint: async (input) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    if (!validLatLng(input.lat, input.lng)) {
      toast("Coordenada inválida.");
      return;
    }
    const stamp = nowIso();
    const record: FieldRecord = {
      id: uid(),
      projectId,
      type: input.type,
      kind: "point",
      seq: nextSeq(get().features, projectId, input.type),
      lat: input.lat,
      lng: input.lng,
      coordinates: [[input.lng, input.lat]],
      accuracy: input.accuracy,
      heading: input.heading,
      speed: input.speed,
      note: input.note.trim(),
      lengthM: null,
      pointCount: 1,
      sampleCount: 1,
      origin: input.origin,
      recordedAt: stamp,
      updatedAt: stamp,
      syncStatus: "pending",
      photoIds: [],
    };
    await attachPhotos(record, input.photos);
    await idb.putFeature(record);
    set((state) => ({ features: [...state.features, record], sheet: null, highlightId: record.id }));
    toast(`${recordTitle(record)} salvo neste aparelho.`);
    queueSync();
  },

  commitLine: async ({ note, photos }) => {
    const recording = get().recording;
    const projectId = get().activeProjectId;
    if (!recording || !projectId) return false;
    if (recording.points.length < 2) {
      toast("Caminhe mais um pouco para fechar o trecho.");
      return false;
    }
    const raw = recording.points.map((point) => [point.lng, point.lat] as [number, number]);
    const coordinates = simplifyToCap(raw, 1.5, 1500);
    const lengthM = pathLength(coordinates);
    const accuracy = median(
      recording.points.flatMap((point) => (point.accuracy == null ? [] : [point.accuracy])),
    );
    const first = coordinates[0];
    const stamp = nowIso();
    const record: FieldRecord = {
      id: uid(),
      projectId,
      type: recording.type,
      kind: "line",
      seq: nextSeq(get().features, projectId, recording.type),
      lng: first[0],
      lat: first[1],
      coordinates,
      accuracy,
      heading: null,
      speed: null,
      note: note.trim(),
      lengthM,
      pointCount: coordinates.length,
      sampleCount: recording.points.length,
      origin: "gps",
      recordedAt: recording.startedAt,
      updatedAt: stamp,
      syncStatus: "pending",
      photoIds: [],
    };
    await attachPhotos(record, photos);
    await idb.putFeature(record);
    await saveDraft(null);
    set((state) => ({
      features: [...state.features, record],
      recording: null,
      sheet: null,
      highlightId: record.id,
    }));
    toast(`${recordTitle(record)} · ${formatMeters(lengthM)} salvo neste aparelho.`);
    queueSync();
    return true;
  },

  updateFeature: async (id, patch, photos) => {
    const current = get().features.find((feature) => feature.id === id);
    if (!current) return;
    const next: FieldRecord = {
      ...current,
      note: patch.note.trim(),
      updatedAt: nowIso(),
      syncStatus: "pending",
    };
    if (current.kind === "point" && patch.lat != null && patch.lng != null && validLatLng(patch.lat, patch.lng)) {
      next.lat = patch.lat;
      next.lng = patch.lng;
      next.coordinates = [[patch.lng, patch.lat]];
      if (patch.lat !== current.lat || patch.lng !== current.lng) next.origin = "manual";
    }
    await attachPhotos(next, photos);
    await idb.putFeature(next);
    set((state) => ({
      features: state.features.map((feature) => (feature.id === id ? next : feature)),
    }));
    toast("Alterações salvas neste aparelho.");
    queueSync();
  },

  removePhoto: async (featureId, photoId) => {
    const current = get().features.find((feature) => feature.id === featureId);
    if (!current) return;
    await idb.deletePhoto(photoId);
    const next: FieldRecord = {
      ...current,
      photoIds: current.photoIds.filter((id) => id !== photoId),
      updatedAt: nowIso(),
      syncStatus: "pending",
    };
    await idb.putFeature(next);
    set((state) => ({
      features: state.features.map((feature) => (feature.id === featureId ? next : feature)),
    }));
    queueSync();
  },

  deleteFeature: async (id) => {
    const current = get().features.find((feature) => feature.id === id);
    if (!current) return;
    await idb.deletePhotosFor(id);
    await idb.deleteFeature(id);
    await idb.putTombstone({ id, kind: "feature" });
    set((state) => ({
      features: state.features.filter((feature) => feature.id !== id),
      tombstones: upsertTombstone(state.tombstones, { id, kind: "feature" }),
      sheet: state.sheet?.kind === "detail" && state.sheet.id === id ? null : state.sheet,
      highlightId: state.highlightId === id ? null : state.highlightId,
    }));
    toast(`${recordTitle(current)} apagado.`);
    queueSync();
  },

  selectProject: async (id) => {
    if (!get().projects.some((project) => project.id === id)) return;
    await idb.setMeta("activeProjectId", id);
    set({ activeProjectId: id, sheet: null });
  },

  saveProject: async (id, name, place) => {
    const current = get().projects.find((project) => project.id === id);
    if (!current) return;
    const next: Project = {
      ...current,
      name: name.trim() || current.name,
      place: place.trim(),
      updatedAt: nowIso(),
      syncStatus: "pending",
    };
    await idb.putProject(next);
    set((state) => ({
      projects: state.projects.map((project) => (project.id === id ? next : project)),
    }));
    toast("Projeto atualizado.");
    queueSync();
  },

  createProject: async (name, place) => {
    const project = blankProject();
    project.name = name.trim() || "Nova obra";
    project.place = place.trim();
    await idb.putProject(project);
    await idb.setMeta("activeProjectId", project.id);
    set((state) => ({
      projects: [...state.projects, project],
      activeProjectId: project.id,
      sheet: null,
    }));
    queueSync();
  },

  deleteProject: async (id) => {
    if (get().projects.length <= 1) {
      toast("Mantenha ao menos um projeto.");
      return;
    }
    const doomed = get().features.filter((feature) => feature.projectId === id);
    for (const feature of doomed) {
      await idb.deletePhotosFor(feature.id);
      await idb.deleteFeature(feature.id);
      await idb.putTombstone({ id: feature.id, kind: "feature" });
    }
    await idb.deleteProject(id);
    await idb.putTombstone({ id, kind: "project" });
    const projects = get().projects.filter((project) => project.id !== id);
    const active = get().activeProjectId === id ? projects[0].id : get().activeProjectId;
    await idb.setMeta("activeProjectId", active);
    set({
      projects,
      activeProjectId: active,
      features: get().features.filter((feature) => feature.projectId !== id),
      tombstones: dedupeTombstones([
        ...get().tombstones,
        ...doomed.map((feature) => ({ id: feature.id, kind: "feature" as const })),
        { id, kind: "project" as const },
      ]),
      sheet: null,
    });
    queueSync();
  },

  setTeamCode: async (code) => {
    const clean = normalizeTeamCode(code);
    if (!clean) {
      toast("O código da equipe tem 8 caracteres.");
      return;
    }
    if (clean === get().teamCode) return;
    const stamp = nowIso();
    const projects = get().projects.map((project) => ({
      ...project,
      syncStatus: "pending" as const,
      updatedAt: stamp,
    }));
    const features = get().features.map((feature) => ({
      ...feature,
      syncStatus: "pending" as const,
      updatedAt: stamp,
    }));
    await idb.setMeta("teamCode", clean);
    for (const project of projects) await idb.putProject(project);
    for (const feature of features) await idb.putFeature(feature);
    set({ teamCode: clean, projects, features });
    toast("Equipe alterada. Sincronizando quando houver rede.");
    void get().syncNow(true);
  },

  syncNow: (manual = false) => {
    syncChain = syncChain.then(() => runSync(manual)).catch(() => undefined);
    return syncChain;
  },

  exportActive: async (format) => {
    const project = projectOf(get());
    if (!project) return;
    const records = get().features.filter((feature) => feature.projectId === project.id);
    if (format === "csv") exportCsv(project, records);
    else if (format === "geojson") exportGeoJson(project, records);
    else if (format === "kml") exportKml(project, records);
    else {
      const photos = (await Promise.all(records.map((record) => idb.photosFor(record.id)))).flat();
      await exportPackage([project], records, photos);
    }
    toast("Arquivo gerado.");
  },

  importPackageFile: async (raw) => {
    const packed = parsePackage(raw);
    const photos = await packagePhotosToRecords(packed.photos);
    const stamp = nowIso();
    for (const project of packed.projects) {
      const next: Project = {
        ...project,
        place: project.place ?? "",
        createdAt: project.createdAt || stamp,
        updatedAt: stamp,
        syncStatus: "pending",
      };
      await idb.putProject(next);
    }
    for (const feature of packed.features) {
      const next: FieldRecord = {
        ...feature,
        coordinates:
          feature.coordinates?.length ? feature.coordinates : [[feature.lng, feature.lat]],
        note: feature.note ?? "",
        photoIds: feature.photoIds ?? photos.filter((photo) => photo.featureId === feature.id).map((p) => p.id),
        updatedAt: stamp,
        syncStatus: "pending",
        lengthM: feature.lengthM ?? null,
        accuracy: feature.accuracy ?? null,
        heading: feature.heading ?? null,
        speed: feature.speed ?? null,
        pointCount: feature.pointCount || feature.coordinates?.length || 1,
        sampleCount: feature.sampleCount || feature.pointCount || 1,
      };
      await idb.putFeature(next);
    }
    for (const photo of photos) await idb.putPhoto(photo);
    const [projects, features] = await Promise.all([idb.allProjects(), idb.allFeatures()]);
    const active = get().activeProjectId;
    set({
      projects,
      features,
      activeProjectId: active && projects.some((project) => project.id === active) ? active : projects[0]?.id ?? null,
    });
    toast("Pacote importado neste aparelho.");
    queueSync();
  },
}));

function blankProject(): Project {
  const stamp = nowIso();
  return {
    id: uid(),
    name: "Obra atual",
    place: "",
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: "pending",
  };
}

async function attachPhotos(record: FieldRecord, blobs: Blob[]): Promise<void> {
  const room = Math.max(0, 4 - record.photoIds.length);
  for (const blob of blobs.slice(0, room)) {
    const photo = { id: uid(), featureId: record.id, createdAt: nowIso(), blob };
    await idb.putPhoto(photo);
    record.photoIds = [...record.photoIds, photo.id];
  }
}

function upsertTombstone(list: Tombstone[], tombstone: Tombstone): Tombstone[] {
  return dedupeTombstones([...list, tombstone]);
}

function dedupeTombstones(list: Tombstone[]): Tombstone[] {
  const map = new Map<string, Tombstone>();
  for (const item of list) map.set(item.id, item);
  return [...map.values()];
}

let refillBudget = 2;

function queueSync(): void {
  queueMicrotask(() => {
    void useSurvey.getState().syncNow(false);
  });
}

async function runSync(manual: boolean): Promise<void> {
  const state = useSurvey.getState();
  if (!state.ready || !state.teamCode) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    useSurvey.setState({
      sync: { state: "offline", lastSyncAt: state.sync.lastSyncAt, message: "Sem rede · salvo neste aparelho" },
    });
    if (manual) toast("Sem rede. O levantamento continua salvo neste aparelho.");
    return;
  }
  useSurvey.setState({ sync: { ...state.sync, state: "syncing", message: "Enviando…" } });
  const snapshotProjects = new Map(state.projects.filter((p) => p.syncStatus === "pending").map((p) => [p.id, p.updatedAt]));
  const snapshotFeatures = new Map(state.features.filter((f) => f.syncStatus === "pending").map((f) => [f.id, f.updatedAt]));
  const tombstones = state.tombstones;
  try {
    const remote = await syncBundle({
      data: {
        teamCode: state.teamCode,
        projects: state.projects.map(toSyncProject),
        features: state.features.filter((feature) => feature.syncStatus === "pending").map(toSyncFeature),
        deletedProjectIds: tombstones.filter((item) => item.kind === "project").map((item) => item.id),
        deletedFeatureIds: tombstones.filter((item) => item.kind === "feature").map((item) => item.id),
      },
    });
    const latest = useSurvey.getState();
    const blocked = new Set(latest.tombstones.map((item) => item.id));
    const deletedProjects = new Set(remote.deletedProjectIds);
    const deletedFeatures = new Set(remote.deletedFeatureIds);
    const projectMerge = mergeProjects(latest.projects, remote.projects, snapshotProjects, blocked, deletedProjects);
    const featureMerge = mergeFeatures(latest.features, remote.features, snapshotFeatures, blocked, deletedFeatures);
    const sentTomb = new Set(tombstones.map((item) => item.id));
    const remainTomb = latest.tombstones.filter((item) => !sentTomb.has(item.id));
    const projects = projectMerge.rows;
    const features = featureMerge.rows;
    const flipped = projectMerge.repush + featureMerge.repush;
    const removedFeatures = latest.features.filter((feature) => !features.some((item) => item.id === feature.id));
    for (const feature of removedFeatures) {
      await idb.deleteFeature(feature.id);
      await idb.deletePhotosFor(feature.id);
    }
    for (const project of latest.projects) {
      if (!projects.some((item) => item.id === project.id)) await idb.deleteProject(project.id);
    }
    for (const project of projects) await idb.putProject(project);
    for (const feature of features) await idb.putFeature(feature);
    for (const tomb of tombstones) {
      if (!remainTomb.some((item) => item.id === tomb.id)) await idb.deleteTombstone(tomb.id);
    }
    let active = latest.activeProjectId;
    if (!active || !projects.some((project) => project.id === active)) {
      if (!projects.length) {
        const created = blankProject();
        await idb.putProject(created);
        projects.push(created);
      }
      active = projects[0].id;
      await idb.setMeta("activeProjectId", active);
    }
    useSurvey.setState({
      projects,
      features,
      tombstones: remainTomb,
      activeProjectId: active,
      sync: {
        state: "idle",
        lastSyncAt: new Date().toISOString(),
        message: remainTomb.length ? "Enviado · ainda há exclusões" : "Sincronizado",
      },
    });
    if (manual) toast("Levantamento sincronizado.");
    if (flipped > 0 && refillBudget > 0) {
      refillBudget -= 1;
      queueSync();
    } else {
      refillBudget = 2;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sem conexão com o banco.";
    useSurvey.setState({
      sync: {
        state: "error",
        lastSyncAt: useSurvey.getState().sync.lastSyncAt,
        message: "Salvo neste aparelho · banco indisponível",
      },
    });
    if (manual) toast(message || "Não foi possível sincronizar. Os dados seguem neste aparelho.");
  }
}

function mergeProjects(
  local: Project[],
  remote: SyncProject[],
  sent: Map<string, string>,
  blocked: Set<string>,
  deleted: Set<string>,
): { rows: Project[]; repush: number } {
  const map = new Map(local.map((project) => [project.id, project]));
  const remoteIds = new Set<string>();
  for (const row of remote) {
    remoteIds.add(row.id);
    if (blocked.has(row.id) || deleted.has(row.id)) continue;
    const current = map.get(row.id);
    if (current?.syncStatus === "pending") {
      const pushedAt = sent.get(current.id);
      if (!pushedAt || current.updatedAt !== pushedAt) continue;
    }
    map.set(row.id, { ...row, syncStatus: "synced" });
  }
  let repush = 0;
  for (const [id, project] of map) {
    if (deleted.has(id) && project.syncStatus !== "pending") {
      map.delete(id);
      continue;
    }
    if (!remoteIds.has(id) && project.syncStatus === "synced" && !deleted.has(id)) {
      map.set(id, { ...project, syncStatus: "pending" });
      repush += 1;
    }
  }
  return { rows: [...map.values()], repush };
}

function mergeFeatures(
  local: FieldRecord[],
  remote: SyncFeature[],
  sent: Map<string, string>,
  blocked: Set<string>,
  deleted: Set<string>,
): { rows: FieldRecord[]; repush: number } {
  const map = new Map(local.map((feature) => [feature.id, feature]));
  const remoteIds = new Set<string>();
  for (const row of remote) {
    remoteIds.add(row.id);
    if (blocked.has(row.id) || deleted.has(row.id)) continue;
    const current = map.get(row.id);
    if (current?.syncStatus === "pending") {
      const pushedAt = sent.get(current.id);
      if (!pushedAt || current.updatedAt !== pushedAt) continue;
    }
    map.set(row.id, {
      ...row,
      syncStatus: "synced",
      photoIds: current?.photoIds ?? [],
    });
  }
  let repush = 0;
  for (const [id, feature] of map) {
    if (deleted.has(id) && feature.syncStatus !== "pending") {
      map.delete(id);
      continue;
    }
    if (!remoteIds.has(id) && feature.syncStatus === "synced" && !deleted.has(id)) {
      map.set(id, { ...feature, syncStatus: "pending" });
      repush += 1;
    }
  }
  return { rows: [...map.values()], repush };
}

export function pendingCount(state: Pick<SurveyState, "projects" | "features" | "tombstones">): number {
  return (
    state.projects.filter((project) => project.syncStatus === "pending").length +
    state.features.filter((feature) => feature.syncStatus === "pending").length +
    state.tombstones.length
  );
}
