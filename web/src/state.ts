/** Corrección para que los colores mezclados se vean bien en los LED reales. */
export interface Calibration {
  /** Exponente aplicado a cada canal. 1 = sin corrección; ~2,2 compensa el gamma de pantalla. */
  gamma: number;
  /** Ganancia de rojo, verde y azul, de 0 a 100. */
  gains: [number, number, number];
}

export interface LightState extends Calibration {
  /** Color en formato `#rrggbb`. */
  color: string;
  /** Brillo de 0 a 100, igual que `quadcast-s color --brightness`. */
  brightness: number;
}

export const NEUTRAL_CALIBRATION: Calibration = { gamma: 1, gains: [100, 100, 100] };

type Listener = (state: LightState) => void;

export function createStore(initial: LightState) {
  let state = initial;
  const listeners = new Set<Listener>();

  return {
    get: () => state,
    set(patch: Partial<LightState>) {
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn: Listener) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
  };
}

export type Store = ReturnType<typeof createStore>;

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Mismo cálculo que `apply_brightness` en `src/protocol.rs`: división entera por canal. */
export function applyBrightness(hex: string, brightness: number): [number, number, number] {
  const percent = Math.min(Math.max(Math.round(brightness), 0), 100);
  return channels(hex).map((c) => Math.floor((c * percent) / 100)) as [number, number, number];
}

/** Aplica gamma y ganancia por canal. Es lo que se envía al micrófono; la vista 3D usa el color sin corregir. */
export function correctColor(hex: string, { gamma, gains }: Calibration): string {
  const out = channels(hex).map((c, i) => {
    const v = Math.round(255 * Math.pow(c / 255, gamma) * (gains[i] / 100));
    return Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

const STORAGE_KEY = "quadcast.calibration";

export function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return NEUTRAL_CALIBRATION;
    const c = JSON.parse(raw) as Partial<Calibration>;
    const gainsOk = Array.isArray(c.gains) && c.gains.length === 3 && c.gains.every((g) => Number.isFinite(g));
    if (typeof c.gamma !== "number" || !Number.isFinite(c.gamma) || !gainsOk) return NEUTRAL_CALIBRATION;
    return { gamma: c.gamma, gains: c.gains as [number, number, number] };
  } catch {
    return NEUTRAL_CALIBRATION; // sin almacenamiento o datos corruptos
  }
}

export function saveCalibration(c: Calibration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    // sin almacenamiento: la calibración simplemente no se recuerda
  }
}
