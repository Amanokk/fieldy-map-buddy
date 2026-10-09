import type { FieldRecord, Filters, LineDraft, PhotoRec, Project, Tombstone } from "@/lib/survey/types";
import { DEFAULT_FILTERS } from "@/lib/survey/types";

const DB_NAME = "viacampo";
const DB_VERSION = 1;

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao gravar no aparelho."));
  });
}

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Este navegador não permite salvar no aparelho."));
  }
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("features")) {
        const store = db.createObjectStore("features", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
      }
      if (!db.objectStoreNames.contains("photos")) {
        const store = db.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("featureId", "featureId");
      }
      if (!db.objectStoreNames.contains("tombstones")) {
        db.createObjectStore("tombstones", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("Não foi possível abrir o armazenamento."));
    };
  });
  return opening;
}

export async function allProjects(): Promise<Project[]> {
  const db = await openDb();
  return (await req(db.transaction("projects").objectStore("projects").getAll())) as Project[];
}

export async function putProject(project: Project): Promise<void> {
  const db = await openDb();
  await req(db.transaction("projects", "readwrite").objectStore("projects").put(project));
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  await req(db.transaction("projects", "readwrite").objectStore("projects").delete(id));
}

export async function allFeatures(): Promise<FieldRecord[]> {
  const db = await openDb();
  return (await req(db.transaction("features").objectStore("features").getAll())) as FieldRecord[];
}

export async function putFeature(feature: FieldRecord): Promise<void> {
  const db = await openDb();
  await req(db.transaction("features", "readwrite").objectStore("features").put(feature));
}

export async function deleteFeature(id: string): Promise<void> {
  const db = await openDb();
  await req(db.transaction("features", "readwrite").objectStore("features").delete(id));
}

export async function putPhoto(photo: PhotoRec): Promise<void> {
  const db = await openDb();
  await req(db.transaction("photos", "readwrite").objectStore("photos").put(photo));
}

export async function photosFor(featureId: string): Promise<PhotoRec[]> {
  const db = await openDb();
  const index = db.transaction("photos").objectStore("photos").index("featureId");
  return (await req(index.getAll(featureId))) as PhotoRec[];
}

export async function allPhotos(): Promise<PhotoRec[]> {
  const db = await openDb();
  return (await req(db.transaction("photos").objectStore("photos").getAll())) as PhotoRec[];
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDb();
  await req(db.transaction("photos", "readwrite").objectStore("photos").delete(id));
}

export async function deletePhotosFor(featureId: string): Promise<void> {
  const photos = await photosFor(featureId);
  await Promise.all(photos.map((photo) => deletePhoto(photo.id)));
}

export async function allTombstones(): Promise<Tombstone[]> {
  const db = await openDb();
  return (await req(db.transaction("tombstones").objectStore("tombstones").getAll())) as Tombstone[];
}

export async function putTombstone(tombstone: Tombstone): Promise<void> {
  const db = await openDb();
  await req(db.transaction("tombstones", "readwrite").objectStore("tombstones").put(tombstone));
}

export async function deleteTombstone(id: string): Promise<void> {
  const db = await openDb();
  await req(db.transaction("tombstones", "readwrite").objectStore("tombstones").delete(id));
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await req(db.transaction("meta").objectStore("meta").get(key));
  return (value ?? null) as T | null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const store = db.transaction("meta", "readwrite").objectStore("meta");
  if (value == null) await req(store.delete(key));
  else await req(store.put(value, key));
}

export async function loadFilters(): Promise<Filters> {
  const saved = await getMeta<Partial<Filters>>("filters");
  return { ...DEFAULT_FILTERS, ...saved };
}

export async function loadDraft(): Promise<LineDraft | null> {
  return getMeta<LineDraft>("draft");
}
