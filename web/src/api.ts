// SPDX-License-Identifier: GPL-2.0-or-later
/** Cliente del servicio local (`quadcast-s serve`). */

export interface DeviceStatus {
  connected: boolean;
  error: string | null;
  rgb: [number, number, number] | null;
  muted: boolean | null;
  /** Último color elegido en la web (sin corregir); el micrófono no permite leer el suyo. */
  ui: { color: string; brightness: number } | null;
}

async function parse(res: Response): Promise<DeviceStatus> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `error HTTP ${res.status}`);
  return body as DeviceStatus;
}

export async function getStatus(): Promise<DeviceStatus> {
  return parse(await fetch("/api/status"));
}

export async function setLight(color: string, brightness: number, uiColor?: string): Promise<DeviceStatus> {
  return parse(
    await fetch("/api/light", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color, brightness, ui_color: uiColor }),
    }),
  );
}

/** Mute de software (PipeWire) del micrófono; no es el sensor táctil. */
export async function getAudioMuted(): Promise<boolean> {
  const res = await fetch("/api/audio");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `error HTTP ${res.status}`);
  return body.muted as boolean;
}

export async function setAudioMuted(muted: boolean): Promise<boolean> {
  const res = await fetch("/api/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muted }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `error HTTP ${res.status}`);
  return body.muted as boolean;
}
