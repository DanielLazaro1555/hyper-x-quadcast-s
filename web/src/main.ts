// SPDX-License-Identifier: GPL-2.0-or-later
import { getAudioMuted, getStatus, setAudioMuted, setLight, type DeviceStatus } from "./api";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createStage, type Look } from "./scene/stage";
import { applyBrightness, correctColor, createStore, loadCalibration, saveCalibration, uncorrectColor } from "./state";
import { theme } from "./theme";
import { mountMeter } from "./ui/meter";
import { mountPanel } from "./ui/panel";

const POLL_MS = 400;

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`falta el elemento #${id}`);
  return node as T;
}

function describe(s: DeviceStatus): string {
  if (s.error) return `Error del micrófono: ${s.error}`;
  if (s.connected) {
    const muted = typeof s.muted === "boolean" ? s.muted : null;
    const mute = muted === null ? "mute esperando el primer informe" : muted ? "silenciado" : "micrófono activo";
    return s.rgb
      ? `Conectado. Enviando rgb(${s.rgb.join(", ")}); ${mute}.`
      : `Micrófono conectado; ${mute}.`;
  }
  return "Servicio activo. Esperando conexión con el micrófono.";
}

const store = createStore({ color: "#ff0000", brightness: 100, ...loadCalibration() });

const stage = createStage(required("stage"));
let importedLedMaterials: THREE.MeshBasicMaterial[] = [];
let ledGlow: THREE.Mesh | null = null;
let importedMuteMaterials: THREE.MeshStandardMaterial[] = [];

// El GLB es un solo modelo negro con un único material; la versión blanca se
// obtiene repintando las piezas por rol.
type Variant = "black" | "white";
type Role = "body" | "net" | "thread" | "foam";
interface Finish {
  color: number;
  metalness: number;
  roughness: number;
}
// Espuma interior: marrón grisáceo mate en ambos modelos.
const FOAM: Finish = { color: 0x5c4838, metalness: 0, roughness: 1 };
const VARIANTS: Record<Variant, { label: string; parts: Record<Role, Finish>; muteOff: number; look: Look }> = {
  black: {
    label: "Negro",
    parts: {
      body: { color: 0x23262b, metalness: 0.5, roughness: 0.4 },
      net: { color: 0x14161a, metalness: 0.7, roughness: 0.36 },
      thread: { color: 0xeceff2, metalness: 0.1, roughness: 0.6 },
      foam: FOAM,
    },
    muteOff: 0x111316,
    look: { exposure: 1.15, diffuse: 1 },
  },
  white: {
    label: "Blanco",
    parts: {
      body: { color: 0xf4f5f7, metalness: 0.1, roughness: 0.45 },
      net: { color: 0xcfd3d8, metalness: 0.4, roughness: 0.42 },
      thread: { color: 0xe3e5e8, metalness: 0.05, roughness: 0.6 },
      foam: FOAM,
    },
    muteOff: 0xc4c9d0,
    // Menos luz difusa y más exposición: las sombras marcan los detalles sin teñir de gris.
    look: { exposure: 0.95, diffuse: 0.25 },
  },
};
const VARIANT_KEY = "quadcast-s.variant";
function loadVariant(): Variant {
  try {
    const wanted = new URLSearchParams(location.search).get("variant") ?? localStorage.getItem(VARIANT_KEY);
    return wanted === "white" ? "white" : "black";
  } catch {
    return "black";
  }
}
let currentVariant: Variant = loadVariant();
const partMaterials: { material: THREE.MeshStandardMaterial; role: Role }[] = [];
function makePart(role: Role): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  partMaterials.push({ material, role });
  return material;
}
function applyVariant(variant: Variant) {
  currentVariant = variant;
  const { parts, look } = VARIANTS[variant];
  stage.setLook(look);
  partMaterials.forEach(({ material, role }) => {
    const finish = parts[role];
    material.color.setHex(finish.color);
    material.metalness = finish.metalness;
    material.roughness = finish.roughness;
  });
  setMuteState(currentMuted);
}
// En pantalla, el brillo de un LED real se percibe más alto que en proporción lineal: se
// usa una curva de potencia 0,35 (38 % se dibuja como ~71 %) para que no se vea casi apagado. Solo afecta al
// dibujo 3D; al micrófono se le envía el brillo tal cual.
function displayRgb(color: string, brightness: number): [number, number, number] {
  const percent = Math.round(Math.pow(Math.min(Math.max(brightness, 0), 100) / 100, 0.35) * 100);
  const rgb = applyBrightness(color, 100);
  // Un LED encendido emite su canal más fuerte a plena intensidad: se conserva el matiz y
  // el canal mayor se lleva a 255, para que un azul oscuro no se vea apagado en pantalla.
  const peak = Math.max(...rgb);
  const vivid = peak === 0 ? rgb : (rgb.map((c) => Math.round((c * 255) / peak)) as [number, number, number]);
  return vivid.map((c) => Math.floor((c * percent) / 100)) as [number, number, number];
}
// La vista 3D muestra el color ya corregido: el mismo que recibe el micrófono real.
let currentRgb = displayRgb(correctColor(store.get().color, store.get()), store.get().brightness);
let currentMuted: boolean | null = null;
let audioLevel = 0;
let audioSyncActive = false;
let lastHardwareSync = 0;
const importedGlow = new THREE.PointLight(0xffffff, 0, 4.2);
importedGlow.position.set(0, 2.15, 0.15);
stage.scene.add(importedGlow);
// Cuánto blanco se mezcla en el núcleo del LED (0 = color puro, 1 = blanco).
const HOT_WHITE = 0.04;
function setImportedLight(rgb: [number, number, number]) {
  currentRgb = rgb;
  // El QuadCast apaga toda la iluminación de la cápsula mientras está muteado.
  const ledEnabled = currentMuted !== true;
  const level = 1;
  const [r, g, b] = rgb;
  importedGlow.color.setRGB(ledEnabled ? r / 255 : 0, ledEnabled ? g / 255 : 0, ledEnabled ? b / 255 : 0);
  importedGlow.intensity = ledEnabled ? Math.max(r, g, b) / 255 * (0.25 + audioLevel * 0.5) : 0;
  // Silenciado: se oculta la luz y a través de la rejilla se ve la espuma.
  if (ledGlow) ledGlow.visible = ledEnabled;
  importedLedMaterials.forEach((material) => {
    // Sin corrección tonal: así un rojo puro se ve rojo y no un durazno desaturado.
    // El núcleo de un LED encendido se acerca al blanco: se mezcla blanco en proporción al
    // brillo para que los agujeros luzcan intensos, sin cambiar el matiz.
    const hot = (c: number, peak: number) => (ledEnabled ? Math.min(1, (c / 255) * level + (peak / 255) * HOT_WHITE) : 0);
    const peak = Math.max(r, g, b);
    material.color.setRGB(hot(r, peak), hot(g, peak), hot(b, peak));
  });
  // La tapa del sensor táctil no se ilumina nunca: el estado se ve en la malla y en el
  // indicador de la página.
  importedMuteMaterials.forEach((material) => material.color.set(VARIANTS[currentVariant].muteOff));
}

