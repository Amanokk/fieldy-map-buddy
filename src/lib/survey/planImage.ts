import { CATALOG, type FeatureType, type Project } from "./types";

type AnyFeature = {
  type: FeatureType;
  kind?: string;
  lat: number;
  lng: number;
  coordinates?: [number, number][];
  lengthM?: number | null;
};

const LINE_ORDER: { type: FeatureType; width: number; alpha: number }[] = [
  { type: "calcada", width: 14, alpha: 0.75 },
  { type: "meiofio", width: 7, alpha: 0.9 },
  { type: "asfalto", width: 7, alpha: 1 },
  { type: "tatil", width: 5, alpha: 1 },
];

/** Desenha uma planta do executado (estilo prancha) e baixa como PNG. */
export async function downloadPlanImage(project: Project | null, features: AnyFeature[]) {
  const W = 2400;
  const H = 1700;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  const valid = features.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
  const pts: [number, number][] = [];
  for (const f of valid) {
    if (f.coordinates && f.coordinates.length >= 2) pts.push(...f.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]));
    else pts.push([f.lng, f.lat]);
  }
  if (pts.length === 0) throw new Error("vazio");

  // Papel
  ctx.fillStyle = "#f7f6f1";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Área do desenho
  const area = { x: 80, y: 80, w: W - 640, h: H - 160 };
  ctx.lineWidth = 1.5;
  ctx.strokeRect(area.x, area.y, area.w, area.h);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  for (const [lng, lat] of pts) {
    const x = lng * kx, y = lat * ky;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pad = 60;
  const scale = Math.min((area.w - pad * 2) / Math.max(maxX - minX, 1), (area.h - pad * 2) / Math.max(maxY - minY, 1));
  const ox = area.x + (area.w - (maxX - minX) * scale) / 2;
  const oy = area.y + (area.h - (maxY - minY) * scale) / 2;
  const P = (lng: number, lat: number): [number, number] => [ox + (lng * kx - minX) * scale, oy + (maxY - lat * ky) * scale];

  // Grade de fundo (a cada 50 m)
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.strokeStyle = "#dedbd0";
  ctx.lineWidth = 1;
  const step = 50 * scale;
  if (step > 8) {
    for (let x = ox % step; x < area.x + area.w; x += step) { ctx.beginPath(); ctx.moveTo(x, area.y); ctx.lineTo(x, area.y + area.h); ctx.stroke(); }
    for (let y = oy % step; y < area.y + area.h; y += step) { ctx.beginPath(); ctx.moveTo(area.x, y); ctx.lineTo(area.x + area.w, y); ctx.stroke(); }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const layer of LINE_ORDER) {
    ctx.strokeStyle = CATALOG[layer.type].color;
    ctx.globalAlpha = layer.alpha;
    ctx.lineWidth = layer.width;
    for (const f of valid) {
      if (f.type !== layer.type || !f.coordinates || f.coordinates.length < 2) continue;
      ctx.beginPath();
      f.coordinates.forEach(([lng, lat], i) => {
        const [x, y] = P(lng, lat);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  for (const type of ["ralo", "deficiente"] as FeatureType[]) {
    ctx.fillStyle = CATALOG[type].color;
    for (const f of valid) {
      if (f.type !== type || (f.coordinates && f.coordinates.length >= 2)) continue;
      const [x, y] = P(f.lng, f.lat);
      if (type === "ralo") ctx.fillRect(x - 5, y - 5, 10, 10);
      else { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();

  // Barra de escala
  const scaleM = [10, 20, 50, 100, 200, 500, 1000].find((m) => m * scale > 160) ?? 1000;
  const sx = area.x + 30, sy = area.y + area.h - 40;
  ctx.fillStyle = "#222";
  ctx.fillRect(sx, sy, scaleM * scale, 8);
  ctx.font = "22px sans-serif";
  ctx.fillText(`${scaleM} m`, sx, sy - 10);

  // Norte
  const nx = area.x + area.w - 70, ny = area.y + 90;
  ctx.beginPath(); ctx.arc(nx, ny, 40, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = "#222"; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx, ny - 34); ctx.lineTo(nx - 12, ny + 10); ctx.lineTo(nx + 12, ny + 10); ctx.closePath(); ctx.fill();
  ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.fillText("N", nx, ny + 34); ctx.textAlign = "left";

  // Legenda
  const lx = W - 520, ly = 80, lw = 440;
  ctx.fillStyle = "#fff";
  ctx.fillRect(lx, ly, lw, 520);
  ctx.strokeRect(lx, ly, lw, 520);
  ctx.fillStyle = "#111";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LEGENDA", lx + lw / 2, ly + 60);
  ctx.textAlign = "left";
  const items: { type: FeatureType; label: string }[] = [
    { type: "ralo", label: "CAIXA RALO" },
    { type: "meiofio", label: "MEIO FIO" },
    { type: "calcada", label: "CALÇADA" },
    { type: "asfalto", label: "ASFALTO" },
    { type: "tatil", label: "PISO TÁTIL" },
    { type: "deficiente", label: "ACESSIBILIDADE" },
  ];
  items.forEach((item, i) => {
    const y = ly + 100 + i * 66;
    ctx.fillStyle = CATALOG[item.type].color;
    ctx.fillRect(lx + 30, y, 170, 40);
    ctx.fillStyle = "#111";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(item.label, lx + 220, y + 30);
  });

  // Resumo
  const count = (t: FeatureType) => valid.filter((f) => f.type === t).length;
  const len = (t: FeatureType) => valid.filter((f) => f.type === t).reduce((s, f) => s + (f.lengthM ?? 0), 0);
  const fm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(m)} m`);
  const ry = ly + 560;
  ctx.fillStyle = "#fff"; ctx.fillRect(lx, ry, lw, 420); ctx.strokeRect(lx, ry, lw, 420);
  ctx.fillStyle = "#111"; ctx.font = "bold 30px sans-serif"; ctx.fillText("QUANTITATIVO EXECUTADO", lx + 24, ry + 50);
  ctx.font = "26px sans-serif";
  [
    ["Caixas-ralo", String(count("ralo"))],
    ["Acessibilidade", String(count("deficiente"))],
    ["Calçada", fm(len("calcada"))],
    ["Meio-fio", fm(len("meiofio"))],
    ["Asfalto", fm(len("asfalto"))],
    ["Piso tátil", fm(len("tatil"))],
  ].forEach(([k, v], i) => {
    const y = ry + 105 + i * 50;
    ctx.textAlign = "left"; ctx.fillText(k, lx + 24, y);
    ctx.textAlign = "right"; ctx.fillText(v, lx + lw - 24, y);
  });
  ctx.textAlign = "left";

  // Selo
  const tyy = H - 80 - 260;
  ctx.fillStyle = "#fff"; ctx.fillRect(lx, tyy, lw, 260); ctx.strokeRect(lx, tyy, lw, 260);
  ctx.fillStyle = "#111";
  ctx.font = "bold 28px sans-serif";
  wrap(ctx, (project?.name ?? "Projeto").toUpperCase(), lx + 24, tyy + 50, lw - 48, 34);
  ctx.font = "24px sans-serif";
  ctx.fillText(project?.place || "", lx + 24, tyy + 150, lw - 48);
  ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, lx + 24, tyy + 190, lw - 48);
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText("Posições dos registros do levantamento — conferir em campo.", lx + 24, tyy + 230, lw - 48);

  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("png");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planta-${(project?.name ?? "projeto").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) { ctx.fillText(line, x, yy); line = w; yy += lh; if (yy > y + lh * 2) break; }
    else line = test;
  }
  ctx.fillText(line, x, yy);
}
