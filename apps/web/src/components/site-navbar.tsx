import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Moon, Sun, Menu, X, Shield, LayoutDashboard, LogIn } from "lucide-react";
import { Button, AnimatedThemeToggle } from "@nqdrive/ui";
import { useTheme } from "../stores/theme-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { logoMainPng } from "../assets";

interface SiteNavbarProps {
  isAuthenticated?: boolean;
  /** Konten opsional di sisi kanan navbar (mis. toggle List/Grid di halaman folder). */
  rightContent?: ReactNode;
}

/**
 * Navbar utama aplikasi � sumber tunggal header untuk Home Page maupun
 * halaman publik lain (mis. Shared Folder Page) agar brand konsisten.
 * Style, animasi, dan logic dark/light identik dengan versi Home Page asli.
 */
export function SiteNavbar({ isAuthenticated = false, rightContent }: SiteNavbarProps) {
  const { theme, toggleTheme, brandColor } = useTheme();
  const updateSettings = useUpdateSettings();
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleToggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    toggleTheme();
    if (isAuthenticated) {
      updateSettings.mutate({ theme_mode: next, brand_color: brandColor });
    }
  };

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 20);
  });

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const menuItem = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
  };

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-6 transition-all duration-300 ${
          isScrolled
            ? "bg-white/70 backdrop-blur-md border-b border-zinc-200 dark:bg-zinc-950/70 dark:border-white/10 shadow-sm"
            : "bg-transparent border-transparent"
        }`}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center">
          <img src={logoMainPng} alt="Logo" className="h-9 w-auto object-contain" />
        </div>

        <nav className="hidden items-center gap-3 sm:flex">
          {rightContent}
          <Link to="/privacy-policy" className="text-sm font-medium text-zinc-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400">
            Privacy Policy
          </Link>
          <AnimatedThemeToggle theme={theme} onToggle={handleToggleTheme} />
          {isAuthenticated ? (
            <Link to="/dashboard">
              <Button variant="default" className="rounded-full px-5 shadow-md shadow-brand-500/20">
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="default" className="rounded-full px-5 shadow-md shadow-brand-500/20">
                Login
              </Button>
            </Link>
          )}
        </nav>

        <div className="flex sm:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="rounded-full">
            <Menu className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
          </Button>
        </div>
      </motion.header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-white/95 backdrop-blur-md dark:bg-zinc-950/95 sm:hidden">
          <div className="flex h-16 items-center justify-between px-6">
            <img src={logoMainPng} alt="Logo" className="h-9 w-auto object-contain" />
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="rounded-full">
              <X className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            </Button>
          </div>
          <motion.nav
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
              show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
              hidden: { opacity: 0 }
            }}
            className="flex flex-col gap-6 p-8"
          >
            <motion.div variants={menuItem}>
              {isAuthenticated ? (
                <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  <LayoutDashboard className="h-6 w-6 text-brand-500" /> Dashboard
                </Link>
              ) : (
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  <LogIn className="h-6 w-6 text-brand-500" /> Login
                </Link>
              )}
            </motion.div>
            <motion.div variants={menuItem}>
              <Link to="/privacy-policy" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                <Shield className="h-6 w-6 text-brand-500" /> Privacy Policy
              </Link>
            </motion.div>
            <motion.div variants={menuItem} className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => { handleToggleTheme(); setMobileMenuOpen(false); }} className="flex w-full items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {theme === "light" ? <Moon className="h-6 w-6 text-brand-500" /> : <Sun className="h-6 w-6 text-brand-500" />}
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </button>
            </motion.div>
          </motion.nav>
        </div>
      )}
    </>
  );
}
