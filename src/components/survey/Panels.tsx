import { useEffect, useMemo, useState } from "react";
import {
  ChartColumn,
  CloudOff,
  CloudUpload,
  Crosshair as CrosshairIcon,
  List,
  LocateFixed,
  Map,
  Pause,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { TypeIcon } from "@/components/survey/icons";
import { formatAccuracy, formatAge, formatMeters, formatTeamCode, pathLength } from "@/lib/survey/geo";
import { pendingCount, useSurvey } from "@/lib/survey/store";
import { CATALOG, FEATURE_TYPES, LOW_ACCURACY_M, recordTitle } from "@/lib/survey/types";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function TopBar() {
  const project = useSurvey((state) => state.projects.find((item) => item.id === state.activeProjectId) ?? null);
  const fix = useSurvey((state) => state.fix);
  const sync = useSurvey((state) => state.sync);
  const pending = useSurvey(pendingCount);
  const openProject = useSurvey((state) => state.openProject);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const accuracy = fix ? formatAccuracy(fix.accuracy) : "—";
  const age = fix ? formatAge(fix.timestamp, now) : "sem sinal";
  const live = Boolean(fix && now - fix.timestamp < 8000);
  let syncLabel = sync.message || "Salvo neste aparelho";
  if (pending > 0 && sync.state !== "syncing") {
    syncLabel = `${pending} por enviar`;
  } else if (sync.state === "syncing") {
    syncLabel = "Enviando…";
  } else if (sync.state === "idle" && sync.lastSyncAt) {
    syncLabel = "Sincronizado";
  }

  return (
    <header className="z-20 shrink-0 bg-ink text-paper">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CrosshairIcon className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <p className="font-display text-2xl leading-none tracking-wide">VIACAMPO</p>
          </div>
          <button
            type="button"
            onClick={openProject}
            className="mt-1 block max-w-full truncate text-left text-sm text-fog"
          >
            {project ? project.name : "Projeto"}
            {project?.place ? ` · ${project.place}` : ""}
          </button>
        </div>
        <div className="max-w-[46%] text-right">
          <p className="flex items-center justify-end gap-1 text-xs tabular-nums" aria-live="polite">
            <span className={cx("size-2 rounded-full", live ? "vc-live bg-good" : "bg-warn")} />
            Precisão GPS: {accuracy}
          </p>
          <p className="text-xs text-fog">{age}</p>
          <p className={cx("text-xs", pending > 0 || sync.state === "error" ? "text-accent" : "text-fog")}>
            {syncLabel}
          </p>
        </div>
      </div>
    </header>
  );
}

export function GpsBanner() {
  const fix = useSurvey((state) => state.fix);
  const gpsError = useSurvey((state) => state.gpsError);
  if (fix && fix.accuracy > LOW_ACCURACY_M) {
    return (
      <p className="shrink-0 bg-accent px-3 py-2 text-center text-sm font-medium text-accent-ink">
        GPS com baixa precisão. Aguarde alguns segundos antes de registrar.
      </p>
    );
  }
  if (!fix) {
    return (
      <p className="shrink-0 bg-panel px-3 py-2 text-center text-sm text-paper">
        {gpsError ?? "Buscando o GPS do aparelho…"}
      </p>
    );
  }
  return null;
}

export function LegendOverlay() {
  return (
    <div className="pointer-events-none absolute top-2 right-14 left-2 z-10 flex flex-wrap gap-1">
      {FEATURE_TYPES.map((type) => (
        <span
          key={type}
          className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-xs font-medium text-ink shadow-sm"
        >
          <span
            className="size-2.5 rounded-full ring-1 ring-line"
            style={{ background: CATALOG[type].color }}
          />
          {CATALOG[type].label}
        </span>
      ))}
    </div>
  );
}

export function FilterOverlay() {
  const filters = useSurvey((state) => state.filters);
  const toggle = useSurvey((state) => state.toggleFilter);
  return (
    <div className="absolute top-2 right-14 left-2 z-10 max-h-40 overflow-auto rounded-xl bg-card p-2 shadow-md">
      <p className="px-1 pb-1 text-xs font-medium tracking-wide text-muted uppercase">Mapa</p>
      <div className="grid grid-cols-2 gap-1">
        {FEATURE_TYPES.map((type) => (
          <label key={type} className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={filters[type]}
              onChange={() => toggle(type)}
            />
            <span className="size-2.5 rounded-full" style={{ background: CATALOG[type].color }} />
            {CATALOG[type].label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function LocateButton() {
  const locate = useSurvey((state) => state.locate);
  return (
    <button
      type="button"
      onClick={locate}
      className="absolute right-3 bottom-3 z-10 grid size-12 place-items-center rounded-full bg-card text-ink shadow-md"
      aria-label="Centralizar na minha localização"
    >
      <LocateFixed className="size-6" />
    </button>
  );
}

export function Crosshair() {
  const open = useSurvey((state) => state.sheet?.kind === "mark");
  if (!open) return null;
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <svg className="vc-crosshair" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <path className="halo" d="M14 3v22M3 14h22" />
        <path className="ink" d="M14 5v18M5 14h18" />
      </svg>
    </div>
  );
}

export function Hint() {
  const seen = useSurvey((state) => state.hintSeen);
  const dismiss = useSurvey((state) => state.dismissHint);
  const tab = useSurvey((state) => state.tab);
  if (seen || tab !== "campo") return null;
  return (
    <div className="absolute right-16 bottom-16 left-3 z-10 rounded-xl bg-ink p-3 text-sm text-paper shadow-md">
      <p>
        Caminhe até o elemento e toque em Marcar. A posição vem do GPS deste aparelho — nada é colocado no mapa por conta própria.
      </p>
      <button type="button" onClick={dismiss} className="mt-2 min-h-11 font-medium text-accent">
        Entendi
      </button>
    </div>
  );
}

export function RecordBar() {
  const recording = useSurvey((state) => state.recording);
  const fix = useSurvey((state) => state.fix);
  const pause = useSurvey((state) => state.pauseRecording);
  const resume = useSurvey((state) => state.resumeRecording);
  const finish = useSurvey((state) => state.requestFinish);
  if (!recording) return null;
  const meters = pathLength(recording.points.map((point) => [point.lng, point.lat]));
  const meta = CATALOG[recording.type];
  return (
    <div className="shrink-0 border-t border-line bg-ink px-3 py-3 text-paper">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-xl leading-none tracking-wide">
              {recording.paused ? "PAUSADO" : "GRAVANDO"} {meta.recording}
            </p>
            <p className="mt-1 text-sm text-fog tabular-nums">
              Distância: {formatMeters(meters)} · Pontos GPS: {recording.points.length} · Precisão:{" "}
              {formatAccuracy(fix?.accuracy ?? null)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {recording.paused ? (
            <button type="button" onClick={resume} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-card font-medium text-ink">
              <Play className="size-4" /> Continuar
            </button>
          ) : (
            <button type="button" onClick={pause} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-card font-medium text-ink">
              <Pause className="size-4" /> Pausar
            </button>
          )}
          <button type="button" onClick={finish} className="min-h-12 rounded-xl bg-accent font-semibold text-accent-ink">
            Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Nearby() {
  const fix = useSurvey((state) => state.fix);
  const projectId = useSurvey((state) => state.activeProjectId);
  const features = useSurvey((state) => state.features);
  const openDetail = useSurvey((state) => state.openDetail);
  if (!fix || !projectId) return null;
  const near = features
    .filter((feature) => feature.projectId === projectId)
    .map((feature) => ({
      feature,
      distance: pathLength([
        [fix.lng, fix.lat],
        [feature.lng, feature.lat],
      ]),
    }))
    .filter((item) => item.distance < 80)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
  if (!near.length) return null;
  return (
    <div className="shrink-0 border-t border-line bg-paper">
      <div className="mx-auto flex w-full max-w-lg gap-2 overflow-x-auto px-3 py-2">
        {near.map(({ feature, distance }) => (
          <button
            key={feature.id}
            type="button"
            onClick={() => openDetail(feature.id)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 text-sm"
          >
            <span className="size-2.5 rounded-full" style={{ background: CATALOG[feature.type].color }} />
            {recordTitle(feature)}
            <span className="text-muted tabular-nums">{formatMeters(distance)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Dock() {
  const tab = useSurvey((state) => state.tab);
  const setTab = useSurvey((state) => state.setTab);
  const openMark = useSurvey((state) => state.openMark);
  const count = useSurvey((state) => state.features.filter((feature) => feature.projectId === state.activeProjectId).length);
  const items = [
    { id: "campo" as const, label: "Campo", icon: CrosshairIcon },
    { id: "mapa" as const, label: "Mapa", icon: Map },
    { id: "lista" as const, label: "Lista", icon: List },
    { id: "resumo" as const, label: "Resumo", icon: ChartColumn },
  ];
  return (
    <nav className="safe-bottom shrink-0 border-t border-line bg-card">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-2 px-3 pt-2">
        {(tab === "campo" || tab === "mapa") && (
          <button
            type="button"
            onClick={openMark}
            className="h-14 rounded-full bg-accent text-lg font-semibold tracking-wide text-accent-ink"
          >
            + MARCAR
          </button>
        )}
        <div className="grid grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cx(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <Icon className="size-5" />
                {item.label}
                {item.id === "lista" ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function RecordList() {
  const projectId = useSurvey((state) => state.activeProjectId);
  const features = useSurvey((state) => state.features);
  const openDetail = useSurvey((state) => state.openDetail);
  const groups = useMemo(() => {
    const mine = features.filter((feature) => feature.projectId === projectId);
    return FEATURE_TYPES.map((type) => ({
      type,
      items: mine.filter((feature) => feature.type === type).sort((a, b) => a.seq - b.seq),
    })).filter((group) => group.items.length > 0);
  }, [features, projectId]);

  if (!groups.length) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-display text-2xl">Nenhum registro</p>
        <p className="mt-2 text-sm text-muted">
          No modo Campo, toque em Marcar no lugar onde você está.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-3">
      {groups.map((group) => (
        <section key={group.type} className="mb-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
            <span className="size-2.5 rounded-full" style={{ background: CATALOG[group.type].color }} />
            {CATALOG[group.type].plural}
          </h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-card">
            {group.items.map((feature) => (
              <li key={feature.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => openDetail(feature.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-3 text-left"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full"
                    style={{ background: CATALOG[feature.type].color, color: CATALOG[feature.type].iconInk }}
                  >
                    <TypeIcon type={feature.type} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{recordTitle(feature)}</span>
                    <span className="block truncate text-sm text-muted">
                      {feature.kind === "line" && feature.lengthM != null
                        ? formatMeters(feature.lengthM)
                        : `${feature.lat.toFixed(5)}, ${feature.lng.toFixed(5)}`}
                      {feature.photoIds.length ? " · foto" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Dashboard() {
  const project = useSurvey((state) => state.projects.find((item) => item.id === state.activeProjectId) ?? null);
  const features = useSurvey((state) => state.features);
  const teamCode = useSurvey((state) => state.teamCode);
  const syncNow = useSurvey((state) => state.syncNow);
  const sync = useSurvey((state) => state.sync);
  const exportActive = useSurvey((state) => state.exportActive);
  const setTeamCode = useSurvey((state) => state.setTeamCode);
  const importPackageFile = useSurvey((state) => state.importPackageFile);
  const [codeDraft, setCodeDraft] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);

  const mine = features.filter((feature) => feature.projectId === project?.id);
  const count = (type: (typeof FEATURE_TYPES)[number]) => mine.filter((feature) => feature.type === type).length;
  const length = (type: (typeof FEATURE_TYPES)[number]) =>
    mine.filter((feature) => feature.type === type).reduce((sum, feature) => sum + (feature.lengthM ?? 0), 0);

  const rows = [
    { label: "Caixas-ralo", value: String(count("ralo")) },
    { label: "Deficiente", value: String(count("deficiente")) },
    { label: "Calçada", value: formatMeters(length("calcada")) },
    { label: "Piso tátil", value: formatMeters(length("tatil")) },
    { label: "Meio-fio", value: formatMeters(length("meiofio")) },
    { label: "Asfalto", value: formatMeters(length("asfalto")) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-4">
      <div>
        <h2 className="font-display text-3xl leading-none tracking-wide">{project?.name ?? "Projeto"}</h2>
        <p className="mt-1 text-sm text-muted">{project?.place || "Local ainda não informado"}</p>
      </div>
      <dl className="overflow-hidden rounded-xl border border-line bg-card">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-b-0">
            <dt className="text-sm font-medium tracking-wide uppercase">{row.label}</dt>
            <dd className="font-display text-2xl tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => void exportActive("csv")} className="min-h-12 rounded-xl bg-ink text-sm font-medium text-paper">
          CSV
        </button>
        <button type="button" onClick={() => void exportActive("geojson")} className="min-h-12 rounded-xl bg-ink text-sm font-medium text-paper">
          GeoJSON
        </button>
        <button type="button" onClick={() => void exportActive("kml")} className="min-h-12 rounded-xl bg-ink text-sm font-medium text-paper">
          KML
        </button>
      </div>
      <button
        type="button"
        disabled={generatingImage || !mine.length}
        onClick={async () => {
          setGeneratingImage(true);
          try {
            const { downloadPlanImage } = await import("@/lib/survey/planImage");
            await downloadPlanImage(project, mine);
          } catch (error) {
            toast(error instanceof Error ? error.message : "Não foi possível gerar a imagem.");
          } finally {
            setGeneratingImage(false);
          }
        }}
        className="min-h-12 rounded-xl bg-accent text-sm font-semibold text-accent-ink disabled:opacity-50"
      >
        {generatingImage ? "Gerando imagem…" : "Gerar planta detalhada deitada (PNG)"}
      </button>
      <button
        type="button"
        onClick={() => void exportActive("package")}
        className="min-h-12 rounded-xl border border-line bg-card text-sm font-medium"
      >
        Pacote com fotos (JSON)
      </button>
      <button
        type="button"
        onClick={() => {
          void fetch("/planta-executado.json")
            .then((res) => res.json() as Promise<unknown>)
            .then(async (raw) => {
              await importPackageFile(raw);
              await useSurvey.getState().selectProject("planta-retiro-sao-joaquim");
              useSurvey.getState().showOnMap("pl-asfalto-002");
            })
            .catch(() => toast("Não foi possível carregar a planta."));
        }}
        className="min-h-12 rounded-xl bg-accent text-sm font-semibold text-accent-ink"
      >
        Carregar executado da planta (Retiro São Joaquim)
      </button>
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-line bg-card text-sm font-medium">
        Importar pacote
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file
              .text()
              .then((text) => importPackageFile(JSON.parse(text) as unknown))
              .catch(() => toast("Não foi possível importar esse arquivo."));
          }}
        />
      </label>
      <section className="rounded-xl border border-line bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">Código da equipe</h3>
            <p className="font-display text-3xl tracking-widest tabular-nums">{formatTeamCode(teamCode)}</p>
          </div>
          {sync.state === "error" || sync.state === "offline" ? (
            <CloudOff className="size-5 text-warn" aria-hidden="true" />
          ) : (
            <CloudUpload className="size-5 text-good" aria-hidden="true" />
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Geometria e observações sincronizam com o banco quando houver rede. Fotos ficam neste aparelho até você exportar o pacote.
        </p>
        <button
          type="button"
          onClick={() => void syncNow(true)}
          disabled={sync.state === "syncing"}
          className="mt-3 min-h-12 w-full rounded-xl bg-accent font-semibold text-accent-ink"
        >
          {sync.state === "syncing" ? "Sincronizando…" : "Sincronizar"}
        </button>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void setTeamCode(codeDraft);
          }}
        >
          <input
            value={codeDraft}
            onChange={(event) => setCodeDraft(event.target.value.toUpperCase())}
            placeholder="Outro código"
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-base tracking-widest uppercase"
            autoComplete="off"
          />
          <button type="submit" className="h-12 rounded-xl bg-ink px-3 text-sm font-medium text-paper">
            Entrar
          </button>
        </form>
      </section>
    </div>
  );
}
