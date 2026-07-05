import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield, Lock, Eye, FileText, CheckCircle } from "lucide-react";
import { Button } from "@nqdrive/ui";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const siteName = import.meta.env.VITE_SITE_NAME || "NQDRIVE";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 selection:bg-brand-500/30">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">

        {/* Header */}
        <div className="mb-12">
          <Link to="/">
            <Button variant="ghost" className="mb-6 -ml-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-500/20 shadow-sm border border-brand-200 dark:border-brand-500/30">
              <Shield className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Learn how {siteName} protects your data, ensures your privacy, and handles file transfers securely.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-12 bg-white dark:bg-zinc-900 p-8 md:p-10 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-6 w-6 text-brand-500" />
              <h2 className="text-2xl font-bold tracking-tight">Data Security & Encryption</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
              At {siteName}, your security is our top priority. All file transfers between your device and our storage network are secured using industry-standard TLS (Transport Layer Security) encryption. This ensures that your files cannot be intercepted or read by third parties while in transit.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">End-to-end encryption for all upload and download streams.</p>
              </div>
              <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Strict metadata separation to prevent unauthorized access.</p>
              </div>
            </div>
          </section>

          <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800" />

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-6 w-6 text-brand-500" />
              <h2 className="text-2xl font-bold tracking-tight">Information Collection</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
              We believe in minimizing data collection. We only collect the technical information absolutely necessary to provide you with fast and reliable file delivery:
            </p>
            <ul className="space-y-3 text-zinc-600 dark:text-zinc-400 mb-6">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                <span><strong>IP Addresses:</strong> Used strictly for rate-limiting, abuse prevention, and bandwidth allocation.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                <span><strong>Download Logs:</strong> We track total download counts and traffic volume to maintain service quality.</span>
              </li>
            </ul>
            <div className="bg-brand-50 dark:bg-brand-500/10 p-4 rounded-2xl border border-brand-100 dark:border-brand-500/20">
              <p className="text-sm text-brand-800 dark:text-brand-300 font-medium">
                We do not sell, rent, or share your personal information or file metadata with any third-party advertisers.
              </p>
            </div>
          </section>

          <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800" />

          <section>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-6 w-6 text-brand-500" />
              <h2 className="text-2xl font-bold tracking-tight">Content Responsibility</h2>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {siteName} acts solely as a virtual storage and delivery bridge. We do not index, search, or make public the files uploaded through our platform unless explicitly shared by the uploader. The responsibility for the legality and copyright status of the files remains entirely with the uploader. If we receive a valid DMCA takedown request or notice of illegal content, the associated files and sharing links will be permanently removed from our network.
            </p>
          </section>

        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

      </div>
    </div>
  );
}