import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Copy, Key } from "lucide-react";
import { Badge, Skeleton, useToast } from "@nqdrive/ui";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "../hooks/use-logs-and-api-keys";
import { useMinLoading } from "../hooks/use-min-loading";
import { PageTransition } from "../components/page-transition";

export const Route = createFileRoute("/dashboard/api")({
  component: ApiKeysPage,
});

/* Dialog buat API key baru */
function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createKey = useCreateApiKey();
  const [name, setName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const result = await createKey.mutateAsync(name.trim());
      setRevealedKey(result.fullKey);
      setName("");
    } catch (error) {
      toast({ title: "Gagal membuat API key", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  };

  const handleClose = () => { setName(""); setRevealedKey(null); createKey.reset(); onClose(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {revealedKey ? (
          <>
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">API Key Berhasil Dibuat</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Salin key ini sekarang — tidak akan ditampilkan lagi setelah ditutup.</p>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
              <code className="flex-1 overflow-x-auto text-xs font-mono text-zinc-800 dark:text-zinc-200">{revealedKey}</code>
              <button type="button"
                onClick={() => { navigator.clipboard.writeText(revealedKey); toast({ title: "Key disalin", variant: "success" }); }}
                className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button type="button" onClick={handleClose}
              className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors">
              Selesai
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Buat API Key Baru</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Beri nama agar mudah diidentifikasi nanti.</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Script Backup"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && !createKey.isPending && handleCreate()}
              className="mb-4 h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm
                text-zinc-900 placeholder-zinc-400 outline-none
                focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleClose}
                className="flex-1 rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700
                  hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                Batal
              </button>
              <button type="button" onClick={handleCreate} disabled={!name.trim() || createKey.isPending}
                className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white
                  hover:bg-brand-600 disabled:opacity-50 transition-colors">
                {createKey.isPending ? "Membuat..." : "Buat Key"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ApiKeysPage() {
  const { toast } = useToast();
  const { data, isLoading: isQueryLoading } = useApiKeys();
  const isLoading = useMinLoading(isQueryLoading, 600);
  const revokeKey = useRevokeApiKey();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleRevoke = async (id: number) => {
    if (!confirm("Cabut API key ini? Akses menggunakan key ini akan langsung berhenti.")) return;
    try {
      await revokeKey.mutateAsync(id);
      toast({ title: "API key berhasil dicabut", variant: "success" });
    } catch (error) {
      toast({ title: "Gagal mencabut API key", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">API</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Kelola API key untuk akses programatik ke {import.meta.env.VITE_SITE_NAME || "NQDRIVE"}.</p>
        </div>
        {/* FIX: tombol brand-500 agar kelihatan di light mode */}
        <button type="button" onClick={() => setIsCreateOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold
            text-white shadow-sm shadow-brand-500/25 transition-colors hover:bg-brand-600">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Buat API Key</span>
          <span className="sm:hidden">Buat</span>
        </button>
      </div>

      {/* Tabel — full screen card */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                <tr>
                  {["Nama", "Key Prefix", "Status", "Dibuat", "Aksi"].map((h, i) => (
                    <th key={h} className={`h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data?.apiKeys.map((key) => (
                  <tr key={key.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <Key className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        {key.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-zinc-500 dark:text-zinc-400">{key.keyPrefix}...</td>
                    <td className="px-4 py-3">
                      <Badge variant={key.revokedAt ? "destructive" : "success"}>
                        {key.revokedAt ? "Dicabut" : "Aktif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                      {new Date(key.createdAt).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!key.revokedAt && (
                        <button type="button" onClick={() => handleRevoke(key.id)}
                          disabled={revokeKey.isPending}
                          title="Cabut key"
                          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-900/20">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data?.apiKeys.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                          <Key className="h-7 w-7 text-zinc-400 opacity-50" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Belum ada API key</p>
                          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Klik "Buat API Key" di kanan atas untuk membuat key baru.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateKeyDialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  </PageTransition>
  );
}
