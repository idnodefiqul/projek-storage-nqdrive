/**
 * Parses an HTTP `Range` request header into a byte range.
 *
 * Supports the subset of RFC 7233 that download clients actually send in practice:
 *   "bytes=START-END", "bytes=START-" (open-ended), "bytes=-SUFFIX" (last N bytes).
 * Multi-range requests ("bytes=0-99,200-299") are NOT supported — extremely rare for
 * file downloads in the wild (browsers, wget, curl, download managers all send single ranges)
 * and supporting them would require multipart/byteranges responses, adding significant
 * complexity for negligible real-world benefit.
 */

export interface ParsedRange {
  start: number;
  end: number; // inclusive
}

export function parseRangeHeader(rangeHeader: string | null | undefined, totalSize: number): ParsedRange | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;

  const rangeSpec = rangeHeader.slice("bytes=".length).trim();
  if (rangeSpec.includes(",")) return null; // Multi-range not supported — caller falls back to full content.

  const [startStr, endStr] = rangeSpec.split("-");

  // Suffix range: "bytes=-500" means "last 500 bytes".
  if (startStr === "" && endStr !== "") {
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(0, totalSize - suffixLength);
    return { start, end: totalSize - 1 };
  }

  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;

  // Open-ended range: "bytes=500-" means "from byte 500 to the end".
  const end = endStr === "" ? totalSize - 1 : Number(endStr);
  if (!Number.isFinite(end) || end < start) return null;

  return { start, end: Math.min(end, totalSize - 1) };
}
