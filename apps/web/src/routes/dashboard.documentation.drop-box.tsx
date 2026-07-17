import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen, ListChecks, ExternalLink, ArrowRight, CheckCircle2, AlertTriangle,
  KeyRound, ShieldCheck, Cloud, Plug, RefreshCw,
} from "lucide-react";
import { SiDropbox } from "@icons-pack/react-simple-icons";
import {
  DocShell, Step, Callout, CodeBlock, Kbd, Section, SectionHeading, type DocNavItem,
} from "../components/docs-kit";

export const Route = createFileRoute("/dashboard/documentation/drop-box")({
  component: DropboxDocPage,
});

const SITE = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";
const DROPBOX_CONSOLE = "https://www.dropbox.com/developers/apps";
const DROPBOX_BLUE = "#0061FF";

const NAV: DocNavItem[] = [
  { id: "pengantar", label: "Pengantar" },
  { id: "prasyarat", label: "Prasyarat" },
  { id: "buat-app", label: "1. Buat App Dropbox" },
  { id: "permissions", label: "2. Atur Permissions" },
  { id: "redirect", label: "3. Redirect URI & Access" },
  { id: "kredensial", label: "4. App Key & Secret" },
  { id: "env", label: "5. Set Secret Worker" },
  { id: "hubungkan", label: "6. Hubungkan" },
  { id: "troubleshoot", label: "Troubleshooting" },
];

const SCOPES = [
  { s: "account_info.read", d: "Membaca email & info akun (dipakai sebagai identitas akun)." },
  { s: "files.metadata.read", d: "Membaca daftar file & metadata (list, migrasi, kuota)." },
  { s: "files.content.read", d: "Mengunduh isi file (download & migrasi antar akun)." },
  { s: "files.content.write", d: "Mengunggah, menghapus, dan memformat file." },
];

