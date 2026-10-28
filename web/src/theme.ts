// SPDX-License-Identifier: GPL-2.0-or-later
/** Tema claro/oscuro: la elección guardada manda; si no hay, la del sistema. */
export type Theme = "light" | "dark";

const STORAGE_KEY = "quadcast-s.theme";
const query = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // sin almacenamiento solo se pierde el recuerdo de la elección
  }
}

let current: Theme = stored() ?? (query.matches ? "dark" : "light");
const listeners = new Set<(theme: Theme) => void>();

function apply(theme: Theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  listeners.forEach((fn) => fn(theme));
}

export const theme = {
  get: () => current,
  /** El usuario elige un tema: se recuerda. */
  set(next: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ver `stored`
    }
    apply(next);
  },
  toggle() {
    theme.set(current === "dark" ? "light" : "dark");
  },
  subscribe(fn: (theme: Theme) => void) {
    listeners.add(fn);
    fn(current);
    return () => listeners.delete(fn);
  },
};

// Mientras no haya una elección guardada, se sigue al sistema.
query.addEventListener("change", (e) => {
  if (!stored()) apply(e.matches ? "dark" : "light");
});
document.documentElement.dataset.theme = current;
