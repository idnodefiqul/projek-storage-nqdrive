import * as React from "react";
import { Button } from "@nqdrive/ui";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error | null; reset: () => void }>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      const Fallback = this.props.fallback;
      if (Fallback) {
        return <Fallback error={this.state.error} reset={this.reset} />;
      }
      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error | null; reset: () => void }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/20">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-red-100 dark:bg-red-900/30">
        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
      </div>
      <div className="max-w-sm">
        <h3 className="text-sm font-bold text-red-800 dark:text-red-200">Terjadi kesalahan</h3>
        <p className="mt-1 text-xs leading-relaxed text-red-600 dark:text-red-400">
          {error?.message || "Halaman gagal dimuat. Coba muat ulang."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={reset}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Coba lagi
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Reload halaman
        </Button>
      </div>
    </div>
  );
}
