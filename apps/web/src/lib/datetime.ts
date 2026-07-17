export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getUserUtcOffset(date: Date = new Date()): string {
  try {
    const offset = -date.getTimezoneOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    const sign = offset >= 0 ? "+" : "-";
    return `UTC${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  } catch {
    return "UTC";
  }
}

function parseAsUTC(input: string): Date {
  let s = input.trim();
  // Date only YYYY-MM-DD -> midnight UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + "T00:00:00Z");
  }
  // SQLite CURRENT_TIMESTAMP: YYYY-MM-DD HH:MM:SS -> ISO UTC
  if (s.includes(" ") && !s.includes("T")) {
    s = s.replace(" ", "T");
  }
  // No timezone suffix? Force Z (UTC)
  if (!/[Z+-]\d|Z$/.test(s.slice(-6)) && !s.endsWith("Z")) {
    // Check if last char is digit (no tz)
    if (!/[+-]\d{2}:?\d{2}$/.test(s)) {
      s += "Z";
    }
  }
  return new Date(s);
}

export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? parseAsUTC(date) : date;
  return d.toLocaleString("id-ID", opts);
}

export function formatLocal(date: Date | string, opts?: Intl.DateTimeFormatOptions, timeZone?: string): string {
  const d = typeof date === "string" ? parseAsUTC(date) : date;
  if (timeZone) {
    return d.toLocaleString("id-ID", { ...opts, timeZone });
  }
  return d.toLocaleString("id-ID", opts);
}

export function formatInTimezone(date: Date | string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  return formatLocal(date, opts, tz);
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? parseAsUTC(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return formatDate(d, { day: "2-digit", month: "short", year: "numeric" });
}
