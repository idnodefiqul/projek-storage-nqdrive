import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  brandColor: string;
  setBrandColor: (color: string) => void;
  setGradient: (from: string, to: string) => void;
  saveBrandColorToDb: (color: string) => void;
  saveThemeToDb: (theme: Theme) => void;
  isThemeSidebarOpen: boolean;
  setThemeSidebarOpen: (open: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "nqdrive-theme";
const BRAND_COLOR_KEY = "nqdrive-brand-color";
export const ACCENT_COLOR_KEY = "nqdrive-accent-color";
export const DEFAULT_BRAND = "#10b981";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

function getInitialBrandColor(): string {
  return localStorage.getItem(BRAND_COLOR_KEY) || DEFAULT_BRAND;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateBrandPalette(hex: string): Record<string, string> {
  const [h, s] = hexToHsl(hex);
  return {
    "--color-brand-50":  hslToHex(h, Math.min(s, 40), 97),
    "--color-brand-100": hslToHex(h, Math.min(s, 50), 93),
    "--color-brand-200": hslToHex(h, Math.min(s, 60), 85),
    "--color-brand-300": hslToHex(h, Math.min(s, 65), 72),
    "--color-brand-400": hslToHex(h, Math.min(s, 70), 60),
    "--color-brand-500": hex,
    "--color-brand-600": hslToHex(h, Math.min(s + 5, 100), 38),
    "--color-brand-700": hslToHex(h, Math.min(s + 5, 100), 30),
    "--color-brand-800": hslToHex(h, Math.min(s + 5, 100), 23),
    "--color-brand-900": hslToHex(h, Math.min(s + 5, 100), 18),
  };
}

/** Warna sekunder untuk gradient — geser hue agar terbentuk "campuran". */
function deriveAccent(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + 42) % 360, Math.min(s + 6, 100), l);
}

/** Accent eksplisit dari preset gradient (null kalau tema solid). */
function readExplicitAccent(): string | null {
  try {
    const v = localStorage.getItem(ACCENT_COLOR_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Ambil accent eksplisit (dari preset gradient) atau derive otomatis dari primary. */
function getAccent(primaryHex: string): string {
  return readExplicitAccent() ?? deriveAccent(primaryHex);
}

export function applyBrandColors(hex: string) {
  if (!hex || hex.length < 4) return;
  const palette = generateBrandPalette(hex);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
  // Dua warna dasar untuk gradient sidebar/topbar/canvas (ikut tema).
  const explicit = readExplicitAccent();
  const accent = explicit ?? deriveAccent(hex);
  root.style.setProperty("--brand-a", hex);
  root.style.setProperty("--brand-b", accent);
  // --brand-fill: gradient bila tema gradient, satu warna bila solid.
  root.style.setProperty(
    "--brand-fill",
    explicit ? `linear-gradient(160deg, ${hex}, ${explicit})` : `linear-gradient(${hex}, ${hex})`
  );
}

// Called from use-settings when DB data arrives
let _setBrandFromDb: ((color: string) => void) | null = null;
let _setThemeFromDb: ((theme: Theme) => void) | null = null;

export function applyBrandFromDb(brandColor: string, themeMode: string) {
  if (brandColor) {
    // Format: "primary:accent" (gradient) atau "primary" (solid).
    const parts = brandColor.split(":");
    const primary = parts[0] ?? brandColor;
    const accent = parts.length === 2 && parts[1] && /^#[0-9a-fA-F]{6}$/.test(parts[1]) ? parts[1] : null;
    try {
      localStorage.setItem(BRAND_COLOR_KEY, primary);
      if (accent) localStorage.setItem(ACCENT_COLOR_KEY, accent);
      else localStorage.removeItem(ACCENT_COLOR_KEY);
    } catch {}
    applyBrandColors(primary);
    _setBrandFromDb?.(primary);
  }
  if (themeMode === "light" || themeMode === "dark") {
    localStorage.setItem(STORAGE_KEY, themeMode);
    document.documentElement.classList.toggle("dark", themeMode === "dark");
    _setThemeFromDb?.(themeMode);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [brandColor, setBrandColorState] = useState(getInitialBrandColor);
  const [isThemeSidebarOpen, setThemeSidebarOpen] = useState(false);

  // Register callbacks for DB sync
  useEffect(() => {
    _setBrandFromDb = setBrandColorState;
    _setThemeFromDb = setTheme;
    return () => { _setBrandFromDb = null; _setThemeFromDb = null; };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyBrandColors(brandColor);
  }, [brandColor]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setBrandColor = useCallback((color: string) => {
    // Warna solid: hapus accent eksplisit → gradient auto-derive dari warna ini.
    try { localStorage.removeItem(ACCENT_COLOR_KEY); } catch {}
    setBrandColorState(color);
    localStorage.setItem(BRAND_COLOR_KEY, color);
    applyBrandColors(color);
  }, []);

  const setGradient = useCallback((from: string, to: string) => {
    // Preset gradient: simpan accent eksplisit (warna kedua).
    try { localStorage.setItem(ACCENT_COLOR_KEY, to); } catch {}
    setBrandColorState(from);
    localStorage.setItem(BRAND_COLOR_KEY, from);
    applyBrandColors(from);
  }, []);

  // These save to DB via the settings API (called from theme sidebar)
  const saveBrandColorToDb = useCallback((color: string) => {
    setBrandColor(color);
  }, [setBrandColor]);

  const saveThemeToDb = useCallback((t: Theme) => {
    setTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, brandColor, setBrandColor, setGradient, saveBrandColorToDb, saveThemeToDb, isThemeSidebarOpen, setThemeSidebarOpen }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
