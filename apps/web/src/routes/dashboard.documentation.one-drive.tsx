import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, ListChecks, ExternalLink, ArrowRight, CheckCircle2, AlertTriangle,
  KeyRound, ShieldCheck, Cloud, Plug, RefreshCw,
} from "lucide-react";
import {
  DocShell, Step, Callout, CodeBlock, Kbd, Section, SectionHeading, type DocNavItem,
} from "../components/docs-kit";

export const Route = createFileRoute("/dashboard/documentation/one-drive")({
  component: OneDriveDocPage,
});

const SITE = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";
const AZURE_PORTAL = "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";

const NAV: DocNavItem[] = [
  { id: "pengantar", label: "Pengantar" },
  { id: "prasyarat", label: "Prasyarat" },
  { id: "buat-app", label: "1. Buat App Registration" },
  { id: "permissions", label: "2. Atur API Permissions" },
  { id: "redirect", label: "3. Redirect URI" },
  { id: "kredensial", label: "4. Client ID & Secret" },
  { id: "env", label: "5. Set Secret Worker" },
  { id: "hubungkan", label: "6. Hubungkan" },
  { id: "troubleshoot", label: "Troubleshooting" },
];

const SCOPES = [
  { s: "Files.ReadWrite.All", d: "Membaca, mengunggah, menghapus file dan folder di OneDrive." },
  { s: "User.Read", d: "Membaca profil pengguna (email) untuk identifikasi akun." },
  { s: "offline_access", d: "Mendapatkan refresh token — wajib agar koneksi tetap aktif tanpa login ulang." },
];

