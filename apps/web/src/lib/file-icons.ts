import {
  FileText, Image as ImageIcon, Video, Music, FileArchive,
  Disc, Package, File as GenericFileIcon, FileCode, FileSpreadsheet,
  Presentation, Database, type LucideIcon,
} from "lucide-react";

export interface FileTypeInfo {
  Icon: LucideIcon;
  label: string;
  color: string;
  bg: string;
  previewable: "image" | "video" | "audio" | "pdf" | "text" | null;
}

const EXT_MAP: Record<string, FileTypeInfo> = {};

function reg(exts: string[], info: FileTypeInfo) {
  for (const e of exts) EXT_MAP[e] = info;
}

reg(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif", "ico", "tiff"],
  { Icon: ImageIcon, label: "Image", color: "text-cyan-500", bg: "bg-cyan-500/10", previewable: "image" });

reg(["mp4", "mkv", "mov", "avi", "webm", "flv", "m4v", "wmv", "3gp"],
  { Icon: Video, label: "Video", color: "text-purple-500", bg: "bg-purple-500/10", previewable: "video" });

reg(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus"],
  { Icon: Music, label: "Audio", color: "text-pink-500", bg: "bg-pink-500/10", previewable: "audio" });

reg(["pdf"],
  { Icon: FileText, label: "PDF", color: "text-red-500", bg: "bg-red-500/10", previewable: "pdf" });

reg(["txt", "md", "log", "csv", "ini", "cfg", "conf", "yml", "yaml", "toml", "env", "gitignore", "editorconfig", "properties"],
  { Icon: FileText, label: "Text", color: "text-sky-500", bg: "bg-sky-500/10", previewable: "text" });

reg(["json", "xml", "html", "htm", "css", "js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "go", "rs", "rb", "php", "sh", "bat", "ps1", "sql", "lua", "swift", "kt", "dart", "r", "scala", "vue", "svelte"],
  { Icon: FileCode, label: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10", previewable: "text" });

reg(["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst", "lz4"],
  { Icon: FileArchive, label: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", previewable: null });

reg(["iso", "img", "dmg", "vhd", "vmdk"],
  { Icon: Disc, label: "Disk Image", color: "text-indigo-500", bg: "bg-indigo-500/10", previewable: null });

reg(["apk", "aab", "deb", "rpm", "msi", "exe", "appimage"],
  { Icon: Package, label: "Package", color: "text-emerald-600", bg: "bg-emerald-500/10", previewable: null });

reg(["xls", "xlsx", "ods", "numbers"],
  { Icon: FileSpreadsheet, label: "Spreadsheet", color: "text-green-600", bg: "bg-green-500/10", previewable: null });

reg(["ppt", "pptx", "odp", "key"],
  { Icon: Presentation, label: "Presentation", color: "text-orange-500", bg: "bg-orange-500/10", previewable: null });

reg(["doc", "docx", "odt", "rtf", "pages"],
  { Icon: FileText, label: "Document", color: "text-blue-600", bg: "bg-blue-500/10", previewable: null });

reg(["db", "sqlite", "sqlite3", "mdb"],
  { Icon: Database, label: "Database", color: "text-violet-500", bg: "bg-violet-500/10", previewable: null });

const FALLBACK: FileTypeInfo = {
  Icon: GenericFileIcon, label: "File", color: "text-zinc-400", bg: "bg-zinc-500/10", previewable: null,
};

export function getFileTypeInfo(filename: string): FileTypeInfo {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return FALLBACK;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? FALLBACK;
}
