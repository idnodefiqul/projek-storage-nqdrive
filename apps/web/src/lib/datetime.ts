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

export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("id-ID", opts);
}

export function formatLocal(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return formatDate(date, opts);
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return formatDate(d, { day: "2-digit", month: "short", year: "numeric" });
}
