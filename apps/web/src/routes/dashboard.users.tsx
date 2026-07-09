import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { UserCircle2, Plus, ShieldAlert, Eye, EyeOff, ChevronDown, ArrowUpDown } from "lucide-react";
import { Badge, Skeleton } from "@nqdrive/ui";
import { useAuthContext } from "../stores/auth-provider";
import { PageTransition } from "../components/page-transition";
import { useMinLoading } from "../hooks/use-min-loading";
import { getAvatarSvg } from "../lib/avatar";

export const Route = createFileRoute("/dashboard/users")({
  component: UsersPage,
});

function EmailDisplay({ email }: { email?: string }) {
  const [shown, setShown] = useState(false);
  
  if (!email) {
    return <span className="italic text-zinc-400 dark:text-zinc-500 text-xs md:text-sm">Belum diisi — update via database</span>;
  }

  const maskEmail = (e: string) => {
    const parts = e.split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return e;
    return `${parts[0].slice(0, 3)}***@${parts[1]}`;
  };

  const displayEmail = shown ? email : maskEmail(email);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400">{displayEmail}</span>
      <button 
        type="button" 
        onClick={() => setShown(s => !s)}
        className="text-zinc-400 hover:text-brand-500 transition-colors shrink-0"
      >
        {shown ? <EyeOff className="h-3.5 w-3.5 md:h-4 md:w-4" /> : <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />}
      </button>
    </div>
  );
}

function UsersPage() {
  const { user } = useAuthContext();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Fake loading for 600ms consistency with other pages
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useEffect(() => {
    setIsInitialLoad(false);
  }, []);
  const isLoading = useMinLoading(isInitialLoad, 600);

  // Filter logic
  const query = searchQuery.toLowerCase();
  const isMatch = !query || 
    (user?.email && user.email.toLowerCase().includes(query)) || 
    (user?.username && user.username.toLowerCase().includes(query));

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Users</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Kelola akses pengguna untuk aplikasi {import.meta.env.VITE_SITE_NAME || "NQDRIVE"}.
            </p>
          </div>
          <button
            disabled
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all opacity-60 cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Coming Soon
          </button>
        </div>

        {/* Data Table Container */}
        <div className="flex flex-1 flex-col">
          {/* Table Container with Border */}
          <div className="flex-1 flex flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
            
            {/* Table Toolbar (Inside Card) */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-1 items-center space-x-2">
                <input 
                  placeholder="Filter emails..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-[150px] lg:w-[250px] rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300" 
                />
              </div>
              <button className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 ml-auto">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                <tr>
                  <th className="h-10 px-4 align-middle font-medium text-zinc-500 dark:text-zinc-400 text-left">
                     Pengguna
                  </th>
                  <th className="hidden md:table-cell h-10 px-4 align-middle font-medium text-zinc-500 dark:text-zinc-400 text-left">
                    <button className="inline-flex items-center gap-2 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                      Email
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                  </th>
                  <th className="hidden md:table-cell h-10 px-4 align-middle font-medium text-zinc-500 dark:text-zinc-400 text-left">Peran</th>
                  <th className="h-10 px-4 align-middle font-medium text-zinc-500 dark:text-zinc-400 text-left md:text-right">Status</th>
                  <th className="h-10 px-4 align-middle font-medium text-zinc-500 dark:text-zinc-400 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {isLoading ? (
                  // Skeleton state
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-32 md:hidden" />
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-4">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="hidden md:table-cell px-4 py-4">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-4 md:text-right">
                        <Skeleton className="h-5 w-16 md:ml-auto" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </td>
                    </tr>
                  ))
                ) : isMatch ? (
                  <tr className="transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-4 font-medium text-zinc-900 dark:text-zinc-100 align-top md:align-middle">
                      <div className="flex items-start md:items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 border border-brand-200 dark:border-brand-800 dark:bg-brand-900/30 mt-0.5 md:mt-0 overflow-hidden">
                          <img 
                            src={getAvatarSvg(user?.username || user?.email || "User")} 
                            alt={user?.username || "Avatar"} 
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-base">{user?.username}</span>
                          {/* Mobile Details */}
                          <div className="mt-1.5 flex flex-col gap-1.5 md:hidden">
                            <div className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 font-medium">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Administrator
                            </div>
                            <EmailDisplay email={user?.email} />
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    {/* Desktop Details */}
                    <td className="hidden md:table-cell px-4 py-4 align-middle">
                      <EmailDisplay email={user?.email} />
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 align-middle">
                      <div className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-medium">
                        <ShieldAlert className="h-4 w-4" />
                        Administrator
                      </div>
                    </td>
                    
                    <td className="px-4 py-4 align-top md:align-middle md:text-right">
                      <Badge variant="success" className="rounded-md inline-flex items-center gap-1.5 px-2.5 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]"></span>
                        Aktif
                      </Badge>
                    </td>
                    
                    <td className="px-4 py-4 align-middle text-center">
                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-100 text-zinc-500 dark:hover:bg-zinc-800 transition-colors">
                        {/* Ikon 4 titik vertikal custom sesuai permintaan */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <circle cx="12" cy="5" r="1.7" />
                          <circle cx="12" cy="9.6" r="1.7" />
                          <circle cx="12" cy="14.2" r="1.7" />
                          <circle cx="12" cy="18.8" r="1.7" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="h-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex items-center justify-between p-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex-1 text-sm text-zinc-500 dark:text-zinc-400">
              0 of {isMatch && !isLoading ? "1" : "0"} row(s) selected.
            </div>
            <div className="flex items-center space-x-2">
              <button 
                disabled
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Previous
              </button>
              <button 
                disabled
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </PageTransition>
  );
}
