import { roundCoord, slugify } from "@/lib/survey/geo";
import { blobToDataUrl, dataUrlToBlob } from "@/lib/survey/photos";
import {
  CATALOG,
  isFeatureType,
  recordTitle,
  type FieldRecord,
  type PhotoRec,
  type Project,
} from "@/lib/survey/types";

function download(filename: string, content: Blob): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function baseName(project: Project): string {
  return `viacampo-${slugify(project.name)}-${stamp()}`;
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function kmlColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `ff${b}${g}${r}`;
}

function featureProps(project: Project, record: FieldRecord): Record<string, string | number | null> {
  return {
    id: record.id,
    name: recordTitle(record),
    tipo: record.type,
    numero: record.seq,
    projeto: project.name,
    local: project.place,
    observacao: record.note,
    precisao_m: record.accuracy == null ? null : Math.round(record.accuracy * 10) / 10,
    comprimento_m: record.lengthM == null ? null : Math.round(record.lengthM * 10) / 10,
    amostras_gps: record.sampleCount,
    vertices: record.coordinates.length,
    origem: record.origin,
    registrado_em: record.recordedAt,
    fotos: record.photoIds.length,
  };
}

export function exportCsv(project: Project, records: FieldRecord[]): void {
  const header = [
    "id",
    "projeto",
    "tipo",
    "numero",
    "geometria",
    "lat",
    "lng",
    "comprimento_m",
    "amostras_gps",
    "precisao_m",
    "origem",
    "data_hora",
    "observacao",
    "fotos",
  ];
  const lines = records.map((record) =>
    [
      record.id,
      project.name,
      CATALOG[record.type].label,
      record.seq,
      record.kind === "line" ? "linha" : "ponto",
      roundCoord(record.lat),
      roundCoord(record.lng),
      record.lengthM == null ? "" : Math.round(record.lengthM * 10) / 10,
      record.sampleCount,
      record.accuracy == null ? "" : Math.round(record.accuracy * 10) / 10,
      record.origin,
      record.recordedAt,
      record.note,
      record.photoIds.length,
    ]
      .map((cell) => csvCell(cell))
      .join(";"),
  );
  const body = `\uFEFF${header.join(";")}\n${lines.join("\n")}\n`;
  download(
    `${baseName(project)}.csv`,
    new Blob([body], { type: "text/csv;charset=utf-8" }),
  );
}

export function exportGeoJson(project: Project, records: FieldRecord[]): void {
  const collection = {
    type: "FeatureCollection",
    name: project.name,
    features: records.map((record) => {
      const props = featureProps(project, record);
      if (record.kind === "line" && record.coordinates.length >= 2) {
        return {
          type: "Feature",
          id: record.id,
          properties: props,
          geometry: {
            type: "LineString",
            coordinates: record.coordinates.map(([lng, lat]) => [roundCoord(lng), roundCoord(lat)]),
          },
        };
      }
      return {
        type: "Feature",
        id: record.id,
        properties: props,
        geometry: {
          type: "Point",
          coordinates: [roundCoord(record.lng), roundCoord(record.lat)],
        },
      };
    }),
  };
  download(
    `${baseName(project)}.geojson`,
    new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json" }),
  );
}

export function exportKml(project: Project, records: FieldRecord[]): void {
  const styles = Object.values(CATALOG)
    .map(
      (meta) => `  <Style id="${meta.id}">
    <LineStyle><color>${kmlColor(meta.color)}</color><width>4</width></LineStyle>
    <IconStyle><color>${kmlColor(meta.color)}</color><scale>1.1</scale></IconStyle>
  </Style>`,
    )
    .join("\n");
  const placemarks = records
    .map((record) => {
      const name = xml(recordTitle(record));
      const desc = xml(
        [
          record.note,
          record.accuracy != null ? `Precisão: ±${record.accuracy.toFixed(0)} m` : "",
          record.lengthM != null ? `Comprimento: ${record.lengthM.toFixed(1)} m` : "",
          record.recordedAt,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      const geometry =
        record.kind === "line" && record.coordinates.length >= 2
          ? `<LineString><tessellate>1</tessellate><coordinates>${record.coordinates
              .map(([lng, lat]) => `${roundCoord(lng)},${roundCoord(lat)},0`)
              .join(" ")}</coordinates></LineString>`
          : `<Point><coordinates>${roundCoord(record.lng)},${roundCoord(record.lat)},0</coordinates></Point>`;
      return `  <Placemark>
    <name>${name}</name>
    <description>${desc}</description>
    <styleUrl>#${record.type}</styleUrl>
    ${geometry}
  </Placemark>`;
    })
    .join("\n");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xml(project.name)}</name>
${styles}
${placemarks}
</Document>
</kml>
`;
  download(`${baseName(project)}.kml`, new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
}

export interface PackagePhoto {
  id: string;
  featureId: string;
  createdAt: string;
  dataUrl: string;
}

export interface PackageFile {
  app: "viacampo";
  version: 1;
  exportedAt: string;
  projects: Project[];
  features: FieldRecord[];
  photos: PackagePhoto[];
}

export async function exportPackage(
  projects: Project[],
  records: FieldRecord[],
  photos: PhotoRec[],
): Promise<void> {
  const packed: PackageFile = {
    app: "viacampo",
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    features: records,
    photos: await Promise.all(
      photos.map(async (photo) => ({
        id: photo.id,
        featureId: photo.featureId,
        createdAt: photo.createdAt,
        dataUrl: await blobToDataUrl(photo.blob),
      })),
    ),
  };
  const name = projects[0] ? baseName(projects[0]) : `viacampo-${stamp()}`;
  download(
    `${name}-pacote.json`,
    new Blob([JSON.stringify(packed)], { type: "application/json" }),
  );
}

export function parsePackage(raw: unknown): PackageFile {
  if (!raw || typeof raw !== "object") throw new Error("Arquivo inválido.");
  const data = raw as Partial<PackageFile>;
  if (data.app !== "viacampo" || !Array.isArray(data.projects) || !Array.isArray(data.features)) {
    throw new Error("Este arquivo não é um pacote do ViaCampo.");
  }
  const projects = data.projects.filter(
    (project) => project && typeof project.id === "string" && typeof project.name === "string",
  );
  const features = data.features.filter((feature) => {
    return (
      feature &&
      typeof feature.id === "string" &&
      typeof feature.projectId === "string" &&
      isFeatureType(feature.type) &&
      Number.isFinite(feature.lat) &&
      Number.isFinite(feature.lng)
    );
  });
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return {
    app: "viacampo",
    version: 1,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    projects,
    features,
    photos: photos.filter((photo) => photo && typeof photo.id === "string" && typeof photo.dataUrl === "string"),
  };
}

export async function packagePhotosToRecords(photos: PackagePhoto[]): Promise<PhotoRec[]> {
  const records: PhotoRec[] = [];
  for (const photo of photos) {
    try {
      records.push({
        id: photo.id,
        featureId: photo.featureId,
        createdAt: photo.createdAt || new Date().toISOString(),
        blob: await dataUrlToBlob(photo.dataUrl),
      });
    } catch {
      // Skip a corrupt photo and keep the geometry.
    }
  }
  return records;
}
