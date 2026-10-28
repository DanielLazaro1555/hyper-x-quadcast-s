// SPDX-License-Identifier: GPL-2.0-or-later
import { setMixer, type DeviceInfo, type MixerControl, type StreamFormat } from "../api";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css = "",
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  node.append(...children);
  return node;
}

const HINT = "color:var(--muted);margin:0 0 10px;font-size:12px;";

function heading(text: string) {
  return el("h2", "font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;", text);
}

function card(...children: Node[]) {
  return el("section", "margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--line);", ...children);
}

/** Decibelios de un valor del control: el mínimo más un decibelio por paso. */
function db(control: MixerControl, value: number): string {
  if (control.db_min === null) return "";
  const v = control.db_min + (value - control.min);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} dB`;
}

function formatLine(f: StreamFormat | null): string {
  if (!f) return "sin datos";
  const top = f.rates.length ? Math.max(...f.rates) : 0;
  return `${f.format} · ${f.channels} canales · ${f.bits} bits · hasta ${top / 1000} kHz`;
}

/**
 * Pestaña Audio: controles del mezclador que el micrófono expone por USB. Los de volumen se
 * envían con un pequeño retardo y solo el último valor, para que el deslizador no sature.
 */
export function mountMixer(root: HTMLElement, onError: (message: string) => void) {
  const controls = new Map<string, MixerControl>();
  const sliders = new Map<string, { input: HTMLInputElement; text: HTMLElement }>();
  const switches = new Map<string, HTMLInputElement>();
  const pendingTimers = new Map<string, number>();
  let touching = false; // mientras se arrastra, no se pisa el deslizador con lecturas del servicio

  const send = (id: string, value: number) => {
    setMixer(id, value).then(update).catch((e: Error) => onError(`No se pudo cambiar ${id}: ${e.message}`));
  };

  const slider = (id: string, label: string, hint: string) => {
    const text = el("span", "font-variant-numeric:tabular-nums;color:var(--muted);");
    const input = el("input", "width:100%;display:block;accent-color:var(--accent);margin-top:5px;");
    input.type = "range";
    input.step = "1";
    const row = el("label", "display:block;margin-bottom:6px;color:var(--text);font-size:13px;", `${label}: `, text, input);
    input.addEventListener("pointerdown", () => (touching = true));
    input.addEventListener("pointerup", () => (touching = false));
    input.addEventListener("input", () => {
      const control = controls.get(id);
      if (control) text.textContent = `${input.value} (${db(control, Number(input.value))})`;
      window.clearTimeout(pendingTimers.get(id));
      pendingTimers.set(id, window.setTimeout(() => send(id, Number(input.value)), 80));
    });
    sliders.set(id, { input, text });
    return [row, el("p", HINT, hint)];
  };

  const toggle = (id: string, label: string) => {
    const input = el("input", "accent-color:var(--accent);");
    input.type = "checkbox";
    input.addEventListener("change", () => send(id, input.checked ? 1 : 0));
    switches.set(id, input);
    return el("label", "display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;cursor:pointer;", input, label);
  };

  const formats = el("p", "margin:0;font-size:12px;color:var(--text);line-height:1.6;");

  root.replaceChildren(
    card(
      heading("Ganancia de captura"),
      toggle("capture_switch", "Captura activa (desmarca para silenciar el audio)"),
      ...slider(
        "capture_gain",
        "Ganancia por software",
        "Ajuste que el micrófono expone por USB. No es la perilla trasera: esa es analógica y no envía ningún dato, así que no se puede leer ni mover desde aquí.",
      ),
    ),
    card(
      heading("Auriculares"),
      toggle("headphone_switch", "Salida de auriculares activa"),
      ...slider("headphone_volume", "Volumen", "Salida de 3,5 mm del micrófono."),
    ),
    card(
      heading("Monitorización de tu voz"),
      toggle("monitor_switch", "Oírte a ti mismo en los auriculares"),
      ...slider("monitor_volume", "Nivel de monitorización", "Cuánto de tu propia voz se mezcla en los auriculares, sin retardo."),
    ),
    card(heading("Formato de audio"), formats, el("p", HINT + "margin-top:8px;", "Es lo que el micrófono declara por USB; no se puede subir de 48 kHz ni de 16 bits.")),
  );

  function update(info: DeviceInfo) {
    for (const c of info.controls) {
      controls.set(c.id, c);
      const s = sliders.get(c.id);
      if (s && !touching) {
        const v = c.values[0] ?? c.min;
        s.input.min = String(c.min);
        s.input.max = String(c.max);
        if (s.input.value !== String(v)) s.input.value = String(v);
        s.text.textContent = `${v} (${db(c, v)})`;
      }
      const sw = switches.get(c.id);
      if (sw) sw.checked = (c.values[0] ?? 0) !== 0;
    }
    formats.replaceChildren(
      el("span", "", `Captura: ${formatLine(info.capture)}`),
      el("br"),
      el("span", "", `Reproducción: ${formatLine(info.playback)}`),
    );
  }

  return { update };
}
