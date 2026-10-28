// SPDX-License-Identifier: GPL-2.0-or-later
import {
  MIN_DB,
  describeError,
  listInputs,
  preferredInput,
  startMeter,
  unlockLabels,
  type InputInfo,
  type MeterHandle,
  type MeterReading,
} from "../audio/meter";

const NOISE_WINDOW_MS = 10_000;
const TEXT_EVERY_N_FRAMES = 6;
const SPECTRUM_MIN_HZ = 20;
const SPECTRUM_MAX_HZ = 20_000;
const AUDIO_BUTTON_LABEL = "Encender audio";

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function fmtDb(db: number): string {
  return db <= MIN_DB ? "−∞" : db.toFixed(1).replace("-", "−");
}

function sizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return canvas.getContext("2d");
}

function drawLevel(canvas: HTMLCanvasElement, rmsDb: number, peakDb: number, clipped: boolean) {
  const g = sizeCanvas(canvas);
  if (!g) return;
  const { width: w, height: h } = canvas;
  const x = (db: number) => Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB)) * w;
  g.clearRect(0, 0, w, h);
  g.fillStyle = css("--line");
  g.fillRect(0, 0, w, h);
  g.fillStyle = clipped ? "#ff4d4d" : css("--accent");
  g.fillRect(0, 0, x(rmsDb), h);
  g.fillStyle = css("--text");
  g.fillRect(Math.max(0, x(peakDb) - 2), 0, 2, h);
}

function drawSpectrum(canvas: HTMLCanvasElement, reading: MeterReading) {
  const g = sizeCanvas(canvas);
  if (!g) return;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);

  g.strokeStyle = css("--line");
  g.lineWidth = 1;
  g.beginPath();
  for (const db of [-20, -40, -60, -80]) {
    const y = (1 - (db - MIN_DB) / -MIN_DB) * h;
    g.moveTo(0, y);
    g.lineTo(w, y);
  }
  g.stroke();

  const nyquist = reading.sampleRate / 2;
  const bins = reading.spectrum.length;
  const ratio = SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ;
  g.strokeStyle = css("--accent");
  g.lineWidth = Math.max(1, window.devicePixelRatio || 1);
  g.beginPath();
  for (let px = 0; px < w; px++) {
    const hz = SPECTRUM_MIN_HZ * Math.pow(ratio, px / (w - 1));
    const bin = Math.min(bins - 1, Math.round((hz / nyquist) * bins));
    const db = Math.max(MIN_DB, reading.spectrum[bin]);
    const y = (1 - (db - MIN_DB) / -MIN_DB) * h;
    if (px === 0) g.moveTo(px, y);
    else g.lineTo(px, y);
  }
  g.stroke();
}