function DropboxDocPage() {
  return (
    <DocShell
      eyebrow="Documentation"
      icon={(props) => <SiDropbox color={DROPBOX_BLUE} {...props} />}
      title="Setup Dropbox"
      description={`Panduan lengkap membuat App di Dropbox App Console dan menghubungkan akun Dropbox (multi-account) ke ${SITE} sebagai storage pool dengan kuota nyata.`}
      nav={NAV}
    >
      <Section id="pengantar">
        <SectionHeading icon={BookOpen}>Pengantar</SectionHeading>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {SITE} menghubungkan Dropbox lewat <span className="font-medium text-zinc-800 dark:text-zinc-200">OAuth 2.0 dengan refresh token</span> (offline access).
          Anda membuat <span className="font-medium">satu</span> App di Dropbox App Console untuk mendapatkan
          <span className="font-medium"> App key</span> &amp; <span className="font-medium">App secret</span>, menyetelnya sebagai secret di worker,
          lalu setiap admin bisa menghubungkan banyak akun Dropbox cukup dengan tombol
          <span className="font-medium"> &ldquo;Login dengan Dropbox&rdquo;</span>. Endpoint upload/download/kuota/migrasi
          otomatis mendeteksi provider — sama persis alurnya dengan Google Drive.
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
          <li>Akun Dropbox dengan akses ke <a href={DROPBOX_CONSOLE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Dropbox App Console <ExternalLink className="h-3 w-3" /></a>.</li>
          <li>Akses admin ke dashboard {SITE} dan ke konfigurasi secret worker (Cloudflare Wrangler).</li>
          <li>URL worker Anda (mis. <Kbd>https://api.domain.com</Kbd>) untuk menyusun redirect URI.</li>
        </ul>
        <Callout variant="warning">
          Redirect URI di Dropbox <span className="font-medium">harus sama persis</span> dengan yang dipakai worker:
          <Kbd>{"{WORKER_URL}"}/api/storage/accounts/oauth/callback</Kbd>. Perbedaan sekecil apa pun → error <Kbd>redirect_uri mismatch</Kbd>.
        </Callout>
      </Section>

      <Section id="buat-app">
        <Step n={1} title="Buat App di Dropbox App Console">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Buka <a href={DROPBOX_CONSOLE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">dropbox.com/developers/apps <ExternalLink className="h-3 w-3" /></a> → <span className="font-medium">Create app</span>.</li>
            <li>Choose an API: pilih <span className="font-medium">Scoped access</span> (satu-satunya opsi modern).</li>
            <li>Type of access: pilih <span className="font-medium">Full Dropbox</span> — agar {SITE} bisa mengelola seluruh file, bukan hanya folder App.</li>
            <li>Beri nama app (mis. <Kbd>NQDRIVE-Storage</Kbd>) → <span className="font-medium">Create app</span>.</li>
          </ol>
          <Callout>
            Pilih <span className="font-medium">Full Dropbox</span>, bukan <em>App folder</em>. Dengan App folder,
            fitur Format &amp; Migrasi hanya melihat isi folder aplikasi, tidak seluruh Dropbox.
          </Callout>
        </Step>
      </Section>

      <Section id="permissions">
        <Step n={2} title="Atur Permissions (Scopes)">
          <p className="!mt-0">Buka tab <span className="font-medium">Permissions</span> pada app Anda dan centang scope berikut, lalu klik <span className="font-medium">Submit</span>:</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {SCOPES.map((row, i) => (
              <div
                key={row.s}
                className={`flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:gap-4 ${
                  i > 0 ? "border-t border-zinc-200 dark:border-zinc-800" : ""
                } bg-white dark:bg-zinc-900`}
              >
                <Kbd>{row.s}</Kbd>
                <span className="text-xs text-[rgb(var(--ink-500))]">{row.d}</span>
              </div>
            ))}
          </div>
          <Callout variant="warning">
            Ubah scopes <span className="font-medium">sebelum</span> menghubungkan akun. Jika scope diubah setelah akun terhubung,
            akun harus login ulang agar token baru mencakup permission tambahan.
          </Callout>
        </Step>
      </Section>

      <Section id="redirect">
        <Step n={3} title="Redirect URI & Offline Access">
          <p className="!mt-0">Kembali ke tab <span className="font-medium">Settings</span>. Pada bagian <span className="font-medium">OAuth 2 &rsaquo; Redirect URIs</span>, tambahkan URL callback worker Anda lalu klik <span className="font-medium">Add</span>:</p>
          <CodeBlock
            filename="OAuth 2 → Redirect URIs"
            code={`https://api.domain-anda.com/api/storage/accounts/oauth/callback`}
          />
          <p>Untuk pengembangan lokal, tambahkan juga:</p>
          <CodeBlock
            filename="Redirect URI (lokal)"
            code={`http://localhost:8787/api/storage/accounts/oauth/callback`}
          />
          <Callout>
            <span className="flex items-center gap-1.5 font-medium"><RefreshCw className="h-4 w-4" /> Offline access otomatis.</span>
            {SITE} meminta <Kbd>token_access_type=offline</Kbd> saat login, sehingga Dropbox mengembalikan
            <span className="font-medium"> refresh token</span> (access token Dropbox hanya berumur ±4 jam dan diperbarui otomatis).
            Anda tidak perlu mengatur apa pun untuk ini.
          </Callout>
        </Step>
      </Section>

      <Section id="kredensial">
        <Step n={4} title="Ambil App Key & App Secret">
          <p className="!mt-0">Masih di tab <span className="font-medium">Settings</span>, temukan bagian atas halaman:</p>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li><span className="font-medium">App key</span> — salin nilainya (setara Client ID).</li>
            <li><span className="font-medium">App secret</span> — klik <span className="font-medium">Show</span> lalu salin (setara Client Secret).</li>
          </ol>
          <CodeBlock
            filename="Dropbox App (contoh)"
            code={`App key    : a1b2c3d4e5f6g7h
App secret : z9y8x7w6v5u4t3s`}
          />
          <Callout variant="warning">
            <span className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Rahasiakan App secret.</span>
            Simpan sebagai secret worker (langkah 5), jangan taruh di kode frontend atau repositori publik.
          </Callout>
        </Step>
      </Section>

      <Section id="env">
        <Step n={5} title="Set Secret di Worker (Cloudflare)">
          <p className="!mt-0">Tambahkan App key &amp; secret ke worker. <Kbd>DROPBOX_OAUTH_REDIRECT_URI</Kbd> bersifat opsional — jika kosong, worker memakai base URL yang sama dengan Google (<Kbd>GOOGLE_OAUTH_REDIRECT_URI</Kbd>).</p>
          <CodeBlock
            filename="Terminal — wrangler"
            code={`# dari folder apps/worker
npx wrangler secret put DROPBOX_APP_KEY
npx wrangler secret put DROPBOX_APP_SECRET

# opsional — hanya jika worker Dropbox pakai domain berbeda dari Google:
npx wrangler secret put DROPBOX_OAUTH_REDIRECT_URI   # contoh: https://api.domain-anda.com`}
          />
          <p>Untuk pengembangan lokal, tambahkan ke <Kbd>apps/worker/.dev.vars</Kbd>:</p>
          <CodeBlock
            filename="apps/worker/.dev.vars"
            code={`DROPBOX_APP_KEY="a1b2c3d4e5f6g7h"
DROPBOX_APP_SECRET="z9y8x7w6v5u4t3s"
# opsional:
# DROPBOX_OAUTH_REDIRECT_URI="http://localhost:8787"`}
          />
          <Callout>
            Jika <Kbd>DROPBOX_APP_KEY</Kbd> / <Kbd>DROPBOX_APP_SECRET</Kbd> belum diisi, provider Dropbox tidak
            diregistrasi — dashboard tetap berjalan normal, hanya menu Dropbox yang belum bisa dipakai.
          </Callout>
        </Step>
      </Section>

      <Section id="hubungkan">
        <Step n={6} title={`Hubungkan ke ${SITE}`}>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Buka <Link to="/dashboard/dropbox" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400">Storage &rsaquo; Dropbox <ArrowRight className="h-3 w-3" /></Link>.
            </li>
            <li>Klik <span className="font-medium">Add Dropbox</span> → <span className="font-medium">Login dengan Dropbox</span>.</li>
            <li>Masuk ke akun Dropbox, tekan <span className="font-medium">Allow</span> di layar izin.</li>
            <li>Anda otomatis kembali ke dashboard; kuota akun langsung tersinkron dan tampil di kartu.</li>
            <li>Status berubah menjadi <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Online</span>. Ulangi untuk menambah akun Dropbox lain.</li>
          </ol>
          <Callout variant="success">
            Setelah terhubung, upload, download, Format Drive, Migrasi Isi, dan Disconnect bekerja sama persis
            seperti Google Drive. Saat akun di-disconnect, file tetap muncul di list tapi tidak bisa diunduh
            (404) hingga akun dihubungkan kembali.
          </Callout>
        </Step>
      </Section>

      <Section id="troubleshoot">
        <SectionHeading icon={AlertTriangle}>Troubleshooting</SectionHeading>
        <div className="space-y-3">
          {[
            { t: "redirect_uri mismatch", d: "Redirect URI di tab Settings app tidak sama persis dengan {WORKER_URL}/api/storage/accounts/oauth/callback. Cek https, domain, dan trailing slash." },
            { t: "Dropbox tidak mengembalikan refresh token", d: "App tidak meminta offline access. NQDRIVE sudah mengirim token_access_type=offline — pastikan tidak ada proxy/edit yang menghapusnya, lalu hubungkan ulang." },
            { t: "missing_scope / insufficient permissions", d: "Scope belum lengkap. Buka tab Permissions, centang keempat scope, Submit, lalu login ulang akun agar token baru mencakupnya." },
            { t: "Integrasi Dropbox belum dikonfigurasi", d: "DROPBOX_APP_KEY / DROPBOX_APP_SECRET belum di-set di worker. Ulangi langkah 5." },
            { t: "Format/Migrasi hanya sebagian file", d: "App dibuat dengan tipe App folder, bukan Full Dropbox. Buat app baru dengan Full Dropbox lalu hubungkan ulang." },
          ].map((row) => (
            <div key={row.t} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">{row.t}</p>
              <p className="mt-1 text-sm text-[rgb(var(--ink-500))]">{row.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ingin menghubungkan Google Drive juga? Lihat{" "}
            <Link to="/dashboard/documentation/google-drive" className="font-medium text-brand-600 hover:underline dark:text-brand-400">panduan setup Google Drive</Link>.
          </p>
        </div>
      </Section>
    </DocShell>
  );
}
