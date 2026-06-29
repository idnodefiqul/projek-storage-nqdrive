import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus, Trash2, KeyRound, CheckCircle2, XCircle,
  Loader2, ExternalLink, RefreshCw, Eye, EyeOff, AlertCircle,
} from "lucide-react";
import {
  Card, CardContent, Button, Skeleton,
  Dialog, DialogHeader, DialogTitle, DialogDescription, useToast,
} from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import {
  useDriveAccounts, useDeleteDriveAccount,
  useConnectGoogleAccountViaToken, useValidateRefreshToken,
} from "../hooks/use-drive-accounts";
import { ApiClientError } from "../lib/api-client";

export const Route = createFileRoute("/dashboard/google-accounts")({
  component: GoogleAccountsPage,
});

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

function EmailCell({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {shown ? email : maskEmail(email)}
      </span>
      <button type="button" onClick={() => setShown((v) => !v)}
        className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        title={shown ? "Sembunyikan email" : "Tampilkan email"}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function AddAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [refreshToken, setRefreshToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [validationState, setValidationState] = useState<
    null | { valid: true; email: string } | { valid: false; reason: string }
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  const connectMutation = useConnectGoogleAccountViaToken();
  const validateMutation = useValidateRefreshToken();

  const handleClose = () => {
    setRefreshToken(""); setValidationState(null);
    setFormError(null); setShowToken(false);
    connectMutation.reset(); validateMutation.reset();
    onClose();
  };

  const handleValidate = async () => {
    const token = refreshToken.trim();
    if (!token) return;
    setValidationState(null); setFormError(null);
    try {
      const result = await validateMutation.mutateAsync(token);
      if (result.valid && result.email) setValidationState({ valid: true, email: result.email });
      else setValidationState({ valid: false, reason: result.reason ?? "Token tidak valid." });
    } catch (error) {
      let msg = "Gagal menghubungi server. Periksa koneksi internet.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      setFormError(msg);
    }
  };

  const handleConnect = async () => {
    setFormError(null);
    try {
      const result = await connectMutation.mutateAsync(refreshToken.trim());
      toast({ title: "Akun berhasil ditambahkan", description: result.account.email, variant: "success" });
      handleClose();
    } catch (error) {
      let msg = "Terjadi kesalahan. Coba lagi.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      toast({ title: "Gagal menambahkan akun", description: msg, variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-600" />
          Tambah Akun Google Drive
        </DialogTitle>
        <DialogDescription>Hubungkan akun Google Drive ke storage pool menggunakan refresh token.</DialogDescription>
      </DialogHeader>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-950">
        <p className="mb-1.5 text-xs font-semibold text-blue-800 dark:text-blue-200">Cara mendapatkan Refresh Token:</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li className="text-xs text-blue-700 dark:text-blue-300">
            Buka <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
              Google OAuth Playground <ExternalLink className="h-3 w-3" /></a>
          </li>
          <li className="text-xs text-blue-700 dark:text-blue-300">Klik ⚙️ → centang <em>Use your own OAuth credentials</em> → isi Client ID &amp; Secret</li>
          <li className="text-xs text-blue-700 dark:text-blue-300">Pilih scope: <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[11px] dark:bg-blue-900">https://www.googleapis.com/auth/drive</code></li>
          <li className="text-xs text-blue-700 dark:text-blue-300">Klik <em>Authorize APIs</em> → login → <em>Exchange authorization code for tokens</em></li>
          <li className="text-xs text-blue-700 dark:text-blue-300">Copy nilai <strong>Refresh token</strong> dari response JSON</li>
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Refresh Token</label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input type={showToken ? "text" : "password"} value={refreshToken}
              onChange={(e) => { setRefreshToken(e.target.value); setValidationState(null); setFormError(null); }}
              placeholder="1//0g..."
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-3 pr-10 font-mono text-sm
                text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30
                disabled:cursor-not-allowed disabled:opacity-50
                dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              disabled={connectMutation.isPending}
              onKeyDown={(e) => e.key === "Enter" && !validationState && !validateMutation.isPending && handleValidate()} />
            <button type="button" onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600"
              tabIndex={-1}>
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" size="sm"
            onClick={handleValidate}
            disabled={!refreshToken.trim() || validateMutation.isPending || connectMutation.isPending}
            className="h-10 shrink-0">
            {validateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
              : validationState ? <><RefreshCw className="mr-1 h-3.5 w-3.5" />Ulang</> : "Cek Token"}
          </Button>
        </div>
      </div>

      {formError && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
          <p className="text-sm text-orange-700 dark:text-orange-300">{formError}</p>
        </div>
      )}

      {validationState && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
          validationState.valid
            ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"}`}>
          {validationState.valid
            ? <><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">Token valid ✓</p><p className="mt-0.5 font-mono text-xs">{validationState.email}</p></div></>
            : <><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">Token tidak valid</p><p className="mt-0.5 text-xs">{validationState.reason}</p></div></>}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={handleClose} disabled={connectMutation.isPending}>Batal</Button>
        <Button onClick={handleConnect} disabled={connectMutation.isPending || !validationState || !validationState.valid}>
          {connectMutation.isPending
            ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Menambahkan...</>
            : <><Plus className="mr-1 h-4 w-4" />Tambahkan Akun</>}
        </Button>
      </div>
    </Dialog>
  );
}

function GoogleAccountsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading } = useDriveAccounts();
  const deleteAccount = useDeleteDriveAccount();

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`Hapus akun "${email}" dari storage pool?\n\nPastikan tidak ada file aktif di akun ini.`)) return;
    try {
      await deleteAccount.mutateAsync(id);
      toast({ title: "Akun berhasil dihapus", variant: "success" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : undefined;
      toast({ title: "Gagal menghapus akun", description: msg?.includes("file") ? "Akun masih memiliki file. Hapus atau pindahkan file terlebih dahulu." : msg, variant: "error" });
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Google Accounts</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Kelola akun Google Drive yang menjadi bagian dari storage pool.</p>
        </div>
        {/* FIX: tombol selalu pakai variant default (brand-600) agar kelihatan di light mode */}
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Tambah Akun</span>
          <span className="sm:hidden">Tambah</span>
        </Button>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <tr>
                    <th className="h-10 w-[35%] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Email</th>
                    <th className="h-10 w-[15%] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Status</th>
                    <th className="h-10 w-[38%] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Storage Terpakai</th>
                    <th className="h-10 w-[12%] px-4 text-right align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data?.accounts.map((account) => (
                    <tr key={account.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-4"><EmailCell email={account.email} /></td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          account.status === "online"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${account.status === "online" ? "bg-green-500" : "bg-red-500"}`} />
                          {account.status === "online" ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs text-zinc-500">
                            <span>{formatBytes(account.usedStorageBytes)}</span>
                            <span>{formatBytes(account.totalStorageBytes)}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                            <div className="h-full rounded-full bg-brand-500 transition-all"
                              style={{ width: `${Math.min(100, account.totalStorageBytes > 0 ? (account.usedStorageBytes / account.totalStorageBytes) * 100 : 0)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end">
                          <button type="button" onClick={() => handleDelete(account.id, account.email)}
                            disabled={deleteAccount.isPending} title="Hapus akun"
                            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-900/20">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data?.accounts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                            <KeyRound className="h-7 w-7 text-zinc-400 opacity-50" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Belum ada akun Google Drive</p>
                            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Klik tombol "Tambah Akun" di kanan atas untuk mulai.</p>
                          </div>
                          {/* FIX: hapus tombol "Tambah Akun Sekarang" dari dalam tabel */}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
