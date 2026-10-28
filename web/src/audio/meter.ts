// SPDX-License-Identifier: GPL-2.0-or-later
/**
 * Captura y análisis del audio del micrófono, todo en el navegador: nada se graba
 * ni se envía a ningún sitio. Se desactivan el procesado del navegador (eco, ruido,
 * ganancia automática) para medir lo que entrega el micrófono, no una versión retocada.
 */

export const MIN_DB = -100;

export interface MeterReading {
  rmsDb: number;
  peakDb: number;
  clipped: boolean;
  /** Espectro en dB, un valor por contenedor FFT. */
  spectrum: Float32Array;
  sampleRate: number;
}

export interface InputInfo {
  label: string;
  sampleRate: number;
  channelCount: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface MeterHandle {
  info: InputInfo;
  stop(): void;
}

/** Algunos navegadores devuelven estos ajustes como texto; solo nos sirve un booleano. */
function onlyBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

export function toDb(amplitude: number): number {
  return amplitude > 1e-5 ? 20 * Math.log10(amplitude) : MIN_DB;
}

/** El navegador oculta los nombres de los dispositivos hasta que se concede permiso una vez. */
export async function unlockLabels(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

export async function listInputs(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput" && d.deviceId !== "");
}

export function preferredInput(devices: MediaDeviceInfo[]): string | undefined {
  return devices.find((d) => /quadcast/i.test(d.label))?.deviceId;
}

export function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "Permiso denegado: permite el micrófono en el navegador.";
  if (name === "NotFoundError") return "No se encontró ese micrófono.";
  if (name === "NotReadableError") return "El micrófono está en uso por otra aplicación.";
  return e instanceof Error ? e.message : "Error desconocido";
}

export async function startMeter(
  deviceId: string | undefined,
  onFrame: (reading: MeterReading) => void,
): Promise<MeterHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    },
  });

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = MIN_DB;
  analyser.maxDecibels = 0;
  // Solo al analizador, nunca a los altavoces: evita la realimentación.
  ctx.createMediaStreamSource(stream).connect(analyser);

  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings();
  const time = new Float32Array(analyser.fftSize);
  const spectrum = new Float32Array(analyser.frequencyBinCount);

  let running = true;
  let frame = 0;
  const tick = () => {
    if (!running) return;
    analyser.getFloatTimeDomainData(time);
    analyser.getFloatFrequencyData(spectrum);
    let sum = 0;
    let peak = 0;
    for (const v of time) {
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    onFrame({
      rmsDb: toDb(Math.sqrt(sum / time.length)),
      peakDb: toDb(peak),
      clipped: peak >= 0.999,
      spectrum,
      sampleRate: ctx.sampleRate,
    });
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    info: {
      label: track.label,
      sampleRate: settings.sampleRate ?? ctx.sampleRate,
      channelCount: settings.channelCount ?? 1,
      echoCancellation: onlyBoolean(settings.echoCancellation),
      noiseSuppression: onlyBoolean(settings.noiseSuppression),
      autoGainControl: onlyBoolean(settings.autoGainControl),
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
