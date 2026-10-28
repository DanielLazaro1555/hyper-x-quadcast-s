// SPDX-License-Identifier: GPL-2.0-or-later
import { getStatus, setLight, type DeviceStatus } from "./api";
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
let importedLedMaterials: THREE.MeshStandardMaterial[] = [];
let importedMuteMaterials: THREE.MeshStandardMaterial[] = [];
let currentRgb = applyBrightness(store.get().color, store.get().brightness);
let currentMuted: boolean | null = null;
let audioLevel = 0;
let audioSyncActive = false;
let lastHardwareSync = 0;
const importedGlow = new THREE.PointLight(0xffffff, 0, 4.2);
importedGlow.position.set(0, 1.55, 0.25);
stage.scene.add(importedGlow);
function setImportedLight(rgb: [number, number, number]) {
  currentRgb = rgb;
  // El QuadCast apaga toda la iluminación de la cápsula mientras está muteado.
  const ledEnabled = currentMuted !== true;
  const [r, g, b] = rgb;
  importedGlow.color.setRGB(ledEnabled ? r / 255 : 0, ledEnabled ? g / 255 : 0, ledEnabled ? b / 255 : 0);
  importedGlow.intensity = ledEnabled ? Math.max(r, g, b) / 255 * (0.55 + audioLevel * 0.9) : 0;
  importedLedMaterials.forEach((material) => {
    material.emissive.setRGB(ledEnabled ? r / 255 : 0, ledEnabled ? g / 255 : 0, ledEnabled ? b / 255 : 0);
    material.emissiveIntensity = ledEnabled ? 3.2 + audioLevel * 2.4 : 0;
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

function splitLedZones(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const expanded = source.index ? source.toNonIndexed() : source.clone();
  const position = expanded.getAttribute("position");
  const attributes = Object.entries(expanded.attributes);
  const zones = [new Map<string, number[]>(), new Map<string, number[]>()];
  for (const zone of zones) for (const [name] of attributes) zone.set(name, []);

  for (let i = 0; i < position.count; i += 3) {
    const centerY = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const zone = zones[centerY >= 0 ? 0 : 1];
    for (const [name, attribute] of attributes) {
      const output = zone.get(name)!;
      for (let vertex = i; vertex < i + 3; vertex++) {
        for (let component = 0; component < attribute.itemSize; component++) {
          output.push(attribute.array[vertex * attribute.itemSize + component]);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  let offset = 0;
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const count = zone.get("position")?.length ?? 0;
    for (const [name, attribute] of attributes) {
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(zone.get(name)!, attribute.itemSize, attribute.normalized));
    }
    if (zoneIndex === 0) {
      // Add both halves to the same non-indexed geometry in material order.
      offset = count;
    } else {
      for (const [name, attribute] of attributes) {
        const merged = [...(zones[0].get(name) ?? []), ...(zone.get(name) ?? [])];
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(merged, attribute.itemSize, attribute.normalized));
      }
    }
    geometry.addGroup(zoneIndex === 0 ? 0 : offset, count, zoneIndex);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (expanded !== source) expanded.dispose();
  return geometry;
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
      node.geometry = splitLedZones(node.geometry);
      const makeZone = () => {
        const led = new THREE.MeshStandardMaterial({
          color: 0x090b0f,
          metalness: 0.58,
          roughness: 0.36,
          emissive: 0xffffff,
          emissiveIntensity: 3.2,
          side: THREE.DoubleSide,
        });
        importedLedMaterials.push(led);
        return led;
      };
      node.material = [makeZone(), makeZone()];
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
window.setInterval(() => void poll(), POLL_MS);

stage.start();
