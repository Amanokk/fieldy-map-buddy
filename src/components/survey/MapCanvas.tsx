import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { CATALOG, pointMarkerHtml } from "@/lib/survey/types";
import { useSurvey } from "@/lib/survey/store";

type LeafletApi = typeof import("leaflet");

function resolveLeaflet(mod: LeafletApi & { default?: LeafletApi }): LeafletApi {
  if (mod.default && typeof mod.default.map === "function") return mod.default;
  return mod;
}

export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const apiRef = useRef<LeafletApi | null>(null);
  const featureLayer = useRef<LayerGroup | null>(null);
  const liveLayer = useRef<LayerGroup | null>(null);
  const userLayer = useRef<LayerGroup | null>(null);
  const sawFix = useRef(false);
  const [ready, setReady] = useState(false);

  const features = useSurvey((state) => state.features);
  const projectId = useSurvey((state) => state.activeProjectId);
  const filters = useSurvey((state) => state.filters);
  const recording = useSurvey((state) => state.recording);
  const fix = useSurvey((state) => state.fix);
  const follow = useSurvey((state) => state.follow);
  const locateTick = useSurvey((state) => state.locateTick);
  const focusToken = useSurvey((state) => state.focusToken);
  const highlightId = useSurvey((state) => state.highlightId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let resize: ResizeObserver | null = null;

    void (async () => {
      const mod = await import("leaflet");
      if (cancelled || !hostRef.current) return;
      const L = resolveLeaflet(mod);
      apiRef.current = L;
      map = L.map(host, { zoomControl: false, attributionControl: true, preferCanvas: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 100, wheelDebounceTime: 20, inertia: true, bounceAtZoomLimits: false, renderer: L.canvas({ padding: 0.5, tolerance: 8 }) }).setView([-14.235, -51.9253], 4);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      featureLayer.current = L.layerGroup().addTo(map);
      liveLayer.current = L.layerGroup().addTo(map);
      userLayer.current = L.layerGroup().addTo(map);
      map.on("dragstart", () => useSurvey.getState().setFollow(false));
      const stopFollow = (event: Event) => {
        if (event.type === "wheel" || (event as TouchEvent).touches?.length > 1) useSurvey.getState().setFollow(false);
      };
      host.addEventListener("wheel", stopFollow, { passive: true });
      host.addEventListener("touchstart", stopFollow, { passive: true });
      const publish = () => {
        if (!map) return;
        const center = map.getCenter();
        useSurvey.getState().setMapCenter({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
      };
      map.on("moveend", publish);
      publish();
      mapRef.current = map;
      resize = new ResizeObserver(() => map?.invalidateSize());
      resize.observe(host);
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      resize?.disconnect();
      map?.remove();
      mapRef.current = null;
      featureLayer.current = null;
      liveLayer.current = null;
      userLayer.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = apiRef.current;
    const layer = featureLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    const visible = features.filter((feature) => feature.projectId === projectId && filters[feature.type]);
    for (const feature of visible) {
      const meta = CATALOG[feature.type];
      const selected = feature.id === highlightId;
      if (feature.kind === "line" && feature.coordinates.length >= 2) {
        const latlngs = feature.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polyline(latlngs, { color: meta.casing, weight: selected ? 12 : 9, opacity: 0.95, smoothFactor: 1.5 })
          .on("click", () => useSurvey.getState().openDetail(feature.id))
          .addTo(layer);
        L.polyline(latlngs, { color: meta.color, weight: selected ? 6 : 4, opacity: 0.95, smoothFactor: 1.5 })
          .on("click", () => useSurvey.getState().openDetail(feature.id))
          .addTo(layer);
      } else if (selected) {
        const icon = L.divIcon({
          className: "vc-icon",
          html: pointMarkerHtml(feature.type, selected),
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        L.marker([feature.lat, feature.lng], { icon, keyboard: true, zIndexOffset: 500 })
          .on("click", () => useSurvey.getState().openDetail(feature.id))
          .addTo(layer);
      } else {
        L.circleMarker([feature.lat, feature.lng], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: meta.color,
          fillOpacity: 1,
        })
          .on("click", () => useSurvey.getState().openDetail(feature.id))
          .addTo(layer);
      }
    }
  }, [features, filters, highlightId, projectId, ready]);

  useEffect(() => {
    const L = apiRef.current;
    const layer = liveLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (!recording || recording.points.length === 0) return;
    const meta = CATALOG[recording.type];
    const latlngs = recording.points.map((point) => [point.lat, point.lng] as [number, number]);
    if (latlngs.length >= 2) {
      L.polyline(latlngs, { color: meta.casing, weight: 10, opacity: 0.9 }).addTo(layer);
      L.polyline(latlngs, {
        color: meta.color,
        weight: 5,
        opacity: recording.paused ? 0.65 : 1,
        dashArray: recording.paused ? "7 8" : undefined,
      }).addTo(layer);
    }
    const last = latlngs[latlngs.length - 1];
    L.circleMarker(last, {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: meta.color,
      fillOpacity: 1,
    }).addTo(layer);
  }, [recording, ready]);

  useEffect(() => {
    const L = apiRef.current;
    const map = mapRef.current;
    const layer = userLayer.current;
    if (!ready || !L || !map || !layer || !fix) return;
    layer.clearLayers();
    if (Number.isFinite(fix.accuracy) && fix.accuracy > 0 && fix.accuracy < 500) {
      L.circle([fix.lat, fix.lng], {
        radius: fix.accuracy,
        color: "var(--color-gps)",
        weight: 1,
        fillColor: "var(--color-gps)",
        fillOpacity: 0.12,
      }).addTo(layer);
    }
    const moving = (fix.speed ?? 0) > 0.6 && fix.heading != null;
    const rotation = moving ? fix.heading : 0;
    const icon = L.divIcon({
      className: "vc-icon",
      html: `<div class="vc-user" style="transform:rotate(${rotation ?? 0}deg)">${
        moving ? '<span class="vc-user-arrow"></span>' : ""
      }<span class="vc-user-dot"></span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 22],
    });
    L.marker([fix.lat, fix.lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(layer);
    if (follow) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!sawFix.current) {
        sawFix.current = true;
        map.setView([fix.lat, fix.lng], 18);
      } else {
        if (!map.getBounds().pad(-0.25).contains([fix.lat, fix.lng])) map.panTo([fix.lat, fix.lng], { animate: !reduce, duration: 0.45 });
      }
    }
  }, [fix, follow, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const fixNow = useSurvey.getState().fix;
    if (!ready || !map || !fixNow) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoom = map.getZoom() < 16 ? 18 : map.getZoom();
    safeFly(map, fixNow.lat, fixNow.lng, zoom, reduce ? 0 : 0.6);
  }, [locateTick, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusToken) return;
    const feature = useSurvey.getState().features.find((item) => item.id === focusToken.id);
    if (!feature) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    safeFly(map, feature.lat, feature.lng, Math.max(map.getZoom() || 0, 18), reduce ? 0 : 0.7);
  }, [focusToken, ready]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function safeFly(map: LeafletMap, lat: number, lng: number, zoom: number, duration: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return;
  try {
    const size = map.getSize();
    if (duration === 0 || size.x === 0 || size.y === 0) map.setView([lat, lng], zoom, { animate: false });
    else map.flyTo([lat, lng], zoom, { duration });
  } catch {
    try { map.setView([lat, lng], zoom, { animate: false }); } catch { /* mapa ainda sem tamanho */ }
  }
}