function setMuteState(muted: boolean | null) {
  const state = typeof muted === "boolean" ? muted : null;
  currentMuted = state;
  setImportedLight(currentRgb);
  const indicator = required<HTMLDivElement>("mute-status");
  indicator.dataset.state = state === null ? "unknown" : state ? "muted" : "active";
  indicator.textContent = state === null ? "Mute pendiente · toca el sensor" : state ? "Micrófono silenciado" : "Micrófono activo";
}

function setAudioLevel(level: number, active: boolean) {
  audioLevel = THREE.MathUtils.clamp(level, 0, 1);
  setImportedLight(currentRgb);

  const state = store.get();
  if (!active) {
    if (audioSyncActive) {
      audioSyncActive = false;
      push({ color: correctColor(state.color, state), brightness: state.brightness, uiColor: state.color });
    }
    return;
  }

  audioSyncActive = true;
  const now = performance.now();
  if (now - lastHardwareSync < 100) return;
  lastHardwareSync = now;
  const audioBrightness = Math.round(state.brightness * (0.24 + audioLevel * 0.76));
  push({ color: correctColor(state.color, state), brightness: audioBrightness, transient: true });
}
new GLTFLoader().load("/models/quadcast-s.glb", ({ scene: model }) => {
  const initial = new THREE.Box3().setFromObject(model);
  const size = initial.getSize(new THREE.Vector3());
  if (size.y <= 0) return;
  model.scale.multiplyScalar(2.85 / size.y);
  const fitted = new THREE.Box3().setFromObject(model);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -fitted.min.y, -center.z);
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.name.toLowerCase().includes("mute_the_microphone")) {
      const createMuteIndicator = () => {
        const material = new THREE.MeshStandardMaterial({
          color: 0x111316,
          metalness: 0.35,
          roughness: 0.3,
          emissive: 0x000000,
          side: THREE.DoubleSide,
        });
        importedMuteMaterials.push(material);
        return material;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(createMuteIndicator)
        : createMuteIndicator();
      return;
    }
    if (node.name.toLowerCase().includes("net")) {
      // La malla es metal oscuro: la luz del LED se ve a través de sus agujeros.
      node.material = makePart("net");
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(node);
      // Justo por fuera de la espuma interior (radio ≈ 0.317) y por dentro de la malla.
      const radius = (box.max.x - box.min.x) / 2 * 0.99;
      const height = box.max.y - box.min.y;
      const glow = new THREE.CylinderGeometry(radius, radius, height, 48, 24, true);
      // Más intenso en los extremos, donde está el anillo LED, y más tenue en medio.
      const position = glow.getAttribute("position");
      const shade = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const t = Math.abs(position.getY(i) / (height / 2));
        shade.fill(0.9 + 0.1 * t * t, i * 3, i * 3 + 3);
      }
      glow.setAttribute("color", new THREE.BufferAttribute(shade, 3));
      const led = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
      importedLedMaterials.push(led);
      const glowMesh = new THREE.Mesh(glow, led);
      glowMesh.position.copy(box.getCenter(new THREE.Vector3()));
      ledGlow = glowMesh;
      stage.scene.add(glowMesh);
      return;
    }
    const name = node.name.toLowerCase();
    const role: Role = name.includes("thread") ? "thread" : name.includes("foam") ? "foam" : "body";
    node.material = Array.isArray(node.material) ? node.material.map(() => makePart(role)) : makePart(role);
  });
  stage.scene.add(model);
  applyVariant(currentVariant);
  setImportedLight(currentRgb);
  setMuteState(currentMuted);
}, undefined, (error) => {
  console.error("No se pudo cargar el modelo 3D QuadCast S.", error);
});

