import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BookOpen, Github, LayoutDashboard, LogIn } from "lucide-react";
import { logoMainPng } from "../assets";

interface SiteFooterProps {
  isAuthenticated?: boolean;
  /** Konten opsional tambahan di kanan footer untuk page publik. */
  rightExtra?: ReactNode;
}

/** Footer utama aplikasi — diekstrak dari Home Page tanpa mengubah style. */
export function SiteFooter({ isAuthenticated = false, rightExtra }: SiteFooterProps) {
  return (
    <footer className="w-full border-t border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950 mt-12 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col items-center md:items-start gap-1">
          <img src={logoMainPng} alt="Logo" className="h-8 w-auto object-contain" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Secure Cloud Storage &copy; {new Date().getFullYear()}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {isAuthenticated ? (
            <Link to="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400 transition-colors">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400 transition-colors">
              <LogIn className="h-3.5 w-3.5" />
              Login
            </Link>
          )}
          <Link to="/docs" className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400 transition-colors">
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
          </Link>
          {rightExtra}
          <a href="#" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="GitHub">
            <Github className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
