import { useState, useEffect } from "react";
import { X, Check, RotateCcw } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Button, useToast } from "@nqdrive/ui";
import { useTheme, DEFAULT_BRAND } from "../stores/theme-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { motion, AnimatePresence } from "framer-motion";

const PRESET_COLORS = [
  { label: "Default", hex: "#10b981" },
  { label: "Blue", hex: "#3b82f6" },
  { label: "Violet", hex: "#8b5cf6" },
  { label: "Rose", hex: "#f43f5e" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Cyan", hex: "#06b6d4" },
  { label: "Indigo", hex: "#6366f1" },
  { label: "Pink", hex: "#ec4899" },
  { label: "Teal", hex: "#14b8a6" },
  { label: "Orange", hex: "#f97316" },
  { label: "Lime", hex: "#84cc16" },
  { label: "Sky", hex: "#0ea5e9" },
];

// Smooth spring-like easing for professional feel
const PANEL_TRANSITION = {
  type: "tween" as const,
  ease: [0.32, 0.72, 0, 1],
  duration: 0.45,
};

const BACKDROP_TRANSITION = {
  type: "tween" as const,
  ease: [0.4, 0, 0.2, 1],
  duration: 0.35,
};

const CONTENT_TRANSITION = {
  type: "tween" as const,
  ease: [0.32, 0.72, 0, 1],
  duration: 0.35,
  delay: 0.08,
};

export function ThemeSidebar() {
  const { brandColor, setBrandColor, theme, isThemeSidebarOpen, setThemeSidebarOpen } = useTheme();
  const [localColor, setLocalColor] = useState(brandColor);
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  useEffect(() => {
    if (isThemeSidebarOpen) {
      setLocalColor(brandColor);
    }
  }, [isThemeSidebarOpen, brandColor]);

  const handleClose = () => setThemeSidebarOpen(false);

  const handleSave = () => {
    setBrandColor(localColor);
    updateSettings.mutate(
      { brand_color: localColor, theme_mode: theme },
      {
        onSuccess: () => toast({ title: "Theme disimpan", description: "Warna tema berhasil diperbarui." }),
        onError: () => toast({ title: "Gagal", description: "Gagal menyimpan tema." }),
      }
    );
    handleClose();
  };

  const handleReset = () => setLocalColor(DEFAULT_BRAND);

  return (
    <AnimatePresence mode="wait">
      {isThemeSidebarOpen && (
        <>
          {/* Backdrop — z-[70] to cover all sidebars and nav */}
          <motion.div
            key="theme-backdrop"
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={handleClose}
          />

          {/* Sidebar panel from right — z-[71] above backdrop */}
          <motion.div
            key="theme-panel"
            className="fixed right-0 top-0 bottom-0 z-[71] w-72 sm:w-96 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col"
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={PANEL_TRANSITION}
            style={{ willChange: "transform, opacity" }}
          >
            {/* Header */}
            <motion.div
              className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={CONTENT_TRANSITION}
            >
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Theme</h2>
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>

            {/* Content */}
            <motion.div
              className="flex-1 overflow-y-auto p-4 space-y-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ ...CONTENT_TRANSITION, delay: 0.12 }}
            >
              {/* Color Picker */}
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3">Pilih Warna</p>
                <div className="flex justify-center">
                  <HexColorPicker color={localColor} onChange={setLocalColor} style={{ width: "100%", height: 180 }} />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-700 shrink-0" style={{ backgroundColor: localColor }} />
                  <input
                    type="text"
                    value={localColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setLocalColor(v);
                    }}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-brand-500"
                    maxLength={7}
                  />
                  <button
                    onClick={handleReset}
                    className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Reset ke default"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Preset Colors */}
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3">Warna Preset</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() => setLocalColor(preset.hex)}
                      className={`group relative flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all border-2 ${
                        localColor.toLowerCase() === preset.hex.toLowerCase()
                          ? "border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800"
                          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <div
                        className="h-8 w-8 rounded-full shadow-sm ring-1 ring-black/10"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{preset.label}</span>
                      {localColor.toLowerCase() === preset.hex.toLowerCase() && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check className="h-3 w-3 text-zinc-900 dark:text-zinc-100" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3">Preview</p>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: localColor }}>Primary Button</div>
                    <div className="rounded-lg px-3 py-1.5 text-xs font-medium border" style={{ borderColor: localColor, color: localColor }}>Outline</div>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full w-2/3" style={{ backgroundColor: localColor }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: localColor }} />
                    <span className="text-xs" style={{ color: localColor }}>Brand text color</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Footer */}
            <motion.div
              className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ ...CONTENT_TRANSITION, delay: 0.15 }}
            >
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Batal
              </Button>
              <Button onClick={handleSave} className="flex-1" disabled={updateSettings.isPending}>
                <Check className="h-4 w-4" />
                Simpan
              </Button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}