import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@nqdrive/ui";

import { routeTree } from "./routeTree.gen";
import { ThemeProvider } from "./stores/theme-provider";
import "./styles/globals.css";

/**
 * Safety net untuk error "failed to fetch dynamically imported module".
 * Terjadi setelah deploy baru — HTML lama (dari cache) masih merefer ke
 * JS chunk lama yang sudah tidak ada.
 *
 * Solusi: reload sambil MEMBUSTING cache HTML lewat query param unik (`_cr`
 * = nomor percobaan, `_t` = timestamp). Query baru memaksa browser mengambil
 * index.html yang FRESH (bukan dari cache), sehingga referensi chunk-nya ikut
 * ter-update. Dibatasi maksimal 2 percobaan agar tidak infinite-loop kalau
 * memang chunk-nya benar-benar hilang.
 */
window.addEventListener("vite:preloadError", () => {
  const url = new URL(window.location.href);
  const attempt = Number(url.searchParams.get("_cr") || "0");
  if (attempt < 2) {
    url.searchParams.set("_cr", String(attempt + 1));
    url.searchParams.set("_t", String(Date.now())); // bust HTTP cache untuk navigasi
    window.location.replace(url.toString());
  }
});


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Custom search param serializer — mencegah TanStack Router meng-encode "/"
 * jadi "%2F" pada nilai query param.
 *
 * Default behavior TanStack Router menggunakan encodeURIComponent untuk setiap
 * nilai, yang mengubah "Windows/11" menjadi "Windows%2F11" di URL bar.
 * Kita ingin "/" tetap sebagai literal "/" karena itu adalah separator
 * antar level folder yang dimaksudkan (bukan karakter yang perlu di-escape
 * dalam nilai query string).
 *
 * stringifySearch : objek → "?folder=Windows/11"
 * parseSearch     : "?folder=Windows/11" → { folder: "Windows/11" }
 */
function stringifySearch(search: Record<string, unknown>): string {
  const params = Object.entries(search)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      // encode value tapi kembalikan %2F → "/" agar slash folder tetap terbaca
      const encodedValue = encodeURIComponent(String(v)).replace(/%2F/gi, "/");
      return `${encodeURIComponent(k)}=${encodedValue}`;
    });
  return params.length ? `?${params.join("&")}` : "";
}

function parseSearch(searchStr: string): Record<string, string> {
  const str = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  if (!str) return {};
  return Object.fromEntries(
    str.split("&").map((pair) => {
      const [k, ...rest] = pair.split("=");
      return [decodeURIComponent(k ?? ""), decodeURIComponent(rest.join("="))];
    })
  );
}

const router = createRouter({ routeTree, stringifySearch, parseSearch });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
