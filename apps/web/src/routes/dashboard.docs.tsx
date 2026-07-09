import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen, Key, HardDrive, Layers, HelpCircle,
  ChevronRight, ExternalLink, ShieldCheck, CheckCircle2, Copy
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, useToast } from "@nqdrive/ui";
import { PageTransition } from "../components/page-transition";

export const Route = createFileRoute("/dashboard/docs")({
  component: DocsDashboardPage,
});

type DocTab = "overview" | "google_drive";

export function DocsDashboardPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<DocTab>("overview");

  const copyToClipboard = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Berhasil disalin",
      description: `${title} telah disalin ke clipboard.`,
      variant: "success",
    });
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6 p-4 sm:p-6 overflow-y-auto no-scrollbar pb-24">
        {/* Header */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 shadow-sm ring-1 ring-zinc-200 dark:ring-white/5">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dokumentasi NQDRIVE</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Panduan terperinci untuk mengkonfigurasi dan menghubungkan storage provider.
              </p>
            </div>
          </div>
        </div>

        {/* Layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Sidebar Menu */}
          <div className="w-full lg:w-64 shrink-0 flex flex-col gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md p-3 shadow-sm">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Daftar Isi Panduan
            </div>
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                  : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Layers className="h-4 w-4 shrink-0" />
              <span>Ikhtisar Sistem</span>
              {activeTab === "overview" && <ChevronRight className="ml-auto h-4 w-4" />}
            </button>
            <button
              onClick={() => setActiveTab("google_drive")}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all ${
                activeTab === "google_drive"
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                  : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <HardDrive className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>Google Drive API</span>
              {activeTab === "google_drive" && <ChevronRight className="ml-auto h-4 w-4" />}
            </button>
          </div>

          {/* Content Pane */}
          <div className="flex-1 w-full min-w-0">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <Layers className="h-5 w-5 text-brand-500" />
                      Arsitektur Virtual Cloud Storage NQDRIVE
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    <p>
                      NQDRIVE dirancang dengan model federasi penyimpanan modern. Sistem ini menggabungkan beberapa akun
                      penyimpanan eksternal (seperti Google Drive dan Telegram Channel) menjadi satu drive virtual yang terpadu.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div className="rounded-xl border border-zinc-150 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          Google Drive Nodes
                        </h3>
                        <p className="text-xs text-zinc-500">
                          Memanfaatkan API Google Drive resmi melalui skema OAuth 2.0. Memungkinkan penyimpanan yang cepat, andal, dan mendukung upload besar serta resumable chunks.
                        </p>
                      </div>
                      <div className="rounded-xl border border-zinc-150 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2">
                          <CheckCircle2 className="h-4 w-4 text-sky-500" />
                          Telegram Storage Pool
                        </h3>
                        <p className="text-xs text-zinc-500">
                          Menggunakan Telegram Bot API untuk mengunggah dan mengunduh berkas sebagai pesan media/dokumen di Telegram Channel. Berkas aman secara privat tanpa limitasi penyimpanan total.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      Prinsip Keamanan & Privasi
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    <p>
                      NQDRIVE menjamin seluruh file Anda tetap aman. Kredensial akun storage Anda (OAuth refresh token dan Telegram bot tokens) disimpan dalam database dengan enkripsi kuat menggunakan kunci enkripsi internal.
                    </p>
                    <p>
                      Proses pengunggahan didelegasikan melalui server-proxy tanpa menyimpan konten berkas secara permanen di server manager, sehingga menjamin privasi berkas Anda tetap terjaga secara utuh.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "google_drive" && (
              <div className="space-y-6">
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <HardDrive className="h-5 w-5 text-emerald-500" />
                      Langkah Setup Google Drive API
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 text-sm text-zinc-600 dark:text-zinc-400">
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mb-2">
                        1. Membuat Project Google Cloud & Mengaktifkan Drive API
                      </h3>
                      <ol className="list-decimal pl-5 space-y-1.5">
                        <li>
                          Buka{" "}
                          <a
                            href="https://console.cloud.google.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline font-medium inline-flex items-center gap-0.5"
                          >
                            Google Cloud Console <ExternalLink className="h-3.5 w-3.5" />
                          </a>.
                        </li>
                        <li>Buat project baru atau pilih project yang sudah ada di kanan atas.</li>
                        <li>
                          Buka menu pencarian di atas, cari <strong>Google Drive API</strong>, klik, lalu pilih{" "}
                          <strong>Enable / Aktifkan</strong>.
                        </li>
                      </ol>
                    </div>

                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mb-2">
                        2. Konfigurasi OAuth Consent Screen
                      </h3>
                      <ol className="list-decimal pl-5 space-y-1.5">
                        <li>Di panel navigasi kiri Google Cloud, pilih <strong>APIs & Services</strong> &gt; <strong>OAuth consent screen</strong>.</li>
                        <li>Pilih User Type: <strong>External</strong>, lalu klik <strong>Create</strong>.</li>
                        <li>Isi informasi aplikasi yang diperlukan (App name, User support email, Developer contact email) dan simpan.</li>
                        <li>
                          Pada langkah <strong>Scopes</strong>, klik <strong>Add or Remove Scopes</strong>. Tambahkan scope berikut:
                          <div className="my-2 bg-zinc-100 dark:bg-zinc-900 p-2 rounded font-mono text-xs flex items-center justify-between">
                            <span>https://www.googleapis.com/auth/drive</span>
                            <button
                              onClick={() => copyToClipboard("https://www.googleapis.com/auth/drive", "Scope Drive API")}
                              className="text-zinc-500 hover:text-zinc-800"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                        <li>
                          Pada langkah <strong>Test users</strong>, tambahkan alamat email Google yang ingin Anda hubungkan ke NQDRIVE.
                        </li>
                        <li>Simpan dan selesai.</li>
                      </ol>
                    </div>

                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mb-2">
                        3. Membuat Client ID & Client Secret
                      </h3>
                      <ol className="list-decimal pl-5 space-y-1.5">
                        <li>Pilih <strong>Credentials</strong> di panel kiri.</li>
                        <li>Klik <strong>+ Create Credentials</strong> &gt; <strong>OAuth client ID</strong>.</li>
                        <li>Pilih Application type: <strong>Web application</strong>.</li>
                        <li>
                          Pada bagian <strong>Authorized redirect URIs</strong>, tambahkan URI redirect NQDRIVE Anda.
                          <div className="my-2 bg-zinc-100 dark:bg-zinc-900 p-2 rounded font-mono text-xs flex items-center justify-between">
                            <span>https://drive.fiqul.id/api/storage/accounts/oauth/callback</span>
                            <button
                              onClick={() => copyToClipboard("https://drive.fiqul.id/api/storage/accounts/oauth/callback", "Redirect URI NQDRIVE")}
                              className="text-zinc-500 hover:text-zinc-800"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1">
                            *Ganti domain <code>drive.fiqul.id</code> dengan domain instalasi NQDRIVE Anda jika berbeda.
                          </p>
                        </li>
                        <li>Klik <strong>Create</strong>. Simpan <strong>Client ID</strong> dan <strong>Client Secret</strong> yang didapatkan.</li>
                      </ol>
                    </div>

                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mb-2">
                        4. Hubungkan ke Dashboard NQDRIVE
                      </h3>
                      <p className="mb-2">Anda dapat menghubungkan akun Google Drive dengan salah satu dari dua cara:</p>
                      <ul className="list-disc pl-5 space-y-2">
                        <li>
                          <strong>OAuth Direct Login (Direkomendasikan):</strong> Klik tombol <em>Add Google Drive</em> di dashboard, lalu pilih <strong>Login dengan Google</strong>. Ini adalah cara termudah dan paling aman.
                        </li>
                        <li>
                          <strong>Refresh Token Manual:</strong> Buka{" "}
                          <a
                            href="https://developers.google.com/oauthplayground"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline font-medium inline-flex items-center gap-0.5"
                          >
                            Google OAuth Playground <ExternalLink className="h-3.5 w-3.5" />
                          </a>. Konfigurasikan dengan Client ID & Secret Anda, otorisasi scope <code>https://www.googleapis.com/auth/drive</code>, dapatkan Refresh Token, lalu masukkan secara manual di dashboard NQDRIVE.
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
