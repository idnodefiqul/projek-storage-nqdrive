/**
 * Adapter ExecutionContext untuk runtime Node.
 *
 * Di Cloudflare Workers, ctx.waitUntil() menahan isolate tetap hidup sampai
 * promise selesai. Di Node proses tetap hidup selama server jalan, jadi cukup
 * fire-and-forget — tapi error TIDAK boleh jadi unhandled rejection yang
 * menjatuhkan proses.
 */
export const nodeExecutionContext = {
  waitUntil(promise: Promise<unknown>): void {
    promise.catch((err) => console.error("[waitUntil]", err));
  },
  passThroughOnException(): void {},
};