export function mountMeter(root: HTMLElement, onAudioLevel: (level: number, active: boolean) => void = () => {}) {
  const title = document.createElement("h2");
  title.textContent = "Audio en vivo";
  title.style.cssText = "font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;";

  const select = document.createElement("select");
  select.style.cssText = "width:100%;margin-bottom:8px;padding:8px;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:8px;font:inherit;font-size:12px;";
  select.hidden = true;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = AUDIO_BUTTON_LABEL;
  button.style.cssText = "padding:9px 14px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;margin-bottom:10px;font:inherit;font-size:13px;font-weight:600;";

  const info = document.createElement("p");
  info.style.cssText = "color:var(--muted);margin:0 0 10px;font-size:12px;";
  info.textContent = "El nivel sincroniza el brillo LED del visor y del micrófono. El audio solo se mide; no se graba ni se transmite.";

  const level = document.createElement("canvas");
  level.style.cssText = "width:100%;height:14px;display:block;border-radius:3px;margin-bottom:6px;";
  const readout = document.createElement("p");
  readout.style.cssText = "margin:0 0 10px;font-size:13px;font-variant-numeric:tabular-nums;";
  const spectrum = document.createElement("canvas");
  spectrum.style.cssText = "width:100%;height:120px;display:block;border:1px solid var(--line);border-radius:6px;";
  const axis = document.createElement("p");
  axis.style.cssText = "display:flex;justify-content:space-between;color:var(--muted);margin:4px 0 0;font-size:11px;";
  axis.append(...["20 Hz", "200 Hz", "2 kHz", "20 kHz"].map((t) => Object.assign(document.createElement("span"), { textContent: t })));
  const visualizations = document.createElement("div");
  visualizations.append(level, readout, spectrum, axis);
  visualizations.hidden = true;

  root.replaceChildren(title, button, select, info, visualizations);

  let handle: MeterHandle | null = null;
  let history: { t: number; rms: number }[] = [];
  let frames = 0;
  let starting = false;
  let smoothedLevel = 0;

  const describeInfo = (i: InputInfo) => {
    const flag = (v: boolean | undefined) => (v === undefined ? "?" : v ? "sí" : "no");
    return `${i.label || "micrófono"}: ${i.sampleRate} Hz, ${i.channelCount} can. · eco ${flag(i.echoCancellation)}, ruido ${flag(i.noiseSuppression)}, auto-ganancia ${flag(i.autoGainControl)}`;
  };

  const onFrame = (r: MeterReading) => {
    const targetLevel = Math.max(0, Math.min(1, (r.rmsDb + 65) / 55));
    smoothedLevel += (targetLevel - smoothedLevel) * (targetLevel > smoothedLevel ? 0.42 : 0.16);
    onAudioLevel(smoothedLevel, true);
    const now = performance.now();
    history.push({ t: now, rms: r.rmsDb });
    history = history.filter((p) => now - p.t <= NOISE_WINDOW_MS);
    drawLevel(level, r.rmsDb, r.peakDb, r.clipped);
    drawSpectrum(spectrum, r);
    if (frames++ % TEXT_EVERY_N_FRAMES === 0) {
      const floor = Math.min(...history.map((p) => p.rms));
      readout.textContent =
        `RMS ${fmtDb(r.rmsDb)} dBFS · pico ${fmtDb(r.peakDb)} dBFS · mínimo 10 s ${fmtDb(floor)} dBFS` +
        (r.clipped ? " · ¡SATURA!" : "");
      readout.style.color = r.clipped ? "#ff4d4d" : "var(--text)";
    }
  };

  const stop = () => {
    handle?.stop();
    handle = null;
    onAudioLevel(0, false);
    button.textContent = AUDIO_BUTTON_LABEL;
    button.style.background = "var(--accent)";
    button.style.color = "#fff";
    visualizations.hidden = true;
  };

  const start = async (deviceId?: string) => {
    if (starting) return;
    starting = true;
    button.disabled = true;
    button.textContent = "Activando…";
    stop();
    button.disabled = true;
    button.textContent = "Activando…";
    try {
      if (!deviceId) {
        await unlockLabels();
        const devices = await listInputs();
        select.replaceChildren(
          ...devices.map((d) => Object.assign(document.createElement("option"), { value: d.deviceId, textContent: d.label || d.deviceId })),
        );
        select.hidden = false;
        deviceId = preferredInput(devices) ?? devices[0]?.deviceId;
        if (deviceId) select.value = deviceId;
      }
      history = [];
      smoothedLevel = 0;
      handle = await startMeter(deviceId, onFrame);
      info.textContent = describeInfo(handle.info);
      button.textContent = "Apagar audio";
      button.style.background = "var(--ok-bg)";
      button.style.color = "var(--ok-text)";
      visualizations.hidden = false;
    } catch (e) {
      info.textContent = describeError(e);
      button.textContent = AUDIO_BUTTON_LABEL;
    } finally {
      starting = false;
      button.disabled = false;
    }
  };

  button.addEventListener("click", () => (handle ? stop() : void start()));
  select.addEventListener("change", () => void start(select.value));
  window.addEventListener("pagehide", stop);
}
