import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Lock, Download,
  Terminal, RefreshCw, Key, ShieldCheck, Clipboard, Loader2, Shield, Gauge,
  Globe, Ban, Fingerprint, Copy, Eye, EyeOff,
} from "lucide-react";
import {
  useToast, Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@nqdrive/ui";
import { cn } from "@nqdrive/ui";
import { useSettings, useUpdateSettings } from "../hooks/use-settings";
import { useMinLoading } from "../hooks/use-min-loading";
import { SettingsSkeleton } from "../components/skeletons";
import { PageTransition } from "../components/page-transition";
import { PageHeader, StatCard } from "../components/ui-kit";
import { apiRequest, ApiClientError } from "../lib/client";
import { motion } from "framer-motion";

export const Route = createFileRoute("/dashboard/security")({
  component: SecurityPage,
});

interface BlockedIpItem {
  ip: string;
  type: "login" | "download";
  locked_until?: number;
  attempts?: number;
}

interface TwoFactorGenResponse {
  secret: string;
  qrUri: string;
  backupCodes: string[];
}

function SecurityPage() {
  const { toast } = useToast();
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const updateSettings = useUpdateSettings();
  const isFetchingSettings = useMinLoading(isLoadingSettings, 600);

  const [blockedIps, setBlockedIps] = useState<BlockedIpItem[]>([]);
  const [isLoadingIps, setIsLoadingIps] = useState(false);

  const [turnstileEnabled, setTurnstileEnabled] = useState("false");
  const [turnstileSitekey, setTurnstileSitekey] = useState("");
  const [turnstileSecretkey, setTurnstileSecretkey] = useState("");

  const [rateLimitLogin, setRateLimitLogin] = useState("0");
  const [blockCliDownload, setBlockCliDownload] = useState("false");
  const [rateLimitDownload, setRateLimitDownload] = useState("0");

  const [is2faEnabled, setIs2faEnabled] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<"idle" | "generating" | "setup" | "active">("idle");
  const [totpGenData, setTotpGenData] = useState<TwoFactorGenResponse | null>(null);
  const [otpVerifyCode, setOtpVerifyCode] = useState("");
  const [isVerifying2fa, setIsVerifying2fa] = useState(false);
  const [backupCodesDownloaded, setBackupCodesDownloaded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [isDirty, setIsDirty] = useState(false);

  const fetchBlockedIps = async () => {
    setIsLoadingIps(true);
    try {
      const res = await apiRequest<{ items: BlockedIpItem[] }>("/security/blocked-ips");
      setBlockedIps(res.items);
    } catch (err) {
      // Jangan tampilkan toast kalau gagal karena sesi berakhir / logout (401) —
      // kalau tidak, notif "Failed to load blocked IPs" ikut muncul di halaman login.
      const status = err instanceof ApiClientError ? err.statusCode : 0;
      if (status !== 401 && localStorage.getItem("nqdrive_is_logged_in") !== "false") {
        toast({ title: "Failed to load blocked IPs", variant: "error" });
      }
    } finally {
      setIsLoadingIps(false);
    }
  };

  const handleUnban = async (ip: string) => {
    try {
      await apiRequest("/security/blocked-ips/unblock", { method: "POST", body: { ip } });
      toast({ title: `IP ${ip} unblocked`, variant: "success" });
      fetchBlockedIps();
    } catch {
      toast({ title: "Failed to unblock IP", variant: "error" });
    }
  };

  useEffect(() => {
    if (settings) {
      setTurnstileEnabled(settings.turnstile_enabled ?? "false");
      setTurnstileSitekey(settings.turnstile_sitekey ?? "");
      setTurnstileSecretkey(settings.turnstile_secretkey ?? "");
      setRateLimitLogin(settings.rate_limit_login ?? "0");
      setBlockCliDownload(settings.block_cli_download ?? "false");
      setRateLimitDownload(settings.rate_limit_download ?? "0");
      setIsDirty(false);
    }
  }, [settings]);

  useEffect(() => {
    apiRequest<{ id: number; username: string; email: string; totpEnabled?: boolean }>("/me")
      .then((res) => {
        if (res.totpEnabled) {
          setIs2faEnabled(true);
          setTwoFactorStep("active");
        } else {
          setIs2faEnabled(false);
          setTwoFactorStep("idle");
        }
      })
      .catch(() => {});
    fetchBlockedIps();
  }, []);

  const handleSaveGeneral = async () => {
    try {
      await updateSettings.mutateAsync({
        rate_limit_login: rateLimitLogin,
        block_cli_download: blockCliDownload,
        rate_limit_download: rateLimitDownload,
      });
      setIsDirty(false);
      toast({ title: "Security settings saved", variant: "success" });
    } catch {
      toast({ title: "Failed to save settings", variant: "error" });
    }
  };

  const handleSaveTurnstile = async () => {
    try {
      await updateSettings.mutateAsync({
        turnstile_enabled: turnstileEnabled,
        turnstile_sitekey: turnstileSitekey,
        turnstile_secretkey: turnstileSecretkey,
      });
      toast({ title: "Turnstile settings saved", variant: "success" });
    } catch {
      toast({ title: "Failed to save Turnstile", variant: "error" });
    }
  };

  const handleGenerate2fa = async () => {
    setTwoFactorStep("generating");
    try {
      const data = await apiRequest<TwoFactorGenResponse>("/security/2fa/generate", { method: "POST" });
      setTotpGenData(data);
      setTwoFactorStep("setup");
    } catch {
      toast({ title: "Failed to generate 2FA", variant: "error" });
      setTwoFactorStep("idle");
    }
  };

  const handleDownloadBackupCodes = () => {
    if (!totpGenData) return;
    const text = totpGenData.backupCodes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nqdrive-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setBackupCodesDownloaded(true);
  };

  const handleCopyBackupCodes = () => {
    if (!totpGenData) return;
    navigator.clipboard.writeText(totpGenData.backupCodes.join("\n"));
    setBackupCodesDownloaded(true);
    toast({ title: "Backup codes copied", variant: "success" });
  };

  const handleVerify2fa = async () => {
    if (!totpGenData || !otpVerifyCode.trim()) return;
    setIsVerifying2fa(true);
    try {
      await apiRequest("/security/2fa/enable", {
        method: "POST",
        body: { token: otpVerifyCode.trim(), secret: totpGenData.secret, backupCodes: totpGenData.backupCodes },
      });
      setIs2faEnabled(true);
      setTwoFactorStep("active");
      setTotpGenData(null);
      setOtpVerifyCode("");
      toast({ title: "2FA enabled successfully", variant: "success" });
    } catch (err: any) {
      toast({ title: err?.message || "Invalid OTP code", variant: "error" });
    } finally {
      setIsVerifying2fa(false);
    }
  };

  const handleDisable2fa = async () => {
    try {
      await apiRequest("/security/2fa/disable", { method: "POST" });
      setIs2faEnabled(false);
      setTwoFactorStep("idle");
      setTotpGenData(null);
      toast({ title: "2FA disabled", variant: "success" });
    } catch {
      toast({ title: "Failed to disable 2FA", variant: "error" });
    }
  };

  if (isFetchingSettings) return <SettingsSkeleton />;

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Settings"
          icon={ShieldCheck}
          title="Security Center"
          description="Manage rate limiting, captcha, two-factor authentication, and IP blocking."
        />

        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            { label: "Login Rate Limit", value: rateLimitLogin === "0" ? "Off" : `${rateLimitLogin} attempts`, icon: Gauge, tone: "sky" as const },
            { label: "Download Rate Limit", value: rateLimitDownload === "0" ? "Off" : `${rateLimitDownload}/day`, icon: Download, tone: "violet" as const },
            { label: "CLI Blocking", value: blockCliDownload === "true" ? "Active" : "Off", icon: Terminal, tone: blockCliDownload === "true" ? "emerald" as const : "brand" as const },
            { label: "Turnstile Captcha", value: turnstileEnabled === "true" ? "Active" : "Off", icon: Shield, tone: turnstileEnabled === "true" ? "emerald" as const : "brand" as const },
          ]).map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* General Security */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
            <Card className="p-5 sm:p-6 h-full">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/40">
                  <Gauge className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Rate Limiting</h2>
                  <p className="text-xs text-[rgb(var(--ink-500))]">Protect against brute force and abuse.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Login Rate Limit</label>
                  <p className="text-[11px] text-[rgb(var(--ink-500))] mb-1.5">Max failed attempts before lockout. 0 = disabled.</p>
                  <Input type="number" min="0" value={rateLimitLogin} onChange={(e) => { setRateLimitLogin(e.target.value); setIsDirty(true); }} className="h-9" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Download Rate Limit</label>
                  <p className="text-[11px] text-[rgb(var(--ink-500))] mb-1.5">Max downloads per IP per 24h. 0 = unlimited.</p>
                  <Input type="number" min="0" value={rateLimitDownload} onChange={(e) => { setRateLimitDownload(e.target.value); setIsDirty(true); }} className="h-9" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border-subtle))] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[rgb(var(--foreground))]">Block CLI Downloads</p>
                    <p className="text-[11px] text-[rgb(var(--ink-500))]">Block wget, curl, aria2, etc.</p>
                  </div>
                  <button
                    onClick={() => { setBlockCliDownload(blockCliDownload === "true" ? "false" : "true"); setIsDirty(true); }}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                      blockCliDownload === "true" ? "bg-brand-500" : "bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[rgb(var(--surface))] shadow-sm ring-0 transition-transform duration-200",
                      blockCliDownload === "true" ? "translate-x-5" : "translate-x-0.5",
                      "mt-0.5"
                    )} />
                  </button>
                </div>
                <Button onClick={handleSaveGeneral} disabled={!isDirty || updateSettings.isPending} className="w-full h-9 text-sm">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Rate Limit Settings
                </Button>
              </div>
            </Card>
          </motion.div>

          {/* Turnstile Captcha */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}>
            <Card className="p-5 sm:p-6 h-full">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/40">
                  <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Turnstile Captcha</h2>
                  <p className="text-xs text-[rgb(var(--ink-500))]">Cloudflare Turnstile for login page.</p>
                </div>
                <Badge variant={turnstileEnabled === "true" ? "success" : "neutral"} className="text-[10px]">
                  {turnstileEnabled === "true" ? "Active" : "Off"}
                </Badge>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border-subtle))] px-4 py-3">
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">Enable Turnstile</p>
                  <button
                    onClick={() => setTurnstileEnabled(turnstileEnabled === "true" ? "false" : "true")}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                      turnstileEnabled === "true" ? "bg-brand-500" : "bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[rgb(var(--surface))] shadow-sm ring-0 transition-transform duration-200",
                      turnstileEnabled === "true" ? "translate-x-5" : "translate-x-0.5",
                      "mt-0.5"
                    )} />
                  </button>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Site Key</label>
                  <Input value={turnstileSitekey} onChange={(e) => setTurnstileSitekey(e.target.value)} placeholder="0x..." className="h-9 mt-1.5 font-mono text-xs" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Secret Key</label>
                  <Input value={turnstileSecretkey} onChange={(e) => setTurnstileSecretkey(e.target.value)} placeholder="0x..." className="h-9 mt-1.5 font-mono text-xs" type="password" />
                </div>
                <Button onClick={handleSaveTurnstile} disabled={updateSettings.isPending} className="w-full h-9 text-sm">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Turnstile Settings
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Two-Factor Authentication */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/40">
                  <Fingerprint className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Two-Factor Authentication</h2>
                  <p className="text-xs text-[rgb(var(--ink-500))]">TOTP-based 2FA with backup codes.</p>
                </div>
              </div>
              <Badge variant={is2faEnabled ? "success" : "neutral"} className="text-[10px]">
                {is2faEnabled ? "Active" : "Off"}
              </Badge>
            </div>

            {twoFactorStep === "idle" && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[rgb(var(--surface-muted))]">
                  <Key className="h-7 w-7 text-[rgb(var(--ink-500))]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[rgb(var(--ink-500))]">2FA is not enabled</p>
                  <p className="text-xs text-[rgb(var(--ink-500))] mt-1">Add an extra layer of security to your account.</p>
                </div>
                <Button onClick={handleGenerate2fa} className="h-9 text-sm gap-1.5">
                  <Key className="h-3.5 w-3.5" /> Enable 2FA
                </Button>
              </div>
            )}

            {twoFactorStep === "generating" && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              </div>
            )}

            {twoFactorStep === "setup" && totpGenData && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-[rgb(var(--border-subtle))] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Scan QR Code</p>
                    <div className="rounded-xl bg-[rgb(var(--surface))] p-3">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpGenData.qrUri)}`} alt="QR" className="h-[180px] w-[180px]" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))] mb-1.5">Secret Key</p>
                      <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border-subtle))] px-3 py-2 bg-[rgb(var(--surface-muted))]">
                        <code className="flex-1 text-xs font-mono text-[rgb(var(--ink-500))] break-all">
                          {showSecret ? totpGenData.secret : "••••••••••••••••"}
                        </code>
                        <button onClick={() => setShowSecret(!showSecret)} className="text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))]">
                          {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => { navigator.clipboard.writeText(totpGenData.secret); toast({ title: "Secret copied", variant: "success" }); }} className="text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))]">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))] mb-1.5">Backup Codes</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {totpGenData.backupCodes.map((code) => (
                          <code key={code} className="rounded-md bg-[rgb(var(--surface-muted))] px-2 py-1 text-[11px] font-mono text-[rgb(var(--ink-500))] text-center">{code}</code>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={handleDownloadBackupCodes}>
                          <Download className="h-3 w-3" /> Save
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={handleCopyBackupCodes}>
                          <Clipboard className="h-3 w-3" /> Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[rgb(var(--border-subtle))] pt-4">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Verify OTP Code</label>
                  <p className="text-[11px] text-[rgb(var(--ink-500))] mb-2">Enter the 6-digit code from your authenticator app.</p>
                  <div className="flex gap-2">
                    <Input
                      value={otpVerifyCode}
                      onChange={(e) => setOtpVerifyCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      className="h-9 font-mono text-center tracking-[0.3em] flex-1"
                    />
                    <Button onClick={handleVerify2fa} disabled={isVerifying2fa || !otpVerifyCode.trim() || !backupCodesDownloaded} className="h-9 text-sm">
                      {isVerifying2fa ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Enable"}
                    </Button>
                  </div>
                  {!backupCodesDownloaded && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">Save or copy your backup codes first.</p>
                  )}
                </div>
              </div>
            )}

            {twoFactorStep === "active" && (
              <div className="flex flex-col sm:flex-row items-center gap-4 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/30">
                  <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-sm font-semibold text-[rgb(var(--foreground))]">2FA is active</p>
                  <p className="text-xs text-[rgb(var(--ink-500))] mt-0.5">Your account is protected with TOTP authentication.</p>
                </div>
                <Button variant="outline" size="sm" className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30" onClick={handleDisable2fa}>
                  Disable 2FA
                </Button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* IP Blacklist */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.25 }}>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-5 sm:p-6 pb-0 sm:pb-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/40">
                  <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">IP Blacklist</h2>
                  <p className="text-xs text-[rgb(var(--ink-500))]">Currently blocked IPs from login brute force or download abuse.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={fetchBlockedIps} disabled={isLoadingIps}>
                <RefreshCw className={cn("h-3.5 w-3.5", isLoadingIps && "animate-spin")} /> Refresh
              </Button>
            </div>

            <div className="p-5 sm:p-6 pt-4 sm:pt-4">
              {isLoadingIps && blockedIps.length === 0 ? (
                <div className="space-y-2">
                  <div className="h-12 bg-[rgb(var(--surface-muted))] rounded-xl animate-pulse" />
                  <div className="h-12 bg-[rgb(var(--surface-muted))] rounded-xl animate-pulse" />
                </div>
              ) : blockedIps.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[rgb(var(--surface-muted))]">
                    <Globe className="h-6 w-6 text-[rgb(var(--ink-500))]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[rgb(var(--ink-500))]">No blocked IPs</p>
                    <p className="text-xs text-[rgb(var(--ink-500))] mt-0.5">All clear — no IPs are currently blocked.</p>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[rgb(var(--surface-muted))]/60">
                      <TableHead>IP Address</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedIps.map((item) => (
                      <TableRow key={item.ip}>
                        <TableCell className="font-mono text-xs font-medium">{item.ip}</TableCell>
                        <TableCell>
                          <Badge variant={item.type === "login" ? "warning" : "default"} className="text-[10px]">
                            {item.type === "login" ? "Brute Force" : "Download Limit"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.type === "login" && item.locked_until ? (
                            <span className="text-[11px] text-[rgb(var(--ink-500))] font-mono">
                              Until {new Date(item.locked_until * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[rgb(var(--ink-500))] font-mono">24h Lock</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30" onClick={() => handleUnban(item.ip)}>
                            Unblock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </PageTransition>
  );
}
