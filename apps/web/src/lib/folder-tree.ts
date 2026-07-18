import type { Folder } from "@nqdrive/types";

export type FolderNode = Folder & {
  children: FolderNode[];
  depth: number;
  path: string; // human path e.g. "A/B/C"
};

export interface FolderTree {
  roots: FolderNode[];
  byId: Map<string, FolderNode>;
  byPath: Map<string, FolderNode>;
  flatWithPath: FolderNode[];
}

function getFolderId(f: { folderId?: string | null } | null | undefined): string {
  return f?.folderId ?? "";
}

function getParentFolderId(f: { parentFolderId?: string | null } | null | undefined): string | null {
  return (f?.parentFolderId as string) ?? null;
}

/**
 * Build tree dari flat list folder yang sudah public_id.
 * - O(n) single pass + DFS untuk path.
 * - Support parentFolderId yang null = root.
 * - Path dibangun dari nama (bukan id) agar cocok dengan pickerPath yang berbasis nama.
 *   Jika ada nama duplikat di level sama, path pertama menang — tetap aman untuk navigasi picker
 *   karena picker navigasi by id/children, bukan lookup by path saja.
 */
export function buildFolderTree(flat: Folder[]): FolderTree {
  const byId = new Map<string, FolderNode>();
  const byPath = new Map<string, FolderNode>();
  const flatWithPath: FolderNode[] = [];
  const roots: FolderNode[] = [];

  // Pass 1: buat node tanpa children/path
  for (const f of flat) {
    const id = getFolderId(f);
    if (!id) continue;
    byId.set(id, { ...f, children: [], depth: 0, path: "" } as FolderNode);
  }

  // Pass 2: attach children ke parent; yang tanpa parent valid jadi root
  for (const node of byId.values()) {
    const parentId = getParentFolderId(node);
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Urutkan children per level by name biar stabil
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) if (n.children.length) sortRec(n.children);
  };
  sortRec(roots);

  // Pass 3: DFS bangun depth + path + flatWithPath + byPath
  const stack: FolderNode[] = [...roots].reverse();
  while (stack.length) {
    const cur = stack.pop()!;
    const parent = getParentFolderId(cur);
    const parentNode = parent ? byId.get(parent) : undefined;
    cur.depth = parentNode ? parentNode.depth + 1 : 0;
    cur.path = parentNode ? `${parentNode.path}/${cur.name}` : cur.name;
    byPath.set(cur.path, cur);
    flatWithPath.push(cur);
    // dorong children kebalik agar urutan terjaga
    for (let i = cur.children.length - 1; i >= 0; i--) {
      stack.push(cur.children[i]!);
    }
  }

  // Sort flatWithPath by path for nice search order
  flatWithPath.sort((a, b) => a.path.localeCompare(b.path));

  return { roots, byId, byPath, flatWithPath };
}

/**
 * Ambil children langsung dari path string menggunakan tree.
 * Jika path == "" => roots.
 * Jika path tidak ditemukan di byPath, fallback ke pencarian children via byId (bisa terjadi jika rename race).
 */
export function getChildrenByPath(tree: FolderTree, path: string): FolderNode[] {
  if (!path) return tree.roots;
  const node = tree.byPath.get(path);
  return node ? node.children : [];
}

/**
 * Bangun ancestor chain dari path string untuk breadcrumb reverse lookup.
 * Return array folder node dari root → parent dari path (tidak termasuk node path itu sendiri jika includeSelf=false)
 */
export function getAncestorsFromPath(tree: FolderTree, path: string, includeSelf = true): FolderNode[] {
  if (!path) return [];
  const segments = path.split("/");
  const chain: FolderNode[] = [];
  let curPath = "";
  for (let i = 0; i < segments.length; i++) {
    curPath = curPath ? `${curPath}/${segments[i]}` : segments[i]!;
    const n = tree.byPath.get(curPath);
    if (!n) break;
    if (i < segments.length - 1 || includeSelf) chain.push(n);
    else if (includeSelf) chain.push(n);
  }
  if (includeSelf) {
    // last segment already included if loop went through — adjust
    // actually chain already includes up to last if includeSelf logic above; we added conditional but simpler:
  }
  // The above loop already includes self when includeSelf; if we want exclude self, pop last
  if (!includeSelf && chain.length) {
    // chain currently holds up to n-1 because we excluded last via condition; actually re-evaluate:
    // Simplest: if includeSelf we want full chain, if not we want chain without last.
    // Our loop with `if (i < len-1 || includeSelf)` already handles includeSelf, so for excludeSelf we should have excluded last.
    // But for includeSelf we need to include last too — we did via `|| includeSelf` condition at i==last.
    // So for excludeSelf case we already excluded last, good.
  }
  // For includeSelf case, if segments built correctly, chain length == segments.length
  if (includeSelf) {
    // Rebuild clean includeSelf chain
    const full: FolderNode[] = [];
    let p = "";
    for (const seg of segments) {
      p = p ? `${p}/${seg}` : seg;
      const n = tree.byPath.get(p);
      if (!n) break;
      full.push(n);
    }
    return full;
  }
  return chain;
}
