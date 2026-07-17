import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, Cloud, ShieldCheck, Plug, ArrowRight, Layers, Zap, HardDrive,
} from "lucide-react";
import { SiDropbox, SiGoogledrive } from "@icons-pack/react-simple-icons";
import { PageTransition } from "../components/page-transition";
import { PageHeader } from "../components/ui-kit";
import { onedriveSvg } from "../assets";

export const Route = createFileRoute("/dashboard/documentation/")({
  component: DocumentationIndex,
});

const SITE = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";

const GUIDES = [
  {
    to: "/dashboard/documentation/google-drive",
    title: "Google Drive",
    tag: "OAuth 2.0",
    desc: "Buat OAuth Client di Google Cloud Console, aktifkan Drive API, dan hubungkan multi-akun ke storage pool.",
    icon: (props: { className?: string }) => <SiGoogledrive color="#1FA463" {...props} />,
    ring: "ring-[#1FA463]/30",
    glow: "bg-[#1FA463]/10",
  },
  {
    to: "/dashboard/documentation/drop-box",
    title: "Dropbox",
    tag: "OAuth 2.0 · Scoped App",
    desc: "Buat App di Dropbox App Console, atur permission & redirect URI, lalu hubungkan akun Dropbox dengan kuota nyata.",
    icon: (props: { className?: string }) => <SiDropbox color="#0061FF" {...props} />,
    ring: "ring-[#0061FF]/30",
    glow: "bg-[#0061FF]/10",
  },
  {
    to: "/dashboard/documentation/one-drive",
    title: "OneDrive",
    tag: "Microsoft OAuth 2.0",
    desc: "Buat App Registration di Azure Portal, atur API permissions & redirect URI, lalu hubungkan akun OneDrive dengan kuota nyata.",
    icon: (props: { className?: string }) => <img src={onedriveSvg} alt="" {...props} />,
    ring: "ring-[#0078d4]/30",
    glow: "bg-[#0078d4]/10",
  },
] as const;

const HIGHLIGHTS = [
  { icon: Layers, title: "Multi-Account Pool", desc: "Gabungkan banyak akun Google Drive & Dropbox jadi satu drive virtual." },
  { icon: ShieldCheck, title: "OAuth Aman", desc: "Refresh token dienkripsi. Tanpa menyimpan password akun Anda." },
  { icon: Zap, title: "Upload Mulus", desc: "Resumable upload session dengan progress bar tanpa jeda." },
  { icon: Plug, title: "Endpoint Cerdas", desc: "Satu endpoint mendeteksi provider (Drive/Dropbox) otomatis." },
];

function DocumentationIndex() {
  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="System"
          icon={BookOpen}
          title="Documentation"
          description={`Panduan resmi ${SITE} untuk menghubungkan layanan penyimpanan ke dashboard Anda — mulai dari menyiapkan kredensial API di provider hingga menghubungkannya ke storage pool.`}
        />

        {/* Guide cards */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            <Cloud className="h-4 w-4" /> Panduan Setup Storage
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {GUIDES.map((g) => {
              const Icon = g.icon;
              return (
                <Link
                  key={g.to}
                  to={g.to}
                  className={`group relative overflow-hidden rounded-2xl border border-zinc-200 bg-[rgb(var(--surface))] p-5 shadow-sm ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-md hover:${g.ring} dark:border-zinc-800`}
                >
                  <div className={`pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full ${g.glow} blur-2xl`} />
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-[rgb(var(--foreground))]">{g.title}</h3>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {g.tag}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--ink-500))]">{g.desc}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
                        Baca panduan
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Highlights */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            <HardDrive className="h-4 w-4" /> Kenapa {SITE}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <h.icon className="mb-2 h-5 w-5 text-brand-500" />
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{h.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--ink-500))]">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Belum menghubungkan storage? Buka{" "}
            <Link to="/dashboard/storage-manager" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Google Drive</Link>{" "}
            atau{" "}
            <Link to="/dashboard/dropbox" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Dropbox</Link>{" "}
            di menu Storage untuk mulai menambahkan akun.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
