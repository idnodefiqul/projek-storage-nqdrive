import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Key, Layers, Shield } from "lucide-react";
import { Button } from "@nqdrive/ui";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">
        
        {/* Header */}
        <div className="mb-12">
          <Link to="/">
            <Button variant="ghost" className="mb-6 -ml-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Documentation</h1>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Welcome to the NQDRIVE documentation. Learn how to unify and manage your cloud storage architecture effectively.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-12">
          
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-5 w-5 text-brand-500" />
              <h2 className="text-2xl font-semibold">Multi-Account Architecture</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
              NQDRIVE operates on a modern multi-account unification model. Instead of relying on a single centralized storage node, our platform allows you to bridge multiple cloud storage nodes into a single, cohesive virtual drive.
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-400 ml-2">
              <li>Seamlessly pool storage capacity across different nodes.</li>
              <li>Distribute heavy workloads to prevent bottlenecking.</li>
              <li>Experience automatic capacity balancing when a node reaches its limit.</li>
            </ul>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Key className="h-5 w-5 text-brand-500" />
              <h2 className="text-2xl font-semibold">Node Authentication</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
              To add a new storage node to your unified pool, you must provide the necessary service authentication keys. NQDRIVE uses secure OAuth and Service Account token standards to maintain a persistent and safe connection to your nodes without storing user passwords.
            </p>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-white/10 text-sm font-mono text-zinc-600 dark:text-zinc-400">
              1. Navigate to Dashboard {'>'} Accounts<br/>
              2. Click "Add Node"<br/>
              3. Upload your Service Account JSON credentials<br/>
              4. Wait for the initial capacity sync
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-brand-500" />
              <h2 className="text-2xl font-semibold">Security & Privacy</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Security is at the core of NQDRIVE. All data transfers between the unified manager and your cloud nodes occur over encrypted TLS connections. We ensure that file metadata is synchronized securely, while actual file streams are piped directly to maintain strict privacy standards.
            </p>
          </section>

        </div>

      </div>
    </div>
  );
}
