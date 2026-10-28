// SPDX-License-Identifier: GPL-2.0-or-later
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Stage { scene: THREE.Scene; start(): void; setExposure(value: number): void }

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  scene.add(new THREE.HemisphereLight(0xcbdcff, 0x25212a, 1.05));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2);
  key.position.set(3, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ab8ff, 1.7);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
  const rim = new THREE.SpotLight(0x89aaff, 32, 12, Math.PI / 4, 0.65, 1.5);
  rim.position.set(-2, 5, -3);
  rim.target.position.set(0, 1.5, 0);
  scene.add(rim, rim.target);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 96),
    new THREE.MeshStandardMaterial({ color: 0xe8edf3, metalness: 0.08, roughness: 0.84 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.55, 0.045, 96),
    new THREE.MeshStandardMaterial({ color: 0xd9e0e9, metalness: 0.16, roughness: 0.58 }),
  );
  platform.position.y = -0.08;
  scene.add(platform);
  const accent = new THREE.Mesh(
    new THREE.TorusGeometry(1.43, 0.009, 6, 100),
    new THREE.MeshBasicMaterial({ color: 0xa8b5c7, transparent: true, opacity: 0.75 }),
  );
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
    setExposure(value) { renderer.toneMappingExposure = value; },
    start() { renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); }); },
  };
}
