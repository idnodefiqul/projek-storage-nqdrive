/**
 * Batch backfill for remaining logs (download_logs, audit_logs)
 * Generates a single SQL file with many UPDATEs and executes in one go via wrangler
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, "..");
const DB_NAME = "nqdrive-db";
const isRemote = process.argv.includes("--remote");
const targetFlag = isRemote ? "--remote" : "--local";

const isWin = process.platform === "win32";
const localBin = resolve(workerRoot, "node_modules", ".bin", isWin ? "wrangler.CMD" : "wrangler");
const wranglerBin = existsSync(localBin) ? localBin : "wrangler";

function shellEscape(arg) {
  if (isWin) return `"${arg.replace(/"/g, '""')}"`;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
function runWrangler(args, opts = {}) {
  const cmd = [shellEscape(wranglerBin), ...args.map(shellEscape)].join(" ");
  return execSync(cmd, { cwd: workerRoot, encoding: "utf8", stdio: opts.stdio ?? ["ignore", "pipe", "pipe"], shell: true });
}
function runQuery(sql) {
  const out = runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", sql, "--json"]);
  try {
    const parsed = JSON.parse(out);
    return parsed[0]?.results ?? [];
  } catch { return []; }
}
function randomAlphanumeric(len) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let res = "";
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const b = new Uint8Array(len);
    c.getRandomValues(b);
    for (let i=0;i<len;i++) res+=chars[b[i]%chars.length];
  } else {
    for (let i=0;i<len;i++) res+=chars[Math.floor(Math.random()*chars.length)];
  }
  return res;
}
function genId(prefix){ return `${prefix}_${randomAlphanumeric(26)}`; }

async function backfillTable(table, prefix, batchSize=100) {
  console.log(`\n[batch] ${table} (${prefix})...`);
  const rows = runQuery(`SELECT id FROM ${table} WHERE public_id IS NULL OR public_id = ''`);
  if (!rows.length) { console.log(`[batch] ${table}: 0 remaining`); return 0; }
  console.log(`[batch] ${table}: ${rows.length} rows to backfill`);

  let total=0;
  for (let i=0;i<rows.length;i+=batchSize) {
    const chunk = rows.slice(i, i+batchSize);
    const sqlLines = chunk.map(r => {
      const pid = genId(prefix);
      return `UPDATE ${table} SET public_id = '${pid}' WHERE id = ${r.id};`;
    });
    const sqlContent = sqlLines.join("\n");
    const tempFile = resolve(workerRoot, `temp-${table}-${i}.sql`);
    writeFileSync(tempFile, sqlContent, "utf8");
    try {
      runWrangler(["d1", "execute", DB_NAME, targetFlag, `--file=${tempFile}`]);
      console.log(`  - batch ${i}..${i+chunk.length-1} done (${chunk.length} rows)`);
      total+=chunk.length;
    } catch(e){
      console.error(`  ! batch ${i} failed`, e.stdout?.slice(0,200));
    } finally {
      try { unlinkSync(tempFile); } catch {}
    }
  }
  return total;
}

console.log(`[batch] Target ${targetFlag}`);
let total = 0;
total += await backfillTable("download_logs", "dnl", 100);
total += await backfillTable("audit_logs", "aud", 100);
total += await backfillTable("upload_logs", "upl", 100);

console.log(`\n[batch] Done total ${total} rows backfilled`);

// verify
for (const tbl of ["download_logs","audit_logs","upload_logs"]) {
  const rem = runQuery(`SELECT COUNT(*) as cnt FROM ${tbl} WHERE public_id IS NULL OR public_id = ''`);
  console.log(`  ${tbl}: ${rem[0]?.cnt ?? 0} remaining NULL`);
}
