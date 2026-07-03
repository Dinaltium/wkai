import { create } from "zustand";

// Theme engine: light/dark mode + a user-customizable accent color.
// Tokens live as CSS variables (see index.css); this writes to them and persists.

export type ThemeMode = "dark" | "light";

const MODE_KEY = "wkai_theme_mode";
const ACCENT_KEY = "wkai_theme_accent";
export const DEFAULT_ACCENT = "#14b8a6"; // teal

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Teal", hex: "#14b8a6" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Orange", hex: "#f97316" },
];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]: RGB): number {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

// Blend rgb toward a grayscale target (0=black, 255=white) by amt (0..1).
function towards([r, g, b]: RGB, target: number, amt: number): RGB {
  return [r, g, b].map((v) => Math.round(v + (target - v) * amt)) as RGB;
}

function applyAccent(hex: string, mode: ThemeMode) {
  const rgb = hexToRgb(hex);
  const lum = relLuminance(rgb);
  // Text on an accent fill: dark if the accent is bright, else near-white.
  const fg: RGB = lum > 0.45 ? [8, 10, 12] : [250, 250, 250];
  // Accent used as text/icon on the page background: keep it legible.
  let text: RGB = rgb;
  if (mode === "light") {
    text = lum > 0.3 ? towards(rgb, 0, 0.4) : rgb; // darken on light pages
  } else {
    text = lum < 0.25 ? towards(rgb, 255, 0.45) : rgb; // lighten very dark accents on dark pages
  }
  const s = document.documentElement.style;
  s.setProperty("--accent", rgb.join(" "));
  s.setProperty("--accent-fg", fg.join(" "));
  s.setProperty("--accent-text", text.join(" "));
}

function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("light", mode === "light");
}

function storedMode(): ThemeMode {
  return localStorage.getItem(MODE_KEY) === "light" ? "light" : "dark";
}
function storedAccent(): string {
  return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT;
}

/** Apply persisted theme before first paint. Call once in main.tsx. */
export function initTheme() {
  const mode = storedMode();
  applyMode(mode);
  applyAccent(storedAccent(), mode);
}

interface ThemeState {
  mode: ThemeMode;
  accent: string;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (hex: string) => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: storedMode(),
  accent: storedAccent(),
  setMode: (mode) => {
    localStorage.setItem(MODE_KEY, mode);
    applyMode(mode);
    applyAccent(get().accent, mode); // accent-text depends on mode
    set({ mode });
  },
  toggleMode: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
  setAccent: (accent) => {
    localStorage.setItem(ACCENT_KEY, accent);
    applyAccent(accent, get().mode);
    set({ accent });
  },
}));
