// SPDX-License-Identifier: GPL-2.0-or-later
import { NEUTRAL_CALIBRATION, type Store } from "../state";

const PRESETS = ["#ff0000", "#ff8000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#8000ff", "#ff00ff", "#ffffff"];
const MIXED_PRESETS = ["#8b4513", "#a52a2a", "#ff69b4", "#808000", "#008080", "#800080"];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function swatchGrid(colors: string[], columns: number, onPick: (color: string) => void) {
  const grid = el("div");
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:6px;margin-bottom:6px;`;
  for (const color of colors) {
    const b = el("button", { type: "button", title: color });
    b.style.cssText = `aspect-ratio:1;border:1px solid var(--line);border-radius:6px;background:${color};cursor:pointer;`;
    b.addEventListener("click", () => onPick(color));
    grid.append(b);
  }
  return grid;
}

function range(
  label: string,
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
  onInput: (v: number) => void,
) {
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) });
  input.style.cssText = "width:100%;display:block;";
  const text = el("span");
  const row = el("label");
  row.style.cssText = "display:block;margin-bottom:10px;";
  row.append(`${label}: `, text, input);
  input.addEventListener("input", () => onInput(Number(input.value)));
  return {
    row,
    update(v: number) {
      if (input.value !== String(v)) input.value = String(v);
      text.textContent = format(v);
    },
  };
}

function section(title: string, ...body: Node[]) {
  const wrap = el("section");
  wrap.style.marginBottom = "22px";
  const h = el("h2", {}, title);
  h.style.cssText = "font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;";
  wrap.append(h, ...body);
  return wrap;
}

export function mountPanel(root: HTMLElement, store: Store) {
  const picker = el("input", { type: "color" });
  picker.style.cssText = "width:100%;height:44px;border:1px solid var(--line);background:none;padding:2px;margin-bottom:10px;";
  const pick = (color: string) => store.set({ color });

  const brightness = range("Brillo", 0, 100, 1, (v) => `${v} %`, (v) => store.set({ brightness: v }));
  const gamma = range("Gamma", 10, 30, 1, (v) => (v / 10).toFixed(1), (v) => store.set({ gamma: v / 10 }));
  const gainControls = (["Rojo", "Verde", "Azul"] as const).map((name, i) =>
    range(`Ganancia ${name}`, 0, 100, 1, (v) => `${v} %`, (v) => {
      const gains = [...store.get().gains] as [number, number, number];
      gains[i] = v;
      store.set({ gains });
    }),
  );

  const reset = el("button", { type: "button" }, "Restablecer calibración");
  reset.style.cssText =
    "padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:none;color:var(--text);cursor:pointer;";
  reset.addEventListener("click", () => store.set({ ...NEUTRAL_CALIBRATION }));

  const hint = el("p", {}, "Ajusta mirando el micrófono real: la vista 3D siempre muestra el color sin corregir.");
  hint.style.cssText = "color:var(--muted);margin:0 0 10px;font-size:12px;";

  const status = el("p", {}, "Comprobando el servicio local...");
  status.style.cssText = "color:var(--muted);margin:0;font-size:13px;";

  const title = el("h1", {}, "QuadCast S");
  title.style.cssText = "font-size:18px;margin:0 0 20px;";

  root.replaceChildren(
    title,
    section("Color", picker, swatchGrid(PRESETS, 9, pick), swatchGrid(MIXED_PRESETS, 9, pick)),
    section("Brillo", brightness.row),
    section("Calibración", hint, gamma.row, ...gainControls.map((g) => g.row), reset),
    status,
  );

  picker.addEventListener("input", () => pick(picker.value));

  store.subscribe((s) => {
    if (picker.value !== s.color) picker.value = s.color;
    brightness.update(s.brightness);
    gamma.update(Math.round(s.gamma * 10));
    gainControls.forEach((g, i) => g.update(s.gains[i]));
  });

  return {
    setStatus(text: string) {
      status.textContent = text;
    },
  };
}
