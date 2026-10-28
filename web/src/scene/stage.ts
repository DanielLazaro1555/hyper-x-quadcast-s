// SPDX-License-Identifier: GPL-2.0-or-later
import * as THREE from "three";
import type { Theme } from "../theme";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Look {
  exposure: number;
  /** Multiplica la luz hemisférica y del entorno: bajarla da sombras que marcan la forma. */
  diffuse: number;
}

export interface Stage {
  scene: THREE.Scene;
  start(): void;
  /** Ajusta la luz de la escena: la exposición y cuánta luz difusa (ambiente y entorno) hay. */
  setLook(look: Look): void;
  setTheme(theme: Theme): void;
}

// Mismos tonos que --stage en index.html.
const PALETTE: Record<Theme, { background: number; floor: number; platform: number; accent: number }> = {
  light: { background: 0xf1f5f9, floor: 0xe8edf3, platform: 0xd9e0e9, accent: 0xa8b5c7 },
  dark: { background: 0x161e30, floor: 0x1b2438, platform: 0x24304a, accent: 0x3b4863 },
};

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);
  scene.fog = new THREE.Fog(0xf1f5f9, 11, 24);
  // Entorno de estudio: sin nada que reflejar, el metal negro se ve plano y sin detalle.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(3.65, 2.25, 6.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.18, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 4.2;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.49;

  const hemisphere = new THREE.HemisphereLight(0xcbdcff, 0x25212a, 1.05);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2);
  key.position.set(3, 6, 4);
  // Sombras proyectadas: marcan los aros, la suspensión y la rejilla sobre el cuerpo.
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -1;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ab8ff, 1.7);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
  const rim = new THREE.SpotLight(0x89aaff, 32, 12, Math.PI / 4, 0.65, 1.5);
  rim.position.set(-2, 5, -3);
  rim.target.position.set(0, 1.5, 0);
  scene.add(rim, rim.target);

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe8edf3, metalness: 0.08, roughness: 0.84 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 96), floorMaterial);
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xd9e0e9, metalness: 0.16, roughness: 0.58 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 0.045, 96), platformMaterial);
  platform.receiveShadow = true;
  platform.position.y = -0.08;
  scene.add(platform);
  const accentMaterial = new THREE.MeshBasicMaterial({ color: 0xa8b5c7, transparent: true, opacity: 0.75 });
  const accent = new THREE.Mesh(new THREE.TorusGeometry(1.43, 0.009, 6, 100), accentMaterial);
  accent.rotation.x = Math.PI / 2;
  accent.position.y = -0.055;
  scene.add(accent);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  return {
    scene,
    setLook({ exposure, diffuse }) {
      renderer.toneMappingExposure = exposure;
      hemisphere.intensity = 1.05 * diffuse;
      scene.environmentIntensity = 0.7 * diffuse;
    },
    setTheme(theme) {
      const p = PALETTE[theme];
      (scene.background as THREE.Color).setHex(p.background);
      scene.fog!.color.setHex(p.background);
      floorMaterial.color.setHex(p.floor);
      platformMaterial.color.setHex(p.platform);
      accentMaterial.color.setHex(p.accent);
    },
    start() { renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); }); },
  };
}
