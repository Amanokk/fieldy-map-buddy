import { useEffect } from "react";
import { Toaster } from "sonner";
import { MapCanvas } from "@/components/survey/MapCanvas";
import {
  Crosshair,
  Dashboard,
  Dock,
  FilterOverlay,
  GpsBanner,
  Hint,
  LegendOverlay,
  LocateButton,
  Nearby,
  RecordBar,
  RecordList,
  TopBar,
} from "@/components/survey/Panels";
import { SheetsHost } from "@/components/survey/Sheets";
import { useSurvey } from "@/lib/survey/store";

function useGps() {
  const onFix = useSurvey((state) => state.onFix);
  const setGpsError = useSurvey((state) => state.setGpsError);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Este aparelho não informou o GPS.");
      return;
    }
    let stop = false;
    let watchId = 0;
    let retry = 0;

    const start = () => {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (stop) return;
          const coords = position.coords;
          onFix({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading == null || Number.isNaN(coords.heading) ? null : coords.heading,
            speed: coords.speed == null || Number.isNaN(coords.speed) ? null : coords.speed,
            timestamp: position.timestamp,
          });
        },
        (error) => {
          if (stop) return;
          if (error.code === 1) {
            setGpsError("Permita a localização do celular para marcar onde você está.");
            return;
          }
          setGpsError(error.code === 3 ? "O GPS demorou a responder. Tentando de novo." : "GPS indisponível neste momento.");
          navigator.geolocation.clearWatch(watchId);
          retry = window.setTimeout(start, 3000);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
    };

    start();
    return () => {
      stop = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(retry);
    };
  }, [onFix, setGpsError]);
}

function useOnlineSync() {
  const syncNow = useSurvey((state) => state.syncNow);
  useEffect(() => {
    const kick = () => void syncNow(false);
    window.addEventListener("online", kick);
    const id = window.setInterval(() => {
      if (navigator.onLine) void syncNow(false);
    }, 30000);
    return () => {
      window.removeEventListener("online", kick);
      window.clearInterval(id);
    };
  }, [syncNow]);
}

export function FieldApp() {
  const ready = useSurvey((state) => state.ready);
  const bootError = useSurvey((state) => state.bootError);
  const tab = useSurvey((state) => state.tab);
  const init = useSurvey((state) => state.init);
  const showMap = tab === "campo" || tab === "mapa";

  useEffect(() => {
    void (async () => {
      await init();
      // Load the as-built plan automatically the first time on this device.
      const PLAN_ID = "planta-retiro-sao-joaquim";
      const state = useSurvey.getState();
      if (localStorage.getItem("viacampo-planta-v1") || state.projects.some((p) => p.id === PLAN_ID)) return;
      try {
        // Wait for the startup sync to settle so it can't overwrite the import.
        for (let i = 0; i < 60 && useSurvey.getState().sync.state === "syncing"; i++) {
          await new Promise((r) => setTimeout(r, 250));
        }
        const raw = (await (await fetch("/planta-executado.json")).json()) as unknown;
        await useSurvey.getState().importPackageFile(raw);
        localStorage.setItem("viacampo-planta-v1", "1");
        await useSurvey.getState().selectProject(PLAN_ID);
        useSurvey.getState().showOnMap("pl-asfalto-002");
      } catch {
        /* offline on first open: user can load it from Resumo */
      }
    })();
  }, [init]);
  useGps();
  useOnlineSync();

  if (!ready) {
    return (
      <main className="grid h-dvh place-items-center bg-ink px-6 text-center text-paper">
        <div>
          <p className="font-display text-4xl tracking-wide">VIACAMPO</p>
          <p className="mt-2 text-sm text-fog">Abrindo o levantamento neste aparelho…</p>
        </div>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="grid h-dvh place-items-center bg-paper px-6 text-center">
        <div>
          <p className="font-display text-3xl">Não foi possível abrir</p>
          <p className="mt-2 text-sm text-muted">{bootError}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <TopBar />
      <GpsBanner />
      <div className="relative z-0 min-h-0 flex-1">
        <div className={showMap ? "absolute inset-0" : "invisible absolute inset-0"}>
          <MapCanvas />
        </div>
        {showMap && tab === "campo" && <LegendOverlay />}
        {showMap && tab === "mapa" && <FilterOverlay />}
        {showMap && <LocateButton />}
        {showMap && <Crosshair />}
        {showMap && <Hint />}
        {!showMap && (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-paper">
            {tab === "lista" ? <RecordList /> : <Dashboard />}
          </div>
        )}
      </div>
      {showMap && tab === "campo" && <Nearby />}
      <RecordBar />
      <Dock />
      <SheetsHost />
      <Toaster position="top-center" toastOptions={{ className: "vc-toast" }} />
    </div>
  );
}