const panel = mountPanel(required("controls"), store);
mountMeter(required("meter"), setAudioLevel);
store.subscribe((s) => {
  const rgb = displayRgb(correctColor(s.color, s), s.brightness);
  setImportedLight(rgb);
});

// Envío al micrófono: solo ante cambios del usuario (no al cargar la página). Se
// envía de inmediato; si ya hay una petición en curso, se guarda solo el último
// valor y se manda al terminar, así el deslizador nunca acumula cola.
interface Pending {
  color: string;
  brightness: number;
  /** Color elegido sin corregir; el servicio lo guarda para recuperarlo al recargar. */
  uiColor?: string;
  /** Cambio pasajero (brillo al ritmo del audio): el servicio no lo recuerda. */
  transient?: boolean;
}
let inFlight = false;
let pending: Pending | null = null;
// Último color que envió esta página: sirve para no tratarlo como un cambio externo.
let lastSentUi = "";
let lastPushAt = -Infinity;
function uiKey(color: string, brightness: number, corrected: boolean): string {
  return `${color.toLowerCase()}|${brightness}|${corrected}`;
}

function push(value: Pending) {
  lastPushAt = performance.now();
  if (value.uiColor) lastSentUi = uiKey(value.uiColor, value.brightness, false);
  if (inFlight) {
    pending = value;
    return;
  }
  inFlight = true;
  setLight(value.color, value.brightness, value.uiColor, value.transient)
    .then((s) => {
      panel.setStatus(describe(s));
      setMuteState(s.muted);
    })
    .catch((e: Error) => panel.setStatus(`No se pudo enviar: ${e.message}`))
    .finally(() => {
      inFlight = false;
      const next = pending;
      pending = null;
      if (next) push(next);
    });
}

let first = true;
// Al recuperar el color guardado por el servicio no hay que reenviarlo al micrófono.
let restoring = false;
store.subscribe((s) => {
  saveCalibration({ gamma: s.gamma, gains: s.gains });
  if (first) {
    first = false;
    return;
  }
  if (restoring) return;
  // Al micrófono va el color corregido; la vista 3D usa el original.
  push({ color: correctColor(s.color, s), brightness: s.brightness, uiColor: s.color });
});

const variantButton = required<HTMLButtonElement>("variant");
function renderVariantButton() {
  const other: Variant = currentVariant === "black" ? "white" : "black";
  variantButton.textContent = `Cambiar a ${VARIANTS[other].label.toLowerCase()}`;
  variantButton.title = `Modelo actual: ${VARIANTS[currentVariant].label}`;
}
variantButton.addEventListener("click", () => {
  applyVariant(currentVariant === "black" ? "white" : "black");
  try {
    localStorage.setItem(VARIANT_KEY, currentVariant);
  } catch {
    // Sin almacenamiento solo se pierde el recuerdo de la elección.
  }
  renderVariantButton();
});
renderVariantButton();

