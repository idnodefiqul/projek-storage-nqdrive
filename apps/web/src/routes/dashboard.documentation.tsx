import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen, KeyRound, Cloud, ShieldAlert, CheckCircle2,
  Copy, ArrowRight, ExternalLink, Info, AlertTriangle, FileJson,
  ListChecks, Plug,
} from "lucide-react";
import { useToast } from "@nqdrive/ui";
import { PageTransition } from "../components/page-transition";

export const Route = createFileRoute("/dashboard/documentation")({
  component: DocumentationPage,
});

const SECTION_NAV = [
  { id: "pengantar", label: "Pengantar" },
  { id: "prasyarat", label: "Prasyarat" },
  { id: "buat-project", label: "1. Buat Project Google Cloud" },
  { id: "aktifkan-api", label: "2. Aktifkan Google Drive API" },
  { id: "oauth-consent", label: "3. Konfigurasi OAuth Consent" },
  { id: "buat-kredensial", label: "4. Buat Kredensial & Secret" },
  { id: "hubungkan", label: "5. Hubungkan ke NQDRIVE" },
  { id: "troubleshoot", label: "Troubleshooting" },
];

const CONSOLE_URL = "https://console.cloud.google.com";

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white shadow-sm shadow-brand-500/30">
      {n}
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <StepNumber n={n} />
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
      </div>
    </div>
  );
}

