import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TypeIcon } from "@/components/survey/icons";
import { formatAccuracy, formatMeters, formatWhen, parseCoord, pathLength, validLatLng } from "@/lib/survey/geo";
import * as idb from "@/lib/survey/idb";
import { compressPhoto } from "@/lib/survey/photos";
import { useSurvey } from "@/lib/survey/store";
import {
  CATALOG,
  FEATURE_TYPES,
  LOW_ACCURACY_M,
  recordTitle,
  type FeatureType,
  type Origin,
  type PhotoRec,
} from "@/lib/survey/types";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/50" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[86dvh] w-full overflow-auto rounded-t-2xl bg-paper px-4 pt-3 pb-6 shadow-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl leading-none tracking-wide">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-card" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function usePhotoBlobs() {
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = photos.map((photo) => URL.createObjectURL(photo));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  async function add(file: File | undefined) {
    if (!file) return;
    if (photos.length >= 4) {
      toast("No máximo 4 fotos por registro.");
      return;
    }
    try {
      const blob = await compressPhoto(file);
      setPhotos((current) => [...current, blob].slice(0, 4));
    } catch {
      toast("Não foi possível ler esta foto. Use JPG ou PNG.");
    }
  }

  return { photos, urls, add, remove: (index: number) => setPhotos((current) => current.filter((_, i) => i !== index)) };
}