const themeButton = required<HTMLButtonElement>("theme");
themeButton.addEventListener("click", () => theme.toggle());
theme.subscribe((t) => {
  stage.setTheme(t);
  themeButton.textContent = t === "dark" ? "Modo claro" : "Modo oscuro";
});

const audioButton = required<HTMLButtonElement>("audio-mute");
let audioMuted: boolean | null = null;
function renderAudioButton() {
  audioButton.disabled = audioMuted === null;
  audioButton.textContent = audioMuted ? "Reactivar audio" : "Silenciar audio";
}
audioButton.addEventListener("click", () => {
  if (audioMuted === null) return;
  audioButton.disabled = true;
  setAudioMuted(!audioMuted)
    .then((m) => (audioMuted = m))
    .catch((e: Error) => panel.setStatus(`No se pudo cambiar el audio: ${e.message}`))
    .finally(renderAudioButton);
});

async function pollAudio() {
  try {
    audioMuted = await getAudioMuted();
  } catch {
    audioMuted = null;
  }
  renderAudioButton();
}

// Al abrir la web se recupera el color: primero el último que eligió la web (el
// servicio lo recuerda) y, si no hay, el que el micrófono tenía al conectar. Solo una vez.
/** El micrófono guarda el color ya con brillo y calibración: se separa el brillo como el canal mayor. */
function fromDeviceColor(rgb: [number, number, number] | null): { color: string; brightness: number } | null {
  if (!rgb) return null;
  const max = Math.max(...rgb);
  if (max === 0) return null;
  // El micrófono guarda el color ya corregido: se normaliza y se deshace la calibración.
  const normalized = rgb.map((c) => Math.round((c * 255) / max)) as [number, number, number];
  return { color: uncorrectColor(normalized, store.get()), brightness: Math.max(1, Math.round((max / 255) * 100)) };
}
// Último estado `ui` del servicio que esta página ya procesó.
let lastSeenUi: string | null = null;

/** Lleva un color que viene del servicio a la web, sin reenviarlo al micrófono. */
function applyRemote(color: string, brightness: number) {
  restoring = true;
  store.set({ color, brightness });
  restoring = false;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Sigue los cambios de color hechos desde fuera (API) y, al abrir, recupera el último. */
function syncColor(status: DeviceStatus) {
  if (lastSeenUi === null) {
    // Primera lectura: el último color elegido y, si no hay, el que tenía el micrófono.
    lastSeenUi = status.ui ? uiKey(status.ui.color, status.ui.brightness, status.ui.corrected) : "";
    const first = status.ui
      ? { color: status.ui.corrected ? uncorrectColor(hexToRgb(status.ui.color), store.get()) : status.ui.color, brightness: status.ui.brightness }
      : fromDeviceColor(status.device_rgb);
    if (first) applyRemote(first.color, first.brightness);
    return;
  }
  const ui = status.ui;
  if (!ui) return;
  const key = uiKey(ui.color, ui.brightness, ui.corrected);
  if (key === lastSeenUi) return;
  lastSeenUi = key;
  // Lo que envió esta misma página, o un cambio que aún está en camino, no es externo.
  // Un sondeo anterior a un cambio reciente de esta página tampoco cuenta.
  if (key === lastSentUi || inFlight || pending || performance.now() - lastPushAt < 1500) return;
  applyRemote(ui.corrected ? uncorrectColor(hexToRgb(ui.color), store.get()) : ui.color, ui.brightness);
}

// Último estado del sensor físico visto: cuando cambia, el servicio ya igualó el audio de
// software, así que se refresca el botón sin esperar al siguiente sondeo de audio.
let lastHardwareMuted: boolean | null = null;

async function poll() {
  try {
    const status = await getStatus();
    syncColor(status);
    if (status.muted !== lastHardwareMuted) {
      lastHardwareMuted = status.muted;
      void pollAudio();
    }
    panel.setStatus(describe(status));
    setMuteState(status.muted);
  } catch {
    panel.setStatus("Sin conexión con el servicio local. Ejecútalo con: quadcast-s serve");
  }
}
void poll();
void pollAudio();
window.setInterval(() => void poll(), POLL_MS);
window.setInterval(() => void pollAudio(), 1500);

stage.start();
