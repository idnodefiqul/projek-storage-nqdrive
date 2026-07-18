import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Copy, Key, AlertTriangle } from "lucide-react";
import { Badge, Skeleton, useToast, Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, Button } from "@nqdrive/ui";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "../hooks/use-logs-and-api-keys";
import { useMinLoading } from "../hooks/use-min-loading";
import { PageTransition } from "../components/page-transition";
import { formatLocal } from "../lib/datetime";
import { PageHeader, EmptyState } from "../components/ui-kit";

export const Route = createFileRoute("/dashboard/api")({
  component: ApiKeysPage,
});

function getApiKeyId(k: { apiKeyId?: string | null } | null | undefined): string {
  return k?.apiKeyId ?? "";
}

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogHeader>
        <DialogTitle>{revealedKey ? "API Key Berhasil Dibuat" : "Buat API Key Baru"}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {revealedKey ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[rgb(var(--ink-500))]">Salin key ini sekarang - tidak akan ditampilkan lagi setelah ditutup.</p>
            <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] p-3">
              <code className="flex-1 overflow-x-auto text-xs font-mono text-[rgb(var(--foreground))]">{revealedKey}</code>
              <button type="button"
                aria-label="Salin API key"
                onClick={() => { navigator.clipboard.writeText(revealedKey); toast({ title: "Key disalin", variant: "success" }); }}
                className="shrink-0 rounded-lg p-2 text-[rgb(var(--ink-500))] transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[rgb(var(--ink-500))]">Beri nama agar mudah diidentifikasi nanti.</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Script Backup"
              aria-label="Nama API key"
              onKeyDown={(e) => e.key === "Enter" && !createKey.isPending && handleCreate()}
              className="h-10 w-full rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] px-3 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--ink-500))] outline-none focus:border-brand-500 focus:bg-[rgb(var(--surface))] focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        {revealedKey ? (
          <Button onClick={handleClose} className="w-full">Selesai</Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={handleClose}>Batal</Button>
            <Button type="button" onClick={handleCreate} disabled={!name.trim() || createKey.isPending}>
              {createKey.isPending ? "Membuat..." : "Buat Key"}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}

function RevokeConfirmDialog({ open, onOpenChange, onConfirm, isPending }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void; isPending: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Cabut API key?</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/15">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm text-[rgb(var(--ink-500))] leading-relaxed">Akses menggunakan key ini akan langsung berhenti. Tindakan ini tidak dapat dibatalkan.</p>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Batal</Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>{isPending ? "Mencabut..." : "Cabut Key"}</Button>
      </DialogFooter>
    </Dialog>
  );
}

function ApiKeysPage() {
  const { toast } = useToast();
  const { data, isLoading: isQueryLoading } = useApiKeys();
  const isLoading = useMinLoading(isQueryLoading, 600);
  const revokeKey = useRevokeApiKey();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const handleConfirmRevoke = async () => {
    if (revokeTarget === null) return;
    try {
      await revokeKey.mutateAsync(revokeTarget);
      toast({ title: "API key berhasil dicabut", variant: "success" });
      setRevokeTarget(null);
    } catch (error) {
      toast({ title: "Gagal mencabut API key", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6">
      <PageHeader
        eyebrow="System"
        icon={Key}
        title="API"
        description={"Kelola API key untuk akses programatik ke " + (import.meta.env.VITE_SITE_NAME || "NQDRIVE") + "."}
        actions={
          <button type="button" onClick={() => setIsCreateOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Buat API Key</span>
            <span className="sm:hidden">Buat</span>
          </button>
        }
      />
      <div className="flex flex-1 flex-col overflow-hidden app-card">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            {data?.apiKeys.length === 0 ? (
              <EmptyState
                icon={Key}
                title="Belum ada API key"
                description="Buat API key pertama untuk mengakses NQDRIVE secara programatik melalui CLI, script backup, atau aplikasi custom."
                action={
                  <Button onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" />Buat API Key</Button>
                }
              />
            ) : (
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]">
                  <tr>
                    {["Nama", "Key Prefix", "Status", "Dibuat", "Aksi"].map((h, i) => (
                      <th key={h} scope="col" className={"h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-500))] " + (i === 4 ? "text-right" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border-subtle))]">
                  {data?.apiKeys.map((key) => (
                    <tr key={getApiKeyId(key)} className="transition-colors hover:bg-[rgb(var(--surface-muted))]/60">
                      <td className="px-4 py-3 font-medium text-[rgb(var(--foreground))]">
                        <div className="flex items-center gap-2">
                          <Key className="h-3.5 w-3.5 text-[rgb(var(--ink-500))] shrink-0" aria-hidden="true" />
                          {key.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-[rgb(var(--ink-500))]">{key.keyPrefix}...</td>
                      <td className="px-4 py-3">
                        <Badge variant={key.revokedAt ? "destructive" : "success"}>
                          {key.revokedAt ? "Dicabut" : "Aktif"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-[rgb(var(--ink-500))]">
                        {formatLocal(key.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!key.revokedAt && (
                          <button type="button" onClick={() => setRevokeTarget(getApiKeyId(key))}
                            disabled={revokeKey.isPending}
                            aria-label={"Cabut API key " + key.name}
                            className="rounded-lg p-2 text-[rgb(var(--ink-500))] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      <CreateKeyDialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <RevokeConfirmDialog open={revokeTarget !== null} onOpenChange={(v) => { if (!v) setRevokeTarget(null); }} onConfirm={handleConfirmRevoke} isPending={revokeKey.isPending} />
    </div>
  </PageTransition>
  );
}
