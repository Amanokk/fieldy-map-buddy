import proj4 from "proj4";
import baseAsset from "@/assets/retiro-base.jpg.asset.json";
import { CATALOG, type FeatureType, type Project } from "./types";

type AnyFeature = {
  type: FeatureType;
  lat: number;
  lng: number;
  coordinates?: [number, number][];
  lengthM?: number | null;
};

const INK = "#222222", PAPER = "#ffffff", MUTED = "#666666", GRID = "#e5e5e5";
const UTM = "+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs";
const ANGLE = -52 * Math.PI / 180;
const ITEMS: { type: FeatureType; label: string }[] = [
  { type: "ralo", label: "CAIXA-RALO COM GRELHA" },
  { type: "meiofio", label: "MEIO-FIO" },
  { type: "calcada", label: "CALÇADA" },
  { type: "asfalto", label: "ASFALTO" },
  { type: "tatil", label: "PISO TÁTIL" },
  { type: "deficiente", label: "ACESSIBILIDADE" },
];

async function loadBase(): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = baseAsset.url;
  await image.decode();
  return image;
}

/** Exportação local: base real georreferenciada, sem consultar serviços de mapas. */
export async function downloadPlanImage(project: Project | null, features: AnyFeature[]) {
  const W = 3600, H = 2400;
  const valid = features.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
  const points = valid.flatMap((f): [number, number][] => f.coordinates?.length ? f.coordinates : [[f.lng, f.lat]]);
  if (!points.length) throw new Error("Sem registros para gerar a imagem.");
  const isRetiro = project?.id === "planta-retiro-sao-joaquim" && points.every(([lng, lat]) => lng > -42.92 && lng < -42.87 && lat > -22.78 && lat < -22.72);
  // O fundo da obra não é reutilizado em projetos ou locais diferentes.
  const base = isRetiro ? await loadBase().catch(() => null) : null;
  const angle = isRetiro ? ANGLE : 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const toLocal = (lng: number, lat: number): [number, number] => {
    const [e, n] = proj4("EPSG:4326", UTM, [lng, lat]);
    const x = e - 715200, y = 7483600 - n;
    return [x * cos - y * sin, x * sin + y * cos];
  };
  const projected = points.map(([lng, lat]) => toLocal(lng, lat));
  const xs = projected.map((p) => p[0]), ys = projected.map((p) => p[1]);
  const minX = Math.min(...xs) - 100, maxX = Math.max(...xs) + 100;
  const minY = Math.min(...ys) - 100, maxY = Math.max(...ys) + 100;
  const area = { x: 70, y: 140, w: 2690, h: 2120 };
  const scale = Math.min(area.w / (maxX - minX), area.h / (maxY - minY));
  const ox = area.x + (area.w - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = area.y + (area.h - (maxY - minY) * scale) / 2 - minY * scale;
  const P = (lng: number, lat: number): [number, number] => {
    const [x, y] = toLocal(lng, lat);
    return [ox + x * scale, oy + y * scale];
  };
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a imagem.");
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.fillStyle = INK; ctx.font = "bold 42px sans-serif";
  ctx.fillText("LEVANTAMENTO DE PAVIMENTAÇÃO E ACESSIBILIDADE", 70, 105);
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
  if (base) {
    // Grade da prancha: E=715200 em x=394; N=7483600 em y=275.
    // 400 m = 567 px. Recorte original: x=140, y=60 (render 2×).
    const pixelsPerMeter = 567 / 400;
    ctx.save(); ctx.translate(ox, oy); ctx.rotate(angle);
    ctx.drawImage(base, (140 - 394) / pixelsPerMeter * scale, (60 - 275) / pixelsPerMeter * scale,
      base.naturalWidth / pixelsPerMeter * scale, base.naturalHeight / pixelsPerMeter * scale);
    ctx.restore();
  } else {
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    const step = Math.max(50 * scale, 20);
    for (let x = area.x; x < area.x + area.w; x += step) { ctx.beginPath(); ctx.moveTo(x, area.y); ctx.lineTo(x, area.y + area.h); ctx.stroke(); }
    for (let y = area.y; y < area.y + area.h; y += step) { ctx.beginPath(); ctx.moveTo(area.x, y); ctx.lineTo(area.x + area.w, y); ctx.stroke(); }
  }
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const layer of [
    { type: "calcada", width: 13, alpha: 0.65 },
    { type: "meiofio", width: 5, alpha: 0.9 },
    { type: "asfalto", width: 5, alpha: 0.9 },
    { type: "tatil", width: 4, alpha: 1 },
  ] as const) {
    ctx.strokeStyle = CATALOG[layer.type].color; ctx.lineWidth = layer.width; ctx.globalAlpha = layer.alpha;
    for (const f of valid) {
      if (f.type !== layer.type || !f.coordinates || f.coordinates.length < 2) continue;
      ctx.beginPath(); f.coordinates.forEach(([lng, lat], i) => { const [x, y] = P(lng, lat); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  for (const f of valid) {
    if (f.type !== "ralo" && f.type !== "deficiente") continue;
    const [x, y] = P(f.lng, f.lat);
    ctx.fillStyle = CATALOG[f.type].color;
    if (f.type === "ralo") { ctx.fillRect(x - 4, y - 4, 8, 8); }
    else { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(area.x, area.y, area.w, area.h);

  // Seta acompanha a rotação: o norte não fica falsamente apontando para cima.
  const nx = area.x + area.w - 90, ny = area.y + 100;
  ctx.fillStyle = PAPER; ctx.fillRect(nx - 70, ny - 70, 140, 140);
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(angle);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(-15, 25); ctx.lineTo(0, 12); ctx.lineTo(15, 25); ctx.closePath(); ctx.fill();
  ctx.restore(); ctx.fillStyle = INK; ctx.font = "bold 27px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", nx + Math.sin(angle) * 58, ny - Math.cos(angle) * 58); ctx.textAlign = "left";
  const scaleM = [10, 20, 50, 100, 200, 500, 1000].find((m) => m * scale >= 180) ?? 1000;
  ctx.fillStyle = PAPER; ctx.fillRect(area.x + 20, area.y + area.h - 100, scaleM * scale + 60, 80);
  ctx.fillStyle = INK; ctx.fillRect(area.x + 40, area.y + area.h - 40, scaleM * scale, 8);
  ctx.font = "25px sans-serif"; ctx.fillText(`${scaleM} m`, area.x + 40, area.y + area.h - 58);

  const lx = 2820, lw = 700;
  const box = (y: number, h: number, title: string) => {
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(lx, y, lw, h);
    ctx.fillStyle = INK; ctx.font = "bold 33px sans-serif"; ctx.fillText(title, lx + 30, y + 55);
  };
  box(140, 660, "LEGENDA DO EXECUTADO");
  ITEMS.forEach((item, i) => {
    const y = 260 + i * 82;
    ctx.fillStyle = CATALOG[item.type].color;
    if (item.type === "ralo" || item.type === "deficiente") ctx.fillRect(lx + 35, y - 20, 28, 28);
    else ctx.fillRect(lx + 35, y - 12, 95, 12);
    ctx.fillStyle = INK; ctx.font = "bold 26px sans-serif"; ctx.fillText(item.label, lx + 155, y);
  });
  box(840, 570, "QUANTITATIVO EXECUTADO");
  ITEMS.forEach((item, i) => {
    const records = valid.filter((f) => f.type === item.type);
    const line = item.type !== "ralo" && item.type !== "deficiente";
    const value = line ? `${records.reduce((s, f) => s + (f.lengthM ?? 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m` : `${records.length} un.`;
    const y = 960 + i * 66;
    ctx.fillStyle = INK; ctx.font = "25px sans-serif"; ctx.fillText(CATALOG[item.type].label, lx + 30, y);
    ctx.textAlign = "right"; ctx.font = "bold 28px sans-serif"; ctx.fillText(value, lx + lw - 30, y); ctx.textAlign = "left";
  });
  box(1450, 810, "IDENTIFICAÇÃO DA OBRA");
  ctx.font = "bold 32px sans-serif";
  wrap(ctx, (project?.name ?? "Projeto").toUpperCase(), lx + 30, 1570, lw - 60, 42, 4);
  ctx.font = "27px sans-serif"; wrap(ctx, project?.place ?? "", lx + 30, 1760, lw - 60, 36, 2);
  ctx.font = "24px sans-serif"; ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, lx + 30, 1880);
  ctx.fillText(`${valid.length} registros · SIRGAS 2000 / UTM 23S`, lx + 30, 1930);
  ctx.fillStyle = MUTED; ctx.font = "24px sans-serif";
  wrap(ctx, base ? "Base: planta geométrica original, revisão 01. Ruas, lotes e relevo preservados do PDF enviado." : "Base da planta indisponível neste local. Sem nomes de ruas adicionados por aproximação.", lx + 30, 2010, lw - 60, 34, 3);
  wrap(ctx, "Marcações da planta: posições aproximadas. Conferir em campo antes de usar para medição ou execução.", lx + 30, 2140, lw - 60, 34, 3);
  ctx.fillStyle = MUTED; ctx.font = "22px sans-serif";
  ctx.fillText("VIACAMPO · REGISTROS DO LEVANTAMENTO", 70, 2320);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Não foi possível gerar o PNG.");
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `planta-${(project?.name ?? "projeto").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/); let line = "", row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      ctx.fillText(line, x, y + row * lineHeight); row += 1;
      if (row >= maxLines) return;
      line = word;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y + row * lineHeight);
}
