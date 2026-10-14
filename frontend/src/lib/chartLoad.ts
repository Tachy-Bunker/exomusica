import { api } from "./api";
import { hashStr } from "./probeCore";
import type { ChartBranch } from "./chart";

type Node = { id: number; parentId: number | null; slug?: string; name?: string; secret?: boolean; key?: string };
/** The Chart's rooms. A sealed room arrives without a name or address; one you have already walked into is recognised by a hash of its address and then asked for its name. Throws when the chart can't be read. */
export async function loadChartBranches(visited: ReadonlySet<string>): Promise<ChartBranch[]> {
  const d = await api<Node[]>("/api/chart");
  if (!Array.isArray(d)) throw new Error("bad chart");
  const bySlug = new Map([...visited].map((s) => [hashStr(s), s]));
  return Promise.all(d.map(async (n): Promise<ChartBranch> => {
    if (!n.secret) return { id: n.id, slug: n.slug ?? "", name: n.name ?? "", parentId: n.parentId };
    const slug = n.key ? bySlug.get(n.key) : undefined;
    const name = slug ? await api<{ name?: string }>(`/api/branches/${encodeURIComponent(slug)}`).then((b) => b?.name ?? slug).catch(() => slug) : "";
    return { id: n.id, slug: slug ?? "", name, parentId: n.parentId, secret: true, key: n.key };
  }));
}
