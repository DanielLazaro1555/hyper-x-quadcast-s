import { getStatus, setLight, type DeviceStatus } from "./api";
import { createMic } from "./scene/mic";
import { createStage } from "./scene/stage";
import { applyBrightness, correctColor, createStore, loadCalibration, saveCalibration } from "./state";
import { mountMeter } from "./ui/meter";
import { mountPanel } from "./ui/panel";

const POLL_MS = 2000;

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`falta el elemento #${id}`);
  return node as T;
}

function describe(s: DeviceStatus): string {
  if (s.error) return `Error del micrófono: ${s.error}`;
  if (s.connected && s.rgb) return `Conectado. Enviando rgb(${s.rgb.join(", ")}).`;
  return "Servicio activo. Cambia el color para encender el micrófono.";
}

const store = createStore({ color: "#ff0000", brightness: 100, ...loadCalibration() });

const stage = createStage(required("stage"));
const mic = createMic();
stage.scene.add(mic.group);

const panel = mountPanel(required("controls"), store);
mountMeter(required("meter"));
store.subscribe(({ color, brightness }) => mic.setLight(applyBrightness(color, brightness)));

// Envío al micrófono: solo ante cambios del usuario (no al cargar la página). Se
// envía de inmediato; si ya hay una petición en curso, se guarda solo el último
// valor y se manda al terminar, así el deslizador nunca acumula cola.
interface Pending {
  color: string;
  brightness: number;
}
let inFlight = false;
let pending: Pending | null = null;

function push(value: Pending) {
  if (inFlight) {
    pending = value;
    return;
  }
  inFlight = true;
  setLight(value.color, value.brightness)
    .then((s) => panel.setStatus(describe(s)))
    .catch((e: Error) => panel.setStatus(`No se pudo enviar: ${e.message}`))
    .finally(() => {
      inFlight = false;
      const next = pending;
      pending = null;
      if (next) push(next);
    });
}

let first = true;
store.subscribe((s) => {
  saveCalibration({ gamma: s.gamma, gains: s.gains });
  if (first) {
    first = false;
    return;
  }
  // Al micrófono va el color corregido; la vista 3D usa el original.
  push({ color: correctColor(s.color, s), brightness: s.brightness });
});

async function poll() {
  try {
    panel.setStatus(describe(await getStatus()));
  } catch {
    panel.setStatus("Sin conexión con el servicio local. Ejecútalo con: quadcast-s serve");
  }
}
void poll();
window.setInterval(() => void poll(), POLL_MS);

stage.start();
