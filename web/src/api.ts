// SPDX-License-Identifier: GPL-2.0-or-later
/** Cliente del servicio local (`quadcast-s serve`). */

export interface DeviceStatus {
  connected: boolean;
  error: string | null;
  rgb: [number, number, number] | null;
  muted: boolean | null;
  /** Color que el micrófono tenía al conectar el servicio (leído de su búfer), si se pudo leer. */
  device_rgb: [number, number, number] | null;
  /** Último color elegido en la web (sin corregir); el micrófono no permite leer el suyo. */
  ui: { color: string; brightness: number; corrected: boolean } | null;
}

async function parse(res: Response): Promise<DeviceStatus> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `error HTTP ${res.status}`);
  return body as DeviceStatus;
}

export async function getStatus(): Promise<DeviceStatus> {
  return parse(await fetch("/api/status"));
}

export async function setLight(color: string, brightness: number, uiColor?: string, transient = false): Promise<DeviceStatus> {
  return parse(
    await fetch("/api/light", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color, brightness, ui_color: uiColor, transient }),
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

export interface MixerControl {
  id: string;
  name: string;
  kind: "volume" | "switch";
  values: number[];
  min: number;
  max: number;
  /** Decibelios del valor mínimo; cada paso suma 1 dB. Solo en los volúmenes. */
  db_min: number | null;
}

export interface StreamFormat {
  format: string;
  channels: number;
  bits: number;
  rates: number[];
}

export interface UsbDevice {
  id: string;
  product: string;
  manufacturer: string;
  version: string;
  speed_mbps: string;
  role: string;
}

/** Lo que el kernel sabe del audio del micrófono: controles del mezclador, formato y USB. */
export interface DeviceInfo {
  card: number | null;
  capture: StreamFormat | null;
  playback: StreamFormat | null;
  controls: MixerControl[];
  usb: UsbDevice[];
}

export async function getDevice(): Promise<DeviceInfo> {
  const res = await fetch("/api/device");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `error HTTP ${res.status}`);
  return body as DeviceInfo;
}

export async function setMixer(id: string, value: number): Promise<DeviceInfo> {
  const res = await fetch("/api/mixer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, value }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `error HTTP ${res.status}`);
  return body as DeviceInfo;
}
