import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, ListChecks, ExternalLink, ArrowRight, CheckCircle2, AlertTriangle,
  KeyRound, ShieldCheck, Cloud, Plug, Link2,
} from "lucide-react";
import { SiGoogledrive } from "@icons-pack/react-simple-icons";
import {
  DocShell, Step, Callout, CodeBlock, Kbd, Section, SectionHeading, type DocNavItem,
} from "../components/docs-kit";

export const Route = createFileRoute("/dashboard/documentation/google-drive")({
  component: GoogleDriveDocPage,
});

const SITE = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";
const CONSOLE_URL = "https://console.cloud.google.com";

const NAV: DocNavItem[] = [
  { id: "pengantar", label: "Pengantar" },
  { id: "prasyarat", label: "Prasyarat" },
  { id: "buat-project", label: "1. Buat Project" },
  { id: "aktifkan-api", label: "2. Aktifkan Drive API" },
  { id: "oauth-consent", label: "3. OAuth Consent" },
  { id: "buat-kredensial", label: "4. Buat OAuth Client" },
  { id: "env", label: "5. Set Secret Worker" },
  { id: "hubungkan", label: "6. Hubungkan" },
  { id: "troubleshoot", label: "Troubleshooting" },
];

function GoogleDriveDocPage() {
  return (
    <DocShell
      eyebrow="Documentation"
      icon={(props) => <SiGoogledrive color="#1FA463" {...props} />}
      title="Setup Google Drive"
      description={`Panduan lengkap menyiapkan OAuth 2.0 Client di Google Cloud Console agar ${SITE} dapat menghubungkan akun Google Drive (multi-account) sebagai storage pool.`}
      nav={NAV}
    >
      <Section id="pengantar">
        <SectionHeading icon={BookOpen}>Pengantar</SectionHeading>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {SITE} menghubungkan Google Drive lewat <span className="font-medium text-zinc-800 dark:text-zinc-200">OAuth 2.0 Authorization Code flow</span>.
          Anda cukup membuat <span className="font-medium">satu</span> OAuth Client (Client ID &amp; Secret) di Google Cloud Console,
          menyetelnya sebagai secret di worker, lalu setiap admin bisa menghubungkan banyak akun Google
          hanya dengan menekan tombol <span className="font-medium">&ldquo;Login dengan Google&rdquo;</span> — tanpa menyalin token manual.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Cloud className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Multi-Account</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Satu OAuth Client untuk banyak akun.</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ShieldCheck className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Refresh Token</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Token diperbarui otomatis, tersimpan terenkripsi.</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Plug className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Sekali Klik</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Login Google → akun langsung terhubung.</p>
          </div>
        </div>
      </Section>

      <Section id="prasyarat">
        <SectionHeading icon={ListChecks}>Prasyarat</SectionHeading>
        <ul className="ml-5 list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Akun Google dengan akses ke <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Google Cloud Console <ExternalLink className="h-3 w-3" /></a>.</li>
          <li>Akses admin ke dashboard {SITE} dan ke konfigurasi secret worker (Cloudflare Wrangler).</li>
          <li>URL worker Anda (mis. <Kbd>https://api.domain.com</Kbd>) untuk menyusun redirect URI.</li>
        </ul>
        <Callout variant="warning">
          Redirect URI di Google <span className="font-medium">harus sama persis</span> dengan yang dipakai worker.
          {SITE} memakai pola <Kbd>{"{WORKER_URL}"}/api/storage/accounts/oauth/callback</Kbd>. Salah satu karakter berbeda → error <Kbd>redirect_uri_mismatch</Kbd>.
        </Callout>
      </Section>

      <Section id="buat-project">
        <Step n={1} title="Buat Project Google Cloud">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Buka <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">console.cloud.google.com <ExternalLink className="h-3 w-3" /></a> dan login.</li>
            <li>Klik dropdown project di kiri atas → <span className="font-medium">New Project</span>.</li>
            <li>Isi <span className="font-medium">Project name</span> (mis. <Kbd>NQDRIVE-Storage</Kbd>) → <span className="font-medium">Create</span>.</li>
            <li>Pilih project yang baru dibuat dari dropdown.</li>
          </ol>
        </Step>
      </Section>

      <Section id="aktifkan-api">
        <Step n={2} title="Aktifkan Google Drive API">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Menu kiri → <span className="font-medium">APIs &amp; Services &rsaquo; Library</span>.</li>
            <li>Cari <span className="font-medium">Google Drive API</span>.</li>
            <li>Klik hasilnya → <span className="font-medium">Enable</span>.</li>
          </ol>
          <Callout variant="warning">
            Koneksi akan gagal jika Drive API belum di-<span className="font-medium">Enable</span> pada project yang sama dengan OAuth Client.
          </Callout>
        </Step>
      </Section>

      <Section id="oauth-consent">
        <Step n={3} title="Konfigurasi OAuth Consent Screen">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Buka <span className="font-medium">APIs &amp; Services &rsaquo; OAuth consent screen</span>.</li>
            <li>Pilih <span className="font-medium">External</span> (atau <span className="font-medium">Internal</span> untuk Google Workspace) → <span className="font-medium">Create</span>.</li>
            <li>Isi <span className="font-medium">App name</span>, <span className="font-medium">User support email</span>, dan <span className="font-medium">Developer contact</span>.</li>
            <li>Di <span className="font-medium">Scopes</span>, tambahkan <Kbd>https://www.googleapis.com/auth/drive</Kbd> (akses penuh Drive, dibutuhkan untuk upload/format/migrasi).</li>
            <li>Di <span className="font-medium">Test users</span>, tambahkan setiap email Google yang akan dihubungkan (selama app masih status <em>Testing</em>).</li>
          </ol>
          <Callout>
            Selama app berstatus <span className="font-medium">Testing</span>, refresh token bisa kadaluarsa setelah 7 hari.
            Untuk produksi, tekan <span className="font-medium">Publish App</span> agar token tetap awet.
          </Callout>
        </Step>
      </Section>

      <Section id="buat-kredensial">
        <Step n={4} title="Buat OAuth Client ID & Secret">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Buka <span className="font-medium">APIs &amp; Services &rsaquo; Credentials</span>.</li>
            <li>Klik <span className="font-medium">Create Credentials &rsaquo; OAuth client ID</span>.</li>
            <li>Application type: <span className="font-medium">Web application</span>.</li>
            <li>Di <span className="font-medium">Authorized redirect URIs</span>, klik <span className="font-medium">Add URI</span> dan masukkan URL callback worker Anda:</li>
          </ol>
          <CodeBlock
            filename="Authorized redirect URI"
            code={`https://api.domain-anda.com/api/storage/accounts/oauth/callback`}
          />
          <p>Klik <span className="font-medium">Create</span>. Google menampilkan <span className="font-medium">Client ID</span> dan <span className="font-medium">Client secret</span> — inilah dua nilai yang dibutuhkan {SITE}:</p>
          <CodeBlock
            filename="OAuth Client (contoh)"
            code={`Client ID     : 1234567890-abcdefg.apps.googleusercontent.com
Client secret : GOCSPX-xxxxxxxxxxxxxxxxxxxx`}
          />
          <Callout variant="warning">
            <span className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Rahasiakan Client secret.</span>
            Simpan sebagai secret worker (langkah 5), jangan taruh di kode frontend atau repositori publik.
          </Callout>
        </Step>
      </Section>

      <Section id="env">
        <Step n={5} title="Set Secret di Worker (Cloudflare)">
          <p className="!mt-0">Tambahkan tiga nilai berikut ke worker. <Kbd>GOOGLE_OAUTH_REDIRECT_URI</Kbd> adalah base URL worker (tanpa path callback — path ditambahkan otomatis).</p>
          <CodeBlock
            filename="Terminal — wrangler"
            code={`# dari folder apps/worker
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# base URL worker (path /api/storage/accounts/oauth/callback ditambah otomatis)
# set via dashboard Cloudflare (vars) atau wrangler:
npx wrangler secret put GOOGLE_OAUTH_REDIRECT_URI   # contoh: https://api.domain-anda.com`}
          />
          <p>Untuk pengembangan lokal, buat file <Kbd>.dev.vars</Kbd> di <Kbd>apps/worker</Kbd>:</p>
          <CodeBlock
            filename="apps/worker/.dev.vars"
            code={`GOOGLE_CLIENT_ID="1234567890-abcdefg.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:8787"`}
          />
          <Callout>
            Untuk lokal, tambahkan juga redirect URI <Kbd>http://localhost:8787/api/storage/accounts/oauth/callback</Kbd> ke daftar
            Authorized redirect URIs di OAuth Client Anda.
          </Callout>
        </Step>
      </Section>

      <Section id="hubungkan">
        <Step n={6} title={`Hubungkan ke ${SITE}`}>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Buka <Link to="/dashboard/storage-manager" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Storage &rsaquo; Google Drive <ArrowRight className="h-3 w-3" /></Link>.
            </li>
            <li>Klik <span className="font-medium">Add Google Drive</span> → <span className="font-medium">Login dengan Google</span>.</li>
            <li>Pilih akun Google, tekan <span className="font-medium">Izinkan</span> di layar consent.</li>
            <li>Anda otomatis kembali ke dashboard; kapasitas akun langsung tersinkron.</li>
            <li>Status berubah menjadi <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Online</span>. Ulangi untuk menambah akun lain.</li>
          </ol>
          <Callout variant="success">
            <span className="flex items-center gap-1.5 font-medium"><Link2 className="h-4 w-4" /> Alternatif refresh token manual.</span>
            Jika tidak ingin memakai OAuth Client sendiri, dialog Add Google Drive juga menyediakan opsi
            menempel <span className="font-medium">Refresh Token</span> dari Google OAuth Playground (scope <Kbd>/auth/drive</Kbd>).
          </Callout>
        </Step>
      </Section>

      <Section id="troubleshoot">
        <SectionHeading icon={AlertTriangle}>Troubleshooting</SectionHeading>
        <div className="space-y-3">
          {[
            { t: "redirect_uri_mismatch", d: "Redirect URI di OAuth Client tidak sama persis dengan {WORKER_URL}/api/storage/accounts/oauth/callback. Cek trailing slash, http vs https, dan domain." },
            { t: "invalid_client", d: "GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET di worker salah. Periksa kembali secret Wrangler." },
            { t: "Google tidak mengembalikan refresh token", d: "Akun pernah di-grant tanpa consent baru. Cabut akses di myaccount.google.com/permissions lalu hubungkan ulang." },
            { t: "Akun jadi Offline setelah 7 hari", d: "OAuth consent screen masih status Testing. Tekan Publish App agar refresh token tidak kadaluarsa." },
            { t: "403 Forbidden saat upload", d: "Google Drive API belum di-Enable pada project yang sama dengan OAuth Client." },
          ].map((row) => (
            <div key={row.t} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">{row.t}</p>
              <p className="mt-1 text-sm text-[rgb(var(--ink-500))]">{row.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ingin menghubungkan Dropbox juga? Lihat{" "}
            <Link to="/dashboard/documentation/drop-box" className="font-medium text-brand-600 hover:underline dark:text-brand-400">panduan setup Dropbox</Link>.
          </p>
        </div>
      </Section>
    </DocShell>
  );
}
