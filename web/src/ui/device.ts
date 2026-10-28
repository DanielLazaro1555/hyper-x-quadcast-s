// SPDX-License-Identifier: GPL-2.0-or-later
import type { DeviceInfo } from "../api";

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

const MUTED = "color:var(--muted);font-size:12px;";

function heading(text: string) {
  return el("h2", "font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;", text);
}

function card(...children: Node[]) {
  return el("section", "margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--line);", ...children);
}

/** Un control físico: nombre, qué hace y si el controlador puede leerlo. */
function physical(name: string, what: string, readable: string) {
  return el(
    "div",
    "margin-bottom:12px;",
    el("div", "font-size:13px;font-weight:600;", name),
    el("div", "font-size:12px;color:var(--text);", what),
    el("div", MUTED, readable),
  );
}

export function mountDevice(root: HTMLElement) {
  const usb = el("div");

  root.replaceChildren(
    card(heading("Dispositivos USB"), usb),
    card(
      heading("Controles físicos"),
      physical(
        "Perilla de ganancia (parte trasera)",
        "Ajusta la sensibilidad de entrada del micrófono.",
        "Analógica: no emitió ningún informe en 3 pruebas, así que el controlador no puede leerla. Su efecto sí se ve en el medidor de la pestaña Audio.",
      ),
      physical(
        "Perilla de patrón polar (parte trasera)",
        "Cuatro patrones: estéreo (voces e instrumentos), omnidireccional (varias personas, conferencias), cardioide (podcast, streaming, locución) y bidireccional (entrevistas cara a cara).",
        "No se puede leer. Posible deducirlo del audio solo en parte (estéreo frente a mono); sin confirmar.",
      ),
      physical(
        "Sensor táctil (parte superior)",
        "Silencia o reactiva el micrófono; el LED indica el estado.",
        "Se lee: llega un aviso con cada toque. No se puede accionar desde el ordenador.",
      ),
      physical(
        "Salida de auriculares (3,5 mm)",
        "Reproduce el audio del ordenador y, si lo activas, tu propia voz.",
        "Su volumen y la monitorización se controlan en la pestaña Audio.",
      ),
      el("p", MUTED + "margin:8px 0 0;", "Descripción de los controles según el manual de HyperX para el QuadCast S original."),
    ),
  );

  function update(info: DeviceInfo) {
    if (!info.usb.length) {
      usb.replaceChildren(el("p", MUTED, "No se encuentra el micrófono por USB."));
      return;
    }
    usb.replaceChildren(
      ...info.usb.map((d) =>
        el(
          "div",
          "margin-bottom:10px;font-size:12px;line-height:1.5;",
          el("div", "font-size:13px;font-weight:600;", `${d.id} · ${d.role}`),
          el("div", "color:var(--muted);", `${d.manufacturer} ${d.product} · versión ${d.version} · ${d.speed_mbps} Mbit/s`),
        ),
      ),
      el("p", MUTED, info.card === null ? "Sin tarjeta de audio detectada." : `Tarjeta de audio del sistema: ${info.card}.`),
    );
  }

  return { update };
}
