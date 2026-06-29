import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription, NqdriveLogo } from "@nqdrive/ui";
import { useSetupAdmin, useSetupStatus } from "../hooks/use-auth";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const { data: setupStatus, isLoading: isCheckingStatus } = useSetupStatus();
  const setupAdmin = useSetupAdmin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Per kesepakatan: setelah setup pernah dilakukan, halaman ini tidak boleh diakses lagi.
  useEffect(() => {
    if (!isCheckingStatus && setupStatus?.setupCompleted) {
      navigate({ to: "/login" });
    }
  }, [isCheckingStatus, setupStatus, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Konfirmasi password tidak cocok.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password minimal 8 karakter.");
      return;
    }

    try {
      await setupAdmin.mutateAsync({ username, password });
      navigate({ to: "/login" });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Setup gagal.");
    }
  };

  if (isCheckingStatus || setupStatus?.setupCompleted) {
    return null; // Avoid flashing the form before the redirect effect above fires.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <NqdriveLogo className="mb-2 h-12 w-12" />
          <CardTitle className="text-xl">Setup Admin NQDRIVE</CardTitle>
          <CardDescription>
            Ini adalah pengaturan pertama kali. Buat akun admin untuk mengelola NQDRIVE.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Username
              </label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Konfirmasi Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

            <Button type="submit" disabled={setupAdmin.isPending} className="mt-2">
              {setupAdmin.isPending ? "Menyimpan..." : "Buat Akun Admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
