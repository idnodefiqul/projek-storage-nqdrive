import { createFileRoute } from "@tanstack/react-router";
import { UserCircle2 } from "lucide-react";
import { Card, CardContent } from "@nqdrive/ui";
import { useAuthContext } from "../stores/auth-provider";

export const Route = createFileRoute("/dashboard/users")({
  component: UsersPage,
});

/**
 * NQDRIVE is intentionally single-admin (per project decision in Tahap 4) — there is no
 * multi-user management here by design. This page simply confirms who the current admin is;
 * password changes live in Settings.
 */
function UsersPage() {
  const { user } = useAuthContext();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Users</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          NQDRIVE dirancang untuk satu admin tunggal — tidak ada manajemen multi-user.
        </p>
      </div>

      <Card className="max-w-lg">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            <UserCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{user?.username}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Administrator</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
