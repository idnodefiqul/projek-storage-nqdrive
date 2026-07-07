/**
 * Idempotent D1 migrate wrapper.
 * D1/SQLite does not support ADD COLUMN IF NOT EXISTS, so this script runs
 * known legacy ALTER statements first and ignores safe "already exists" errors.
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, "..");

const DB_NAME = "nqdrive-db";
const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const isLocal = args.includes("--local");

if (isRemote === isLocal) {
  console.error("Pilih SATU target: --local atau --remote.");
  process.exit(1);
}

const targetFlag = isRemote ? "--remote" : "--local";

// Resolve wrangler binary from local node_modules
const isWin = process.platform === "win32";
const localBin = resolve(workerRoot, "node_modules", ".bin", isWin ? "wrangler.CMD" : "wrangler");
const wranglerBin = existsSync(localBin) ? localBin : "wrangler";

function shellEscape(arg) {
  if (isWin) return `"${arg.replace(/"/g, '""')}"`;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function runWrangler(wranglerArgs, options = {}) {
  const cmd = [shellEscape(wranglerBin), ...wranglerArgs.map(shellEscape)].join(" ");
  return execSync(cmd, {
    cwd: workerRoot,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    shell: true,
  });
}

function runOptionalAlter(sql) {
  try {
    console.log(`[migrate] ALTER: ${sql}`);
    runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", sql]);
    console.log("[migrate] ALTER OK (kolom ditambahkan).");
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const safeToIgnore =
      output.includes("duplicate column name") ||
      output.includes("no such table");

    if (safeToIgnore) {
      console.log("[migrate] ALTER skipped (kolom sudah ada atau tabel belum ada).");
    } else {
      throw error;
    }
  }
}

// Step 1: ensure share_uuid column exists on folders table
runOptionalAlter("ALTER TABLE folders ADD COLUMN share_uuid TEXT DEFAULT NULL;");

// Step 2: run full idempotent schema
console.log("[migrate] Running dbcloud.sql ...");
runWrangler(["d1", "execute", DB_NAME, targetFlag, "--file=./dbcloud.sql"], {
  stdio: "inherit",
});
console.log("[migrate] Done.");
