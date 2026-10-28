// SPDX-License-Identifier: GPL-2.0-or-later
import * as THREE from "three";

export interface MicModel {
  group: THREE.Group;
  /** Color de la luz, ya con el brillo aplicado. Cada canal de 0 a 255. */
  setLight(rgb: [number, number, number]): void;
}

const HEAD_Y = 1.4;

/**
 * Modelo estilizado, hecho con geometría simple. No es una copia del producto
 * de HyperX: para uno fiel habría que aportar un glTF con licencia libre.
 */
export function createMic(): MicModel {
  const group = new THREE.Group();

  const metal = new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.8, roughness: 0.35 });
  const grille = new THREE.MeshStandardMaterial({
    color: 0x9aa3b2,
    metalness: 0.9,
    roughness: 0.3,
    wireframe: true,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0x000000,
    emissiveIntensity: 1.6,
  });

  // Cápsula luminosa interior y rejilla exterior.
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.1, 8, 32), glow);
  inner.position.y = HEAD_Y;
  const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.2, 12, 24), grille);
  outer.position.y = HEAD_Y;
  group.add(inner, outer);

  // Soporte: dos postes, travesaño, columna y base.
  for (const x of [-0.62, 0.62]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 16), metal);
    post.position.set(x, 1.05, 0);
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.28, 16), metal);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.2, 0);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 16), metal);
  column.position.set(0, -0.02, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.1, 48), metal);
  base.position.set(0, -0.3, 0);
  group.add(bar, column, base);

  const bulb = new THREE.PointLight(0xffffff, 0, 6);
  bulb.position.set(0, HEAD_Y, 0);
  group.add(bulb);

  return {
    group,
    setLight([r, g, b]) {
      const color = new THREE.Color(r / 255, g / 255, b / 255);
      glow.emissive.copy(color);
      glow.color.copy(color).multiplyScalar(0.2);
      bulb.color.copy(color);
      bulb.intensity = Math.max(r, g, b) / 255 * 6;
    },
  };
}