function Callout({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning";
  children: ReactNode;
}) {
  const isWarning = variant === "warning";
  return (
    <div
      className={`flex gap-3 rounded-xl border p-4 text-sm ${
        isWarning
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
      }`}
    >
      {isWarning ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function CodeBlock({ code, filename }: { code: string; filename?: string }) {
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(code);
    toast({ title: "Tersalin ke clipboard", variant: "success" });
  };
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900 dark:border-zinc-800">
      {filename && (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/60 px-4 py-2 text-xs font-medium text-zinc-400">
          <FileJson className="h-3.5 w-3.5 text-brand-400" />
          {filename}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-100">
          <code className="font-mono">{code}</code>
        </pre>
        <button
          onClick={copy}
          className="absolute right-2 top-2 rounded-md bg-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
          aria-label="Salin"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      {children}
    </section>
  );
}

function DocumentationPage() {
  const [active, setActive] = useState(SECTION_NAV[0]?.id ?? "pengantar");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    SECTION_NAV.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-2xl">
              Documentation
            </h1>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Panduan resmi {import.meta.env.VITE_SITE_NAME || "NQDRIVE"} untuk menghubungkan layanan penyimpanan ke dashboard Anda.
            Halaman ini berfokus pada penyiapan Google Drive melalui Google Cloud Console untuk mendapatkan kredensial & secret API.
          </p>
        </div>

        {/* Layout: TOC + content */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
          {/* Table of contents */}
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Daftar Isi
              </p>
              <nav className="flex flex-col gap-0.5">
                {SECTION_NAV.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      active === item.id
                        ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 space-y-10">
            <Section id="pengantar">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                <BookOpen className="h-4 w-4 text-brand-500" /> Pengantar
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {import.meta.env.VITE_SITE_NAME || "NQDRIVE"} memungkinkan Anda menyatukan berbagai layanan cloud menjadi satu
                virtual drive. Untuk menambahkan Google Drive, Anda perlu membuat kredensial dari{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Google Cloud Console</span> lalu menghubungkannya
                melalui menu <span className="font-medium text-zinc-800 dark:text-zinc-200">Storage Manager &rsaquo; Google Drive</span>.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <Cloud className="mb-2 h-5 w-5 text-brand-500" />
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Penyimpanan Tak Terbatas</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Gabungkan kapasitas beberapa akun.</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <ShieldAlert className="mb-2 h-5 w-5 text-brand-500" />
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">OAuth Aman</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Tanpa menyimpan password akun.</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <Plug className="mb-2 h-5 w-5 text-brand-500" />
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Sinkron Mudah</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Cukup unggah file JSON kredensial.</p>
                </div>
              </div>
            </Section>

            <Section id="prasyarat">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                <ListChecks className="h-4 w-4 text-brand-500" /> Prasyarat
              </h2>
              <ul className="ml-5 list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li>Akun Google dengan akses ke <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Google Cloud Console <ExternalLink className="h-3 w-3" /></a>.</li>
                <li>Project aktif di Google Cloud (atau buat project baru — lihat langkah 1).</li>
                <li>Akses ke dashboard {import.meta.env.VITE_SITE_NAME || "NQDRIVE"} dengan hak admin.</li>
              </ul>
              <Callout>
                Menggunakan akun Google Workspace? Pastikan admin memungkinkan aplikasi pihak ketiga melalui layar persetujuan
                (OAuth consent) agar koneksi tidak diblokir.
              </Callout>
            </Section>

            <Section id="buat-project">
              <Step n={1} title="Buat Project Google Cloud">
                <ol className="ml-5 list-decimal space-y-1.5">
                  <li>
                    Buka <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">console.cloud.google.com <ExternalLink className="h-3 w-3" /></a> dan login dengan akun Google Anda.
                  </li>
                  <li>
                    Klik dropdown pilih project di pojok kiri atas, lalu pilih <span className="font-medium">New Project</span>.
                  </li>
                  <li>
                    Isi <span className="font-medium">Project name</span> (mis. <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">NQDRIVE-Storage</code>), lalu klik <span className="font-medium">Create</span>.
                  </li>
                  <li>Buka project yang baru dibuat dari dropdown tersebut.</li>
                </ol>
              </Step>
            </Section>

            <Section id="aktifkan-api">
              <Step n={2} title="Aktifkan Google Drive API">
                <ol className="ml-5 list-decimal space-y-1.5">
                  <li>Pada menu sebelah kiri, buka <span className="font-medium">APIs &amp; Services &rsaquo; Library</span>.</li>
                  <li>Cari <span className="font-medium">Google Drive API</span> pada kotak pencarian.</li>
                  <li>Klik hasilnya, lalu tekan <span className="font-medium">Enable</span>.</li>
                </ol>
                <Callout variant="warning">
                  API tidak akan berfungsi jika belum di-<span className="font-medium">Enable</span>. Pastikan status menunjukkan
                  &ldquo;API enabled&rdquo; sebelum melanjutkan.
                </Callout>
              </Step>
            </Section>

            <Section id="oauth-consent">
              <Step n={3} title="Konfigurasi OAuth Consent Screen">
                <ol className="ml-5 list-decimal space-y-1.5">
                  <li>Buka <span className="font-medium">APIs &amp; Services &rsaquo; OAuth consent screen</span>.</li>
                  <li>Pilih tipe pengguna: <span className="font-medium">External</span> (atau <span className="font-medium">Internal</span> untuk Google Workspace).</li>
                  <li>Isi <span className="font-medium">App name</span>, <span className="font-medium">User support email</span>, dan <span className="font-medium">Developer contact</span>.</li>
                  <li>Di bagian <span className="font-medium">Scopes</span>, tambahkan <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">/auth/drive</code> (full drive access) atau <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">/auth/drive.file</code> (per-file).</li>
                  <li>Simpan dan (jika External) tambahkan email uji ke <span className="font-medium">Test users</span>, lalu publikasikan bila diperlukan.</li>
                </ol>
              </Step>
            </Section>

            <Section id="buat-kredensial">
              <Step n={4} title="Buat Kredensial & Dapatkan Secret API">
                <p className="!mt-0">
                  {import.meta.env.VITE_SITE_NAME || "NQDRIVE"} menggunakan <span className="font-medium">Service Account</span> berupa file JSON.
                  Ikuti langkah berikut untuk menghasilkan <span className="font-medium">client secret</span>:
                </p>
                <ol className="ml-5 list-decimal space-y-1.5">
                  <li>Buka <span className="font-medium">APIs &amp; Services &rsaquo; Credentials</span>.</li>
                  <li>Klik <span className="font-medium">Create Credentials &rsaquo; Service Account</span>.</li>
                  <li>Isi <span className="font-medium">Service account name</span> dan <span className="font-medium">ID</span>, lalu <span className="font-medium">Create &amp; Continue</span>.</li>
                  <li>Abaikan grant akses role, lalu <span className="font-medium">Done</span>.</li>
                  <li>Klik service account yang baru dibuat &rsaquo; tab <span className="font-medium">Keys</span> &rsaquo; <span className="font-medium">Add Key &rsaquo; Create new key</span>.</li>
                  <li>Pilih format <span className="font-medium">JSON</span>, lalu <span className="font-medium">Create</span>. File akan otomatis terunduh.</li>
                </ol>
                <p>Di dalam file JSON tersebut Anda akan menemukan <span className="font-mono text-xs">client_id</span>, <span className="font-mono text-xs">client_email</span>, dan <span className="font-mono text-xs">private_key</span>. Inilah &ldquo;secret&rdquo; yang dibutuhkan NQDRIVE:</p>
                <CodeBlock
                  filename="nqdrive-service-account.json"
                  code={`{
  "type": "service_account",
  "project_id": "nqdrive-storage",
  "private_key_id": "abcd1234...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "nqdrive@nqdrive-storage.iam.gserviceaccount.com",
  "client_id": "1234567890.apps.googleusercontent.com",
  "token_uri": "https://oauth2.googleapis.com/token"
}`}
                />
                <Callout>
                  <span className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Simpan file dengan aman.</span>
                  File JSON berisi kredensial penuh. Jangan membagikannya ke publik atau menyimpannya di repositori terbuka.
                  NQDRIVE hanya memintanya sekali saat menghubungkan akun.
                </Callout>
              </Step>
            </Section>

            <Section id="hubungkan">
              <Step n={5} title="Hubungkan ke NQDRIVE">
                <ol className="ml-5 list-decimal space-y-1.5">
                  <li>
                    Di dashboard, buka <Link to="/dashboard/storage-manager" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Storage Manager &rsaquo; Google Drive <ArrowRight className="h-3 w-3" /></Link>.
                  </li>
                  <li>Klik <span className="font-medium">Add Node</span> / <span className="font-medium">Connect Google Drive</span>.</li>
                  <li>Unggah file JSON kredensial Service Account yang diunduh pada langkah 4.</li>
                  <li>Tunggu proses sinkronisasi kapasitas awal selesai (biasanya beberapa detik).</li>
                  <li>Status berubah menjadi <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Connected</span>.</li>
                </ol>
              </Step>
            </Section>

            <Section id="troubleshoot">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                <AlertTriangle className="h-4 w-4 text-brand-500" /> Troubleshooting
              </h2>
              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">API tidak ditemukan / 403 Forbidden</p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Pastikan Google Drive API sudah di-<span className="font-medium">Enable</span> pada project yang sama dengan kredensial.</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Access blocked / perlu verifikasi</p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tambahkan email Anda ke <span className="font-medium">Test users</span> pada OAuth consent screen, atau publikasikan aplikasi.</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">File JSON gagal diunggah</p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Pastikan format JSON valid dan diunduh langsung dari Google Cloud Console, bukan diedit manual.</p>
                </div>
              </div>
            </Section>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Butuh bantuan lain? Lihat panduan penyimpanan lainnya di menu{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">Storage Manager</span>, atau hubungi tim dukungan{" "}
                {import.meta.env.VITE_SITE_NAME || "NQDRIVE"}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
