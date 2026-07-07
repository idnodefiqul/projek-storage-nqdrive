import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSetupStatus, useMe } from "../hooks/auth";
import { motion } from "framer-motion";
import {
  Zap, ShieldCheck, Database,
  FolderOpen, ChartColumn, RefreshCw, ArrowRight,
} from "lucide-react";
import { Button, Card, CardHeader, CardTitle, CardContent } from "@nqdrive/ui";
import { SiteNavbar } from "../components/site-navbar";
import { SiteFooter } from "../components/site-footer";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const { data: setupStatus, isLoading } = useSetupStatus();
  const { data: user } = useMe();
  const isAuthenticated = !!user;

  // Redirect to /setup ONLY if setup is not yet completed
  useEffect(() => {
    if (!isLoading && setupStatus && !setupStatus.setupCompleted) {
      navigate({ to: "/setup", replace: true });
    }
  }, [isLoading, setupStatus, navigate]);

  if (isLoading || (setupStatus && !setupStatus.setupCompleted)) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-500/20 border-t-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-brand-500/30">
      <SiteNavbar isAuthenticated={isAuthenticated} />
      
      <main className="flex flex-col items-center w-full">
        <HeroSection isAuthenticated={isAuthenticated} />
        <FeaturesSection />
      </main>

      <SiteFooter isAuthenticated={isAuthenticated} />
    </div>
  );
}

function HeroSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

  return (
    <section className="relative flex flex-col items-center justify-center pt-40 pb-20 px-6 text-center w-full max-w-4xl mx-auto min-h-[75vh]">
      {/* Background radial gradient */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(16,185,129,0.12) 0%, transparent 70%)" }}
      />

      <motion.div 
        className="relative z-10 flex flex-col items-center gap-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="rounded-full border border-zinc-200 bg-white/50 px-4 py-1.5 text-xs font-semibold text-zinc-600 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-300 shadow-sm">
          Cloud Storage Manager
        </motion.div>
        
        <motion.h1 variants={item} className="text-5xl md:text-7xl font-extrabold tracking-tight text-zinc-900 dark:text-white max-w-3xl leading-[1.1]">
          Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-emerald-500 dark:from-brand-400 dark:to-emerald-400">{import.meta.env.VITE_SITE_NAME || "NQDRIVE"}</span>
        </motion.h1>
        
        <motion.p variants={item} className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
          A modern platform for managing cloud storage with a fast, secure, and intuitive experience. Connect multiple accounts and unify your files effortlessly.
        </motion.p>
        
        <motion.div variants={item} className="flex flex-col sm:flex-row items-center gap-4 mt-4">
          {isAuthenticated ? (
            <Link to="/dashboard" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-semibold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-105 transition-all">
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-semibold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-105 transition-all">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
          <a href="#features" className="w-full sm:w-auto">
            <button className="w-full sm:w-auto rounded-full px-8 h-12 text-base font-semibold transition-all inline-flex items-center justify-center gap-2
              border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50
              dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15
              backdrop-blur-sm shadow-sm hover:scale-105">
              Learn More
            </button>
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}

const features = [
  {
    icon: Zap,
    title: "Fast Upload",
    description: "Upload files quickly with optimized transfer performance.",
  },
  {
    icon: ShieldCheck,
    title: "Secure",
    description: "Protected authentication and secure access to your storage.",
  },
  {
    icon: Database,
    title: "Unlimited Storage",
    description: "Expand your storage capacity by connecting multiple cloud accounts.",
  },
  {
    icon: FolderOpen,
    title: "Unified File Manager",
    description: "Manage files and folders from one clean, organized interface.",
  },
  {
    icon: ChartColumn,
    title: "Storage Analytics",
    description: "Monitor storage usage and capacity with real-time insights.",
  },
  {
    icon: RefreshCw,
    title: "Automatic Balancing",
    description: "Automatically distribute files across available storage.",
  }
];

function FeaturesSection() {
  return (
    <section id="features" className="w-full max-w-6xl mx-auto px-6 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Everything you need</h2>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">Powerful features to manage your files at scale.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
          >
            <Card className="group h-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/50 hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-brand-500/10 transition-all duration-300 hover:-translate-y-1">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <feature.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
