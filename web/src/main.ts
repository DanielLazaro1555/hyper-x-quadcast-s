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
let importedMuteMaterials: THREE.MeshStandardMaterial[] = [];
let currentRgb = applyBrightness(store.get().color, store.get().brightness);
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
  const level = Math.min(1, 0.8 + audioLevel * 0.3);
  const [r, g, b] = rgb;
  importedGlow.color.setRGB(ledEnabled ? r / 255 : 0, ledEnabled ? g / 255 : 0, ledEnabled ? b / 255 : 0);
  importedGlow.intensity = ledEnabled ? Math.max(r, g, b) / 255 * (0.25 + audioLevel * 0.5) : 0;
  importedLedMaterials.forEach((material) => {
    // Sin corrección tonal: así un rojo puro se ve rojo y no un durazno desaturado.
    material.color.setRGB(ledEnabled ? r / 255 * level : 0, ledEnabled ? g / 255 * level : 0, ledEnabled ? b / 255 * level : 0);
  });
}

function setMuteState(muted: boolean | null) {
  const state = typeof muted === "boolean" ? muted : null;
  currentMuted = state;
  importedMuteMaterials.forEach((material) => {
    const active = state === false;
    material.color.set(active ? 0xe9edf2 : 0x111316);
    material.emissive.set(active ? 0xffffff : 0x000000);
    material.emissiveIntensity = active ? 2.3 : 0;
  });
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
      node.material = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide });
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
        shade.fill(0.55 + 0.45 * t * t, i * 3, i * 3 + 3);
      }
      glow.setAttribute("color", new THREE.BufferAttribute(shade, 3));
      const led = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
      importedLedMaterials.push(led);
      const glowMesh = new THREE.Mesh(glow, led);
      glowMesh.position.copy(box.getCenter(new THREE.Vector3()));
      stage.scene.add(glowMesh);
      return;
    }
    const original = Array.isArray(node.material) ? node.material : [node.material];
    const darkParts = original.map(() => new THREE.MeshStandardMaterial({
      color: node.name.toLowerCase().includes("thread") ? 0x421c22 : 0x17191d,
      metalness: 0.58,
      roughness: 0.42,
      side: THREE.DoubleSide,
    }));
    node.material = Array.isArray(node.material) ? darkParts : darkParts[0];
  });
  stage.scene.add(model);
  setImportedLight(currentRgb);
  setMuteState(currentMuted);
}, undefined, (error) => {
  console.error("No se pudo cargar el modelo 3D QuadCast S.", error);
});

const panel = mountPanel(required("controls"), store);
mountMeter(required("meter"), setAudioLevel);
store.subscribe(({ color, brightness }) => {
  const rgb = applyBrightness(color, brightness);
  setImportedLight(rgb);
});

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
store.subscribe((s) => {
  saveCalibration({ gamma: s.gamma, gains: s.gains });
  if (first) {
    first = false;
    return;
  }
  // Al micrófono va el color corregido; la vista 3D usa el original.
  push({ color: correctColor(s.color, s), brightness: s.brightness });
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

async function poll() {
  try {
    const status = await getStatus();
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
