// SPDX-License-Identifier: GPL-2.0-or-later
import { NEUTRAL_CALIBRATION, type Store } from "../state";

const PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const PRESET_NAMES = ["Rojo", "Naranja", "Amarillo", "Verde", "Cian", "Azul", "Violeta", "Rosa"];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function swatchGrid(colors: string[], onPick: (color: string) => void) {
  const grid = el("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;";
  colors.forEach((color, index) => {
    const name = PRESET_NAMES[index] ?? color;
    const b = el("button", { type: "button", title: `Elegir ${name}` });
    b.setAttribute("aria-label", `Elegir color ${name}`);
    b.setAttribute("aria-pressed", "false");
    b.dataset.color = color;
    b.style.cssText = `width:100%;aspect-ratio:1;border:1px solid rgba(15,23,42,.14);border-radius:9px;background:${color};cursor:pointer;display:grid;place-items:center;padding:0;color:#fff;font-size:15px;font-weight:800;text-shadow:0 1px 3px rgba(0,0,0,.75);`;
    b.addEventListener("click", () => onPick(color));
    grid.append(b);
  });
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
  input.style.cssText = "width:100%;display:block;accent-color:var(--accent);margin-top:5px;";
  const text = el("span");
  const row = el("label");
  row.style.cssText = "display:block;margin-bottom:12px;color:var(--text);font-size:13px;";
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
  wrap.style.cssText = "margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--line);";
  const h = el("h2", {}, title);
  h.style.cssText = "font-size:10px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:#475569;margin:0 0 12px;";
  wrap.append(h, ...body);
  return wrap;
}

interface Hsv { h: number; s: number; v: number }

function hexToHsv(hex: string): Hsv {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max ? (delta / max) * 100 : 0, v: max * 100 };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = s / 100, value = v / 100;
  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;
  const parts = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${parts.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function mountPanel(root: HTMLElement, store: Store) {
  const colorRow = el("div");
  colorRow.style.cssText = "position:relative;margin-bottom:12px;";
  const colorToggle = el("button", { type: "button" });
  colorToggle.setAttribute("aria-expanded", "false");
  colorToggle.setAttribute("aria-controls", "custom-color-picker");
  colorToggle.style.cssText = "width:100%;display:flex;align-items:center;gap:11px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#f8fafc;color:var(--text);cursor:pointer;text-align:left;font:inherit;";
  const colorPreview = el("span");
  colorPreview.style.cssText = "width:28px;height:28px;flex:none;border:1px solid rgba(15,23,42,.14);border-radius:8px;background:#ff0000;";
  const toggleText = el("span");
  toggleText.style.cssText = "display:flex;flex:1;flex-direction:column;line-height:1.25;";
  const toggleTitle = el("span", {}, "Color personalizado");
  toggleTitle.style.cssText = "font-size:12px;font-weight:600;";
  const toggleValue = el("span", {}, "#FF0000");
  toggleValue.style.cssText = "margin-top:3px;color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums;";
  toggleText.append(toggleTitle, toggleValue);
  const caret = el("span", {}, "⌄");
  caret.style.cssText = "font-size:18px;color:var(--muted);";
  colorToggle.append(colorPreview, toggleText, caret);

  const popover = el("div");
  popover.id = "custom-color-picker";
  popover.hidden = true;
  popover.style.cssText = "position:absolute;z-index:5;top:calc(100% + 7px);left:0;right:0;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:0 14px 34px rgba(15,23,42,.16);";
  const well = el("div", { role: "slider", tabIndex: 0 });
  well.setAttribute("aria-label", "Saturación y brillo del color");
  well.setAttribute("aria-valuemin", "0");
  well.setAttribute("aria-valuemax", "100");
  well.style.cssText = "position:relative;height:142px;border-radius:9px;cursor:crosshair;touch-action:none;overflow:hidden;";
  const marker = el("span");
  marker.style.cssText = "position:absolute;width:16px;height:16px;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.65);transform:translate(-50%,-50%);pointer-events:none;";
  well.append(marker);
  const hueLabel = el("label", {}, "Tono");
  hueLabel.style.cssText = "display:block;margin:13px 0 5px;color:var(--muted);font-size:11px;font-weight:600;";
  const hue = el("input", { type: "range", min: "0", max: "359", step: "1", value: "0" });
  hue.setAttribute("aria-label", "Tono del color");
  hue.style.cssText = "width:100%;height:13px;appearance:none;border-radius:99px;background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);cursor:pointer;";
  const hexRow = el("div");
  hexRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:13px;";
  const hexLabel = el("label", {}, "HEX");
  hexLabel.style.cssText = "color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.08em;";
  const hexInput = el("input", { type: "text", value: "#FF0000", maxLength: 7, spellcheck: false });
  hexInput.setAttribute("aria-label", "Código hexadecimal del color");
  hexInput.style.cssText = "min-width:0;flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#f8fafc;color:var(--text);font:600 12px ui-monospace,monospace;letter-spacing:.04em;";
  const closePicker = el("button", { type: "button" }, "Listo");
  closePicker.style.cssText = "padding:8px 12px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font:600 12px system-ui,sans-serif;";
  hexRow.append(hexLabel, hexInput, closePicker);
  popover.append(well, hueLabel, hue, hexRow);
  colorRow.append(colorToggle, popover);
  const pick = (color: string) => store.set({ color });
  let hsv = hexToHsv(store.get().color);
  const updatePicker = (color: string) => {
    hsv = hexToHsv(color);
    toggleValue.textContent = color.toUpperCase();
    colorPreview.style.background = color;
    hexInput.value = color.toUpperCase();
    hue.value = String(Math.round(hsv.h) % 360);
    well.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))`;
    marker.style.left = `${hsv.s}%`;
    marker.style.top = `${100 - hsv.v}%`;
    well.setAttribute("aria-valuetext", `${Math.round(hsv.s)}% saturación, ${Math.round(hsv.v)}% brillo`);
  };
  const updateWell = (event: PointerEvent) => {
    const bounds = well.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    hsv.s = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    hsv.v = Math.max(0, Math.min(100, (1 - (event.clientY - bounds.top) / bounds.height) * 100));
    pick(hsvToHex(hsv));
  };
  well.addEventListener("pointerdown", (event) => {
    well.setPointerCapture(event.pointerId);
    updateWell(event);
  });
  well.addEventListener("pointermove", (event) => {
    if (well.hasPointerCapture(event.pointerId)) updateWell(event);
  });
  well.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") hsv.s -= 2;
    if (event.key === "ArrowRight") hsv.s += 2;
    if (event.key === "ArrowUp") hsv.v += 2;
    if (event.key === "ArrowDown") hsv.v -= 2;
    hsv.s = Math.max(0, Math.min(100, hsv.s));
    hsv.v = Math.max(0, Math.min(100, hsv.v));
    pick(hsvToHex(hsv));
  });
  hue.addEventListener("input", () => {
    hsv.h = Number(hue.value);
    pick(hsvToHex(hsv));
  });
  hexInput.addEventListener("input", () => {
    if (/^#[\da-f]{6}$/i.test(hexInput.value)) pick(hexInput.value.toLowerCase());
  });
  hexInput.addEventListener("blur", () => { hexInput.value = toggleValue.textContent ?? "#FF0000"; });
  colorToggle.addEventListener("click", () => {
    popover.hidden = !popover.hidden;
    colorToggle.setAttribute("aria-expanded", String(!popover.hidden));
  });
  closePicker.addEventListener("click", () => {
    popover.hidden = true;
    colorToggle.setAttribute("aria-expanded", "false");
    colorToggle.focus();
  });

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
    "padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#f8fafc;color:var(--text);cursor:pointer;font:inherit;font-size:12px;";
  reset.addEventListener("click", () => store.set({ ...NEUTRAL_CALIBRATION }));

  const hint = el("p", {}, "Ajusta mirando el micrófono real: la vista 3D siempre muestra el color sin corregir.");
  hint.style.cssText = "color:var(--muted);margin:0 0 14px;font-size:12px;";

  const status = el("p", {}, "Comprobando el servicio local...");
  status.style.cssText = "color:var(--muted);margin:0;font-size:12px;padding:11px 12px;border-radius:8px;background:#f8fafc;border:1px solid var(--line);";

  const title = el("h1", {}, "Configuración de audio");
  title.style.cssText = "font-size:19px;letter-spacing:-.03em;font-weight:650;margin:0 0 4px;";
  const sub = el("p", {}, "HyperX QuadCast S · código open source (GPL-2.0-or-later)");
  sub.style.cssText = "font-size:12px;color:var(--muted);margin:0 0 8px;";

  updatePicker(store.get().color);

  root.replaceChildren(
    title, sub,
    section("Iluminación RGB", colorRow, swatchGrid(PRESETS, pick)),
    section("Brillo", brightness.row),
    section("Calibración", hint, gamma.row, ...gainControls.map((g) => g.row), reset),
    status,
  );

  store.subscribe((s) => {
    updatePicker(s.color);
    root.querySelectorAll<HTMLButtonElement>("button[data-color]").forEach((button) => {
      const selected = button.dataset.color === s.color;
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = selected ? "✓" : "";
      button.style.outline = selected ? "2px solid var(--text)" : "none";
      button.style.outlineOffset = selected ? "2px" : "0";
    });
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
