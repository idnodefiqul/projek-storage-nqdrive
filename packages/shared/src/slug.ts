/**
 * Converts an arbitrary filename into a URL-safe slug usable in public download links
 * (e.g. "/windows11.gz"). Preserves the file extension so download clients (wget, curl,
 * browsers) can infer content type correctly.
 */
export function slugifyFilename(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < filename.length - 1;

  const name = hasExtension ? filename.slice(0, lastDotIndex) : filename;
  const extension = hasExtension ? filename.slice(lastDotIndex + 1) : "";

  const slugBase = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return extension ? `${slugBase}.${extension.toLowerCase()}` : slugBase;
}

/**
 * Appends a short random suffix to a slug to guarantee uniqueness on collision,
 * e.g. "windows11.gz" -> "windows11-x7k2.gz".
 */
export function makeSlugUnique(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  const lastDotIndex = slug.lastIndexOf(".");

  if (lastDotIndex > 0) {
    return `${slug.slice(0, lastDotIndex)}-${suffix}${slug.slice(lastDotIndex)}`;
  }
  return `${slug}-${suffix}`;
}