function PhotoButtons({ onFile }: { onFile: (file: File | undefined) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => camera.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-medium">
        <Camera className="size-4" /> Tirar foto
      </button>
      <button type="button" onClick={() => gallery.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-medium">
        <ImagePlus className="size-4" /> Galeria
      </button>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" className="sr-only" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
    </div>
  );
}

function ThumbRow({ urls, onRemove }: { urls: string[]; onRemove: (index: number) => void }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto">
      {urls.map((url, index) => (
        <div key={url} className="relative shrink-0">
          <img src={url} alt="" className="size-20 rounded-lg object-cover" />
          <button type="button" onClick={() => onRemove(index)} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-ink text-paper" aria-label="Remover foto">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function MarkSheet() {
  const close = useSurvey((state) => state.closeSheet);
  const fix = useSurvey((state) => state.fix);
  const mapCenter = useSurvey((state) => state.mapCenter);
  const recording = useSurvey((state) => state.recording);
  const startLine = useSurvey((state) => state.startLine);
  const commitPoint = useSurvey((state) => state.commitPoint);
  const features = useSurvey((state) => state.features);
  const projectId = useSurvey((state) => state.activeProjectId);
  const [draft, setDraft] = useState<null | {
    type: FeatureType;
    lat: number;
    lng: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
    origin: Origin;
  }>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const picker = usePhotoBlobs();

  function choose(type: FeatureType) {
    if (CATALOG[type].kind === "line") {
      startLine(type);
      return;
    }
    if (fix && validLatLng(fix.lat, fix.lng)) {
      setDraft({
        type,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        heading: fix.heading,
        speed: fix.speed,
        origin: "gps",
      });
      return;
    }
    if (mapCenter && validLatLng(mapCenter.lat, mapCenter.lng)) {
      setDraft({
        type,
        lat: mapCenter.lat,
        lng: mapCenter.lng,
        accuracy: null,
        heading: null,
        speed: null,
        origin: "manual",
      });
      toast("Sem GPS. A marca usou o centro do mapa — confira antes de salvar.");
      return;
    }
    toast("Espere o mapa ou o GPS.");
  }

  if (!draft) {
    return (
      <Sheet title="O que deseja marcar?" onClose={close}>
        <div className="flex flex-col gap-2">
          {FEATURE_TYPES.map((type) => {
            const meta = CATALOG[type];
            const blocked = meta.kind === "line" && (!fix || Boolean(recording));
            return (
              <button
                key={type}
                type="button"
                disabled={blocked}
                onClick={() => choose(type)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-card px-3 text-left"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full"
                  style={{ background: meta.color, color: meta.iconInk }}
                >
                  <TypeIcon type={type} />
                </span>
                <span className="font-display text-2xl leading-none tracking-wide">{meta.mark}</span>
              </button>
            );
          })}
        </div>
        {!fix && <p className="mt-3 text-sm text-warn">Sem GPS ainda. Linhas ficam bloqueadas. Pontos podem usar o centro do mapa.</p>}
        {recording && <p className="mt-2 text-sm text-muted">Há um trecho em gravação. Pause ou finalize antes de iniciar outro.</p>}
      </Sheet>
    );
  }

  const seq =
    features.filter((feature) => feature.projectId === projectId && feature.type === draft.type).reduce((max, feature) => Math.max(max, feature.seq), 0) + 1;
  const low = draft.origin === "gps" && (draft.accuracy == null || draft.accuracy > LOW_ACCURACY_M);

  return (
    <Sheet title={`${CATALOG[draft.type].label} ${String(seq).padStart(3, "0")}`} onClose={close}>
      <p className="text-sm text-muted tabular-nums">
        {draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}
      </p>
      <p className="mt-1 text-sm">
        {draft.origin === "gps" ? `Precisão GPS: ${formatAccuracy(draft.accuracy)}` : "Posição manual — centro do mapa"}
      </p>
      {low && <p className="mt-2 text-sm font-medium text-warn">GPS com baixa precisão. Aguarde alguns segundos antes de registrar.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!fix}
          onClick={() => {
            if (!fix) return;
            setDraft({ ...draft, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, heading: fix.heading, speed: fix.speed, origin: "gps" });
          }}
          className="min-h-12 rounded-xl border border-line bg-card text-sm font-medium"
        >
          Atualizar GPS
        </button>
        <button
          type="button"
          disabled={!mapCenter}
          onClick={() => {
            if (!mapCenter) return;
            setDraft({ ...draft, lat: mapCenter.lat, lng: mapCenter.lng, accuracy: null, heading: null, speed: null, origin: "manual" });
          }}
          className="min-h-12 rounded-xl border border-line bg-card text-sm font-medium"
        >
          Centro do mapa
        </button>
      </div>
      <label className="mt-3 block text-sm font-medium">
        Observação
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={4000}
          placeholder="Observação da obra, sem dados pessoais"
          className="mt-1 min-h-24 w-full rounded-xl border border-line bg-card px-3 py-2 text-base"
        />
      </label>
      <div className="mt-3">
        <PhotoButtons onFile={(file) => void picker.add(file)} />
        <ThumbRow urls={picker.urls} onRemove={picker.remove} />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void commitPoint({ ...draft, note, photos: picker.photos }).finally(() => setBusy(false));
        }}
        className="mt-4 h-14 w-full rounded-full bg-accent text-lg font-semibold text-accent-ink"
      >
        Salvar aqui
      </button>
    </Sheet>
  );
}

function FinishSheet() {
  const close = useSurvey((state) => state.closeSheet);
  const recording = useSurvey((state) => state.recording);
  const commitLine = useSurvey((state) => state.commitLine);
  const cancel = useSurvey((state) => state.cancelRecording);
  const resume = useSurvey((state) => state.resumeRecording);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const picker = usePhotoBlobs();
  if (!recording) return null;
  const meters = pathLength(recording.points.map((point) => [point.lng, point.lat]));
  return (
    <Sheet title={`Finalizar ${CATALOG[recording.type].recording}`} onClose={close}>
      <p className="font-display text-4xl tabular-nums">{formatMeters(meters)}</p>
      <p className="text-sm text-muted">
        {recording.points.length} pontos GPS · o traçado é simplificado ao salvar para o mapa ficar leve.
      </p>
      <label className="mt-3 block text-sm font-medium">
        Observação
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={4000}
          placeholder="Observação da obra, sem dados pessoais"
          className="mt-1 min-h-24 w-full rounded-xl border border-line bg-card px-3 py-2 text-base"
        />
      </label>
      <div className="mt-3">
        <PhotoButtons onFile={(file) => void picker.add(file)} />
        <ThumbStrip urls={picker.urls} />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void commitLine({ note, photos: picker.photos }).finally(() => setBusy(false));
        }}
        className="mt-4 h-14 w-full rounded-full bg-accent text-lg font-semibold text-accent-ink"
      >
        Salvar trecho
      </button>
      <button type="button" onClick={resume} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card font-medium">
        Continuar caminhando
      </button>
      {confirmDrop ? (
        <button type="button" onClick={() => void cancel()} className="mt-2 min-h-12 w-full rounded-xl font-medium text-bad">
          Confirmar descarte
        </button>
      ) : (
        <button type="button" onClick={() => setConfirmDrop(true)} className="mt-2 min-h-12 w-full rounded-xl font-medium text-bad">
          Descartar gravação
        </button>
      )}
    </Sheet>
  );
}

function ThumbStrip({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex gap-2">
      {urls.map((url) => (
        <img key={url} src={url} alt="" className="size-20 rounded-lg object-cover" />
      ))}
    </div>
  );
}

function DetailSheet({ id }: { id: string }) {
  const feature = useSurvey((state) => state.features.find((item) => item.id === id) ?? null);
  const close = useSurvey((state) => state.closeSheet);
  const update = useSurvey((state) => state.updateFeature);
  const remove = useSurvey((state) => state.deleteFeature);
  const removePhoto = useSurvey((state) => state.removePhoto);
  const showOnMap = useSurvey((state) => state.showOnMap);
  const [note, setNote] = useState(feature?.note ?? "");
  const [lat, setLat] = useState(feature ? String(feature.lat) : "");
  const [lng, setLng] = useState(feature ? String(feature.lng) : "");
  const [photos, setPhotos] = useState<PhotoRec[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const picker = usePhotoBlobs();

  useEffect(() => {
    if (!feature) return;
    let cancelled = false;
    void idb.photosFor(feature.id).then((rows) => {
      if (!cancelled) setPhotos(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [feature]);

  useEffect(() => {
    const next = photos.map((photo) => URL.createObjectURL(photo.blob));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  if (!feature) return null;
  const meta = CATALOG[feature.type];

  return (
    <Sheet title={recordTitle(feature)} onClose={close}>
      <p className="text-sm text-muted">
        {formatWhen(feature.recordedAt)} · {feature.origin === "gps" ? "GPS" : "manual"} · Precisão {formatAccuracy(feature.accuracy)}
      </p>
      {feature.kind === "line" ? (
        <p className="mt-2 font-display text-3xl tabular-nums">
          {feature.lengthM != null ? formatMeters(feature.lengthM) : "—"}
          <span className="ml-2 text-base text-muted">
            {feature.sampleCount} amostras · {feature.pointCount} vértices
          </span>
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">
            Latitude
            <input value={lat} onChange={(event) => setLat(event.target.value)} inputMode="decimal" className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base" />
          </label>
          <label className="text-sm font-medium">
            Longitude
            <input value={lng} onChange={(event) => setLng(event.target.value)} inputMode="decimal" className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base" />
          </label>
        </div>
      )}
      <p className="mt-2 text-sm text-muted tabular-nums">
        {feature.lat.toFixed(6)}, {feature.lng.toFixed(6)}
      </p>
      <label className="mt-3 block text-sm font-medium">
        Observação
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} className="mt-1 min-h-24 w-full rounded-xl border border-line bg-card px-3 py-2 text-base" />
      </label>
      {urls.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative shrink-0">
              <img src={urls[index]} alt="" className="size-24 rounded-lg object-cover" />
              <button type="button" onClick={() => void removePhoto(feature.id, photo.id).then(() => setPhotos((rows) => rows.filter((item) => item.id !== photo.id)))} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-ink text-paper" aria-label="Apagar foto">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <PhotoButtons onFile={(file) => void picker.add(file)} />
        <ThumbStrip urls={picker.urls} />
      </div>
      <p className="mt-2 text-xs text-muted">Fotos ficam neste aparelho. A geometria vai para o banco da equipe.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const patch: { note: string; lat?: number; lng?: number } = { note };
          if (feature.kind === "point") {
            const nextLat = parseCoord(lat);
            const nextLng = parseCoord(lng);
            if (nextLat == null || nextLng == null || !validLatLng(nextLat, nextLng)) {
              toast("Coordenada inválida.");
              return;
            }
            patch.lat = nextLat;
            patch.lng = nextLng;
          }
          setBusy(true);
          void update(feature.id, patch, picker.photos).finally(() => setBusy(false));
        }}
        className="mt-4 h-14 w-full rounded-full bg-accent text-lg font-semibold text-accent-ink"
      >
        Salvar alterações
      </button>
      <button type="button" onClick={() => showOnMap(feature.id)} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card font-medium">
        Ver no mapa
      </button>
      {confirm ? (
        <button type="button" onClick={() => void remove(feature.id)} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 font-medium text-bad">
          <Trash2 className="size-4" /> Confirmar exclusão
        </button>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 font-medium text-bad">
          <Trash2 className="size-4" /> Apagar {meta.label.toLowerCase()}
        </button>
      )}
    </Sheet>
  );
}

function ProjectSheet() {
  const close = useSurvey((state) => state.closeSheet);
  const projects = useSurvey((state) => state.projects);
  const activeId = useSurvey((state) => state.activeProjectId);
  const selectProject = useSurvey((state) => state.selectProject);
  const saveProject = useSurvey((state) => state.saveProject);
  const createProject = useSurvey((state) => state.createProject);
  const deleteProject = useSurvey((state) => state.deleteProject);
  const active = projects.find((project) => project.id === activeId) ?? null;
  const [name, setName] = useState(active?.name ?? "");
  const [place, setPlace] = useState(active?.place ?? "");
  const [freshName, setFreshName] = useState("");
  const [freshPlace, setFreshPlace] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setName(active?.name ?? "");
    setPlace(active?.place ?? "");
    setConfirm(false);
  }, [active?.id, active?.name, active?.place]);

  return (
    <Sheet title="Projeto" onClose={close}>
      <div className="mb-3 flex flex-col gap-1">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => void selectProject(project.id)}
            className={`min-h-12 rounded-xl border px-3 text-left ${project.id === activeId ? "border-ink bg-card font-medium" : "border-line bg-card"}`}
          >
            {project.name}
            <span className="block truncate text-sm font-normal text-muted">{project.place || "Sem local"}</span>
          </button>
        ))}
      </div>
      {active && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProject(active.id, name, place);
          }}
        >
          <label className="text-sm font-medium">
            Nome
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base" />
          </label>
          <label className="text-sm font-medium">
            Local
            <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Bairro, cidade" className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base" />
          </label>
          <button type="submit" className="h-12 rounded-xl bg-ink font-medium text-paper">
            Salvar projeto
          </button>
        </form>
      )}
      <form
        className="mt-4 flex flex-col gap-2 border-t border-line pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void createProject(freshName, freshPlace);
        }}
      >
        <p className="text-sm font-medium">Novo projeto</p>
        <input value={freshName} onChange={(event) => setFreshName(event.target.value)} placeholder="Nome da obra" className="h-12 rounded-xl border border-line bg-card px-3 text-base" />
        <input value={freshPlace} onChange={(event) => setFreshPlace(event.target.value)} placeholder="Local" className="h-12 rounded-xl border border-line bg-card px-3 text-base" />
        <button type="submit" className="h-12 rounded-xl border border-line bg-card font-medium">
          Criar e usar
        </button>
      </form>
      {active &&
        (confirm ? (
          <button type="button" onClick={() => void deleteProject(active.id)} className="mt-3 min-h-12 w-full font-medium text-bad">
            Confirmar apagar projeto
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="mt-3 min-h-12 w-full font-medium text-bad">
            Apagar este projeto
          </button>
        ))}
    </Sheet>
  );
}

export function SheetsHost() {
  const sheet = useSurvey((state) => state.sheet);
  if (!sheet) return null;
  if (sheet.kind === "mark") return <MarkSheet />;
  if (sheet.kind === "finish") return <FinishSheet />;
  if (sheet.kind === "detail") return <DetailSheet id={sheet.id} />;
  return <ProjectSheet />;
}