function OneDriveDocPage() {
  return (
    <DocShell
      eyebrow="Documentation"
      icon={(props) => <img src="/src/assets/onedrive.svg" alt="" {...props} />}
      title="Setup OneDrive"
      description={`Panduan lengkap membuat App Registration di Microsoft Azure Portal dan menghubungkan akun OneDrive (multi-account) ke ${SITE} sebagai storage pool dengan kuota nyata.`}
      nav={NAV}
    >
      <Section id="pengantar">
        <SectionHeading icon={BookOpen}>Pengantar</SectionHeading>
        <p className="text-sm leading-relaxed text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">
          {SITE} menghubungkan OneDrive lewat <span className="font-medium text-[rgb(var(--foreground))] dark:text-[rgb(var(--foreground))]">Microsoft OAuth 2.0 dengan refresh token</span> (offline_access).
          Anda membuat <span className="font-medium">satu</span> App Registration di Azure Portal untuk mendapatkan
          <span className="font-medium"> Client ID</span> &amp; <span className="font-medium">Client Secret</span>, menyetelnya sebagai secret di worker,
          lalu setiap admin bisa menghubungkan banyak akun OneDrive cukup dengan tombol
          <span className="font-medium"> &ldquo;Login dengan OneDrive&rdquo;</span>. Endpoint upload/download/kuota/migrasi
          otomatis mendeteksi provider — sama persis alurnya dengan Google Drive &amp; Dropbox.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Cloud className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Kuota Nyata</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Total/terpakai per akun tampil di list.</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ShieldCheck className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Offline Access</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Refresh token, tak perlu login ulang.</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Plug className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Endpoint Cerdas</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Upload session terdeteksi otomatis.</p>
          </div>
        </div>
      </Section>

      <Section id="prasyarat">
        <SectionHeading icon={ListChecks}>Prasyarat</SectionHeading>
        <ul className="ml-5 list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Akun Microsoft dengan akses ke <a href={AZURE_PORTAL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Microsoft Azure Portal <ExternalLink className="h-3 w-3" /></a>.</li>
          <li>Akses admin ke dashboard {SITE} dan ke konfigurasi secret worker (Cloudflare Wrangler).</li>
          <li>URL worker Anda (mis. <Kbd>https://api.domain.com</Kbd>) untuk menyusun redirect URI.</li>
        </ul>
        <Callout variant="warning">
          Redirect URI di Azure Portal <span className="font-medium">harus sama persis</span> dengan yang dipakai worker:
          <Kbd>{"{WORKER_URL}"}/api/storage/accounts/oauth/callback</Kbd>. Perbedaan sekecil apa pun → error <Kbd>redirect_uri mismatch</Kbd>.
        </Callout>
      </Section>

      <Section id="buat-app">
        <Step n={1} title="Buat App Registration di Azure Portal">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Buka <a href={AZURE_PORTAL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Azure Portal → App registrations <ExternalLink className="h-3 w-3" /></a> → <span className="font-medium">New registration</span>.</li>
            <li>Isi <span className="font-medium">Name</span> (mis. <Kbd>NQDRIVE Storage</Kbd>).</li>
            <li>Di bagian <span className="font-medium">Supported account types</span>, pilih:
              <br /><span className="font-medium">Accounts in any organizational directory and personal Microsoft accounts</span>
              <br />(agar bisa connect akun pribadi @outlook/@hotmail juga akun kerja @company.com).</li>
            <li>Di bagian <span className="font-medium">Redirect URI</span>, pilih <span className="font-medium">Web</span> dan masukkan URL callback worker Anda (lihat step 3).</li>
            <li>Klik <span className="font-medium">Register</span>.</li>
          </ol>
          <Callout>
            Setelah registrasi, catat <strong>Application (client) ID</strong> dari halaman Overview — ini yang menjadi <Kbd>MICROSOFT_CLIENT_ID</Kbd>.
          </Callout>
        </Step>
      </Section>

      <Section id="permissions">
        <Step n={2} title="Atur API Permissions">
          <p className="!mt-0">Buka tab <span className="font-medium">API permissions</span> pada app Anda, lalu klik <span className="font-medium">Add a permission</span> → <span className="font-medium">Microsoft Graph</span> → <span className="font-medium">Delegated permissions</span>. Tambahkan scope berikut:</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {SCOPES.map((row, i) => (
              <div key={row.s} className={`flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:gap-4 ${i > 0 ? "border-t border-zinc-200 dark:border-zinc-800" : ""} bg-white dark:bg-zinc-900`}>
                <Kbd>{row.s}</Kbd>
                <span className="text-xs text-[rgb(var(--ink-500))]">{row.d}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Setelah menambah semua scope, klik <span className="font-medium">Grant admin consent</span> (jika Anda admin tenant) atau minta admin lain untuk menyetujui.
          </p>
        </Step>
      </Section>

      <Section id="redirect">
        <Step n={3} title="Redirect URI">
          <p className="!mt-0">Kembali ke tab <span className="font-medium">Authentication</span>. Di bagian <span className="font-medium">Web → Redirect URIs</span>, pastikan URL callback worker sudah terdaftar:</p>
          <CodeBlock filename="Redirect URI" code={`https://api.domain-anda.com/api/storage/accounts/oauth/callback`} />
          <p>Untuk pengembangan lokal, tambahkan juga:</p>
          <CodeBlock filename="Redirect URI (lokal)" code={`http://localhost:8787/api/storage/accounts/oauth callback`} />
          <Callout variant="warning">
            Pastikan <span className="font-medium">Allow implicit flow and hybrid flows</span> <strong>tidak dicentang</strong> — {SITE} memakai Authorization Code flow, bukan implicit.
          </Callout>
        </Step>
      </Section>

      <Section id="kredensial">
        <Step n={4} title="Client ID & Client Secret">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Di tab <span className="font-medium">Certificates &amp; secrets</span>, klik <span className="font-medium">New client secret</span>.</li>
            <li>Beri deskripsi (mis. <Kbd>NQDRIVE Worker</Kbd>) dan pilih durasi (mis. 24 bulan atau sesuai kebijakan).</li>
            <li>Klik <span className="font-medium">Add</span> dan <span className="font-medium">salin nilai secret</span> segera — hanya ditampilkan sekali.</li>
          </ol>
          <CodeBlock filename="Contoh kredensial" code={`Client ID     : 12345678-abcd-efgh-ijkl-1234567890ab
Client Secret  : aBc~D1eF2gH3iJ4kL5mN6oP7qR8sT9uV0w`} />
          <Callout variant="warning">
            <span className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Rahasiakan Client Secret.</span>
            Simpan sebagai secret worker (langkah 5), jangan taruh di kode frontend atau repositori publik.
          </Callout>
        </Step>
      </Section>

      <Section id="env">
        <Step n={5} title="Set Secret di Worker">
          <p className="!mt-0">Tambahkan kredensial ke worker. <Kbd>MICROSOFT_OAUTH_REDIRECT_URI</Kbd> bersifat opsional — jika kosong, worker memakai base URL yang sama dengan Google.</p>
          <CodeBlock filename="Terminal — wrangler" code={`cd apps/worker
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET

# opsional — hanya jika worker OneDrive pakai domain berbeda:
npx wrangler secret put MICROSOFT_OAUTH_REDIRECT_URI`} />
          <p>Untuk pengembangan lokal:</p>
          <CodeBlock filename="apps/worker/.dev.vars" code={`MICROSOFT_CLIENT_ID="12345678-abcd-efgh-ijkl-1234567890ab"
MICROSOFT_CLIENT_SECRET="aBc~D1eF2gH3iJ4kL5mN6oP7qR8sT9uV0w"
# opsional:
# MICROSOFT_OAUTH_REDIRECT_URI="http://localhost:8787"`} />
        </Step>
      </Section>

      <Section id="hubungkan">
        <Step n={6} title={`Hubungkan ke ${SITE}`}>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Buka <Link to="/dashboard/onedrive" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Storage &rsaquo; OneDrive <ArrowRight className="h-3 w-3" /></Link>.</li>
            <li>Klik <span className="font-medium">Add OneDrive</span> → <span className="font-medium">Login dengan OneDrive</span>.</li>
            <li>Masuk ke akun Microsoft, tekan <span className="font-medium">Accept</span> di halaman izin.</li>
            <li>Anda otomatis kembali ke dashboard; kuota akun langsung tersinkron.</li>
            <li>Status berubah menjadi <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Online</span>. Ulangi untuk menambah akun lain.</li>
          </ol>
          <Callout variant="success">
            Setelah terhubung, upload, download, Format Drive, Migrasi Isi, dan Disconnect bekerja sama persis
            seperti Google Drive &amp; Dropbox. Saat akun di-disconnect, file tetap muncul di list tapi tidak bisa diunduh (404) hingga akun dihubungkan kembali.
          </Callout>
        </Step>
      </Section>

      <Section id="troubleshoot">
        <SectionHeading icon={AlertTriangle}>Troubleshooting</SectionHeading>
        <div className="space-y-3">
          {[
            { t: "redirect_uri mismatch", d: "Redirect URI di Azure Portal tidak sama persis dengan {WORKER_URL}/api/storage/accounts/oauth/callback. Cek https, domain, dan trailing slash." },
            { t: "AADSTS50011: The reply URL specified in the request does not match", d: "Sama dengan redirect_uri mismatch — pastikan URL di Azure Portal dan di kode worker identik." },
            { t: "Microsoft tidak mengembalikan refresh token", d: "Pastikan scope offline_access tercantum di API permissions dan sudah di-grant admin consent." },
            { t: "Integrasi OneDrive belum dikonfigurasi", d: "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET belum di-set di worker. Ulangi langkah 5." },
            { t: "Format/Migrasi hanya sebagian file", d: "Pastikan scope Files.ReadWrite.All sudah di-grant dan admin consent diberikan." },
          ].map((row) => (
            <div key={row.t} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">{row.t}</p>
              <p className="mt-1 text-sm text-[rgb(var(--ink-500))]">{row.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ingin menghubungkan provider lain? Lihat{" "}
            <Link to="/dashboard/documentation/google-drive" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Google Drive</Link> atau{" "}
            <Link to="/dashboard/documentation/drop-box" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Dropbox</Link>.
          </p>
        </div>
      </Section>
    </DocShell>
  );
}
