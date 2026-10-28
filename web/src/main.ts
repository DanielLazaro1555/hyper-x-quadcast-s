// SPDX-License-Identifier: GPL-2.0-or-later
import { getAudioMuted, getStatus, setAudioMuted, setLight, type DeviceStatus } from "./api";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createStage } from "./scene/stage";
import { applyBrightness, correctColor, createStore, loadCalibration, saveCalibration } from "./state";
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
const VARIANTS: Record<Variant, { label: string; parts: Record<Role, Finish>; muteOff: number; exposure: number }> = {
  black: {
    label: "Negro",
    parts: {
      body: { color: 0x23262b, metalness: 0.5, roughness: 0.4 },
      net: { color: 0x14161a, metalness: 0.7, roughness: 0.36 },
      thread: { color: 0xeceff2, metalness: 0.1, roughness: 0.6 },
      foam: FOAM,
    },
    muteOff: 0x111316,
    exposure: 1.15,
  },
  white: {
    label: "Blanco",
    parts: {
      body: { color: 0xb9bec6, metalness: 0.15, roughness: 0.5 },
      net: { color: 0xa4aab3, metalness: 0.45, roughness: 0.4 },
      thread: { color: 0x8d949e, metalness: 0.15, roughness: 0.55 },
      foam: FOAM,
    },
    muteOff: 0xc4c9d0,
    exposure: 0.7,
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
  const { parts, exposure } = VARIANTS[variant];
  stage.setExposure(exposure);
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
  return applyBrightness(color, Math.round(Math.pow(Math.min(Math.max(brightness, 0), 100) / 100, 0.35) * 100));
}
let currentRgb = displayRgb(store.get().color, store.get().brightness);
let currentMuted: boolean | null = null;
let audioLevel = 0;
let audioSyncActive = false;
let lastHardwareSync = 0;
const importedGlow = new THREE.PointLight(0xffffff, 0, 4.2);
importedGlow.position.set(0, 2.15, 0.15);
stage.scene.add(importedGlow);
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
    material.color.setRGB(ledEnabled ? r / 255 * level : 0, ledEnabled ? g / 255 * level : 0, ledEnabled ? b / 255 * level : 0);
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
      push({ color: correctColor(state.color, state), brightness: state.brightness });
    }
    return;
  }

  audioSyncActive = true;
  const now = performance.now();
  if (now - lastHardwareSync < 100) return;
  lastHardwareSync = now;
  const audioBrightness = Math.round(state.brightness * (0.24 + audioLevel * 0.76));
  push({ color: correctColor(state.color, state), brightness: audioBrightness });
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
store.subscribe(({ color, brightness }) => {
  const rgb = displayRgb(color, brightness);
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
}
let inFlight = false;
let pending: Pending | null = null;

function push(value: Pending) {
  if (inFlight) {
    pending = value;
    return;
  }
  inFlight = true;
  setLight(value.color, value.brightness, value.uiColor)
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
  const hex = rgb.map((c) => Math.round((c * 255) / max).toString(16).padStart(2, "0")).join("");
  return { color: `#${hex}`, brightness: Math.max(1, Math.round((max / 255) * 100)) };
}
let colorRestored = false;
async function poll() {
  try {
    const status = await getStatus();
    if (!colorRestored) {
      colorRestored = true;
      const restored = status.ui ?? fromDeviceColor(status.device_rgb);
      if (restored) {
        restoring = true;
        store.set({ color: restored.color, brightness: restored.brightness });
        restoring = false;
      }
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
