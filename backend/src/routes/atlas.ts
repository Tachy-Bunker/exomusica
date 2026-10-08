import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { ttlCache } from "../lib/ttlCache.js";
import { makeLimiter } from "../lib/resourceAccess.js";
import { isPublicChannel } from "../lib/publicChannels.js";
import { cleanEdges, hrefOf, keyOf, mergeNeighbors, parseKey, topPaths, type EntityType, type Neighbor } from "../lib/atlas.js";

const SHOWN = { in: ["VISIBLE", "BABY_CRYSTALS"] as ("VISIBLE" | "BABY_CRYSTALS")[] };
const mk = (type: EntityType, id: string | number, title: string, sub?: string, image?: string | null): Neighbor => ({ type, key: keyOf(type, id), title, href: hrefOf(type, String(id)), sub, image: image ?? null });

interface ChatRef { slug: string; name: string; branchSlug: string | null; href: string }

/** Everything the address bar can jump to, as short rows: [type, id, title, sub]. Cached briefly; one computation serves everyone. */
const indexRows = ttlCache(60_000, async () => {
  const [branches, studies, albums, wiki, news, topics, resources, calls] = await Promise.all([
    prisma.branch.findMany({ where: { visibility: SHOWN }, select: { slug: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    prisma.study.findMany({ select: { slug: true, title: true, owner: { select: { username: true } } }, orderBy: { updatedAt: "desc" }, take: 400 }),
    prisma.album.findMany({ where: { branch: { visibility: SHOWN } }, select: { slug: true, title: true, composer: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.wikiPage.findMany({ select: { slug: true, title: true }, orderBy: { title: "asc" }, take: 300 }),
    prisma.blogPost.findMany({ where: { publishedAt: { not: null } }, select: { slug: true, title: true }, orderBy: { publishedAt: "desc" }, take: 200 }),
    prisma.forumChannel.findMany({ where: { kind: "DISCUSSION" }, select: { slug: true, name: true }, orderBy: { position: "asc" }, take: 200 }),
    prisma.sampleBankItem.findMany({ select: { id: true, title: true, owner: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.challenge.findMany({ where: { active: true }, select: { id: true, title: true }, take: 100 }),
  ]);
  const rows: [EntityType, string, string, string][] = [];
  for (const b of branches) rows.push(["branch", b.slug, b.name, ""]);
  for (const s of studies) rows.push(["study", s.slug, s.title, s.owner.username]);
  for (const a of albums) rows.push(["album", a.slug, a.title, a.composer]);
  for (const w of wiki) rows.push(["wiki", w.slug, w.title, ""]);
  for (const n of news) rows.push(["news", n.slug, n.title, ""]);
  for (const t of topics) rows.push(["topic", t.slug, t.name, ""]);
  for (const r of resources) rows.push(["resource", String(r.id), r.title, r.owner.username]);
  for (const c of calls) rows.push(["call", String(c.id), c.title, ""]);
  return rows;
});

/** Titles for a list of entity keys (used for the routes people take between things). Anything that no longer exists is left out. */
async function describe(keys: string[]): Promise<Neighbor[]> {
  const by: Record<string, string[]> = {};
  for (const k of keys) { const p = parseKey(k); if (p) (by[p.type] ??= []).push(p.id); }
  const out = new Map<string, Neighbor>();
  const add = (n: Neighbor) => out.set(n.key, n);
  if (by.branch) for (const b of await prisma.branch.findMany({ where: { slug: { in: by.branch }, visibility: SHOWN }, select: { slug: true, name: true, identityImageUrl: true, coverArtUrl: true } })) add(mk("branch", b.slug, b.name, undefined, b.identityImageUrl ?? b.coverArtUrl));
  if (by.study) for (const s of await prisma.study.findMany({ where: { slug: { in: by.study } }, select: { slug: true, title: true, backgroundUrl: true } })) add(mk("study", s.slug, s.title, undefined, s.backgroundUrl));
  if (by.album) for (const a of await prisma.album.findMany({ where: { slug: { in: by.album }, branch: { visibility: SHOWN } }, select: { slug: true, title: true, coverArtUrl: true } })) add(mk("album", a.slug, a.title, undefined, a.coverArtUrl));
  if (by.wiki) for (const w of await prisma.wikiPage.findMany({ where: { slug: { in: by.wiki } }, select: { slug: true, title: true } })) add(mk("wiki", w.slug, w.title));
  if (by.news) for (const n of await prisma.blogPost.findMany({ where: { slug: { in: by.news }, publishedAt: { not: null } }, select: { slug: true, title: true, coverImageUrl: true } })) add(mk("news", n.slug, n.title, undefined, n.coverImageUrl));
  if (by.topic) for (const t of await prisma.forumChannel.findMany({ where: { slug: { in: by.topic }, kind: "DISCUSSION" }, select: { slug: true, name: true } })) add(mk("topic", t.slug, t.name));
  const ids = (xs?: string[]) => (xs ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (by.resource) for (const r of await prisma.sampleBankItem.findMany({ where: { id: { in: ids(by.resource) } }, select: { id: true, title: true, imageUrls: true } })) add(mk("resource", r.id, r.title, undefined, r.imageUrls[0]));
  if (by.call) for (const c of await prisma.challenge.findMany({ where: { id: { in: ids(by.call) }, active: true }, select: { id: true, title: true } })) add(mk("call", c.id, c.title));
  return keys.map((k) => out.get(k)).filter((x): x is Neighbor => !!x);
}

const chatRef = (c: { slug: string; name: string; branchId: number | null; branch?: { slug: string; visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS" } | null }): ChatRef | null =>
  isPublicChannel(c) ? { slug: c.slug, name: c.name, branchSlug: c.branch?.slug ?? null, href: `/topic/${c.slug}` } : null;
const CHAT_SELECT = { slug: true, name: true, branchId: true, branch: { select: { slug: true, visibility: true } } } as const;

interface Around { title: string | null; context: Neighbor[]; conversation: ChatRef[]; neighbors: Neighbor[] }

async function around(type: EntityType, id: string): Promise<Around | null> {
  const empty: Around = { title: null, context: [], conversation: [], neighbors: [] };
  switch (type) {
    case "branch": {
      const b = await prisma.branch.findFirst({
        where: { slug: id, visibility: SHOWN },
        select: {
          name: true,
          parent: { select: { slug: true, name: true, visibility: true, identityImageUrl: true, coverArtUrl: true } },
          children: { where: { visibility: SHOWN }, select: { slug: true, name: true, identityImageUrl: true, coverArtUrl: true }, take: 6, orderBy: { name: "asc" } },
          channel: { select: CHAT_SELECT },
          studies: { select: { slug: true, title: true, backgroundUrl: true }, take: 4, orderBy: { updatedAt: "desc" } },
          albums: { select: { slug: true, title: true, coverArtUrl: true, composer: true }, take: 3, orderBy: { createdAt: "desc" } },
        },
      });
      if (!b) return null;
      return {
        title: b.name,
        context: b.parent && b.parent.visibility !== "HIDDEN" ? [mk("branch", b.parent.slug, b.parent.name, "parent", b.parent.identityImageUrl ?? b.parent.coverArtUrl)] : [],
        conversation: [b.channel && chatRef(b.channel)].filter((x): x is ChatRef => !!x),
        neighbors: [
          ...b.children.map((c) => mk("branch", c.slug, c.name, "grows from here", c.identityImageUrl ?? c.coverArtUrl)),
          ...b.studies.map((s) => mk("study", s.slug, s.title, "study", s.backgroundUrl)),
          ...b.albums.map((a) => mk("album", a.slug, a.title, a.composer, a.coverArtUrl)),
        ],
      };
    }
    case "study": {
      const s = await prisma.study.findUnique({
        where: { slug: id },
        select: {
          title: true, ownerId: true,
          owner: { select: { username: true } },
          channel: { select: CHAT_SELECT },
          branches: { where: { visibility: SHOWN }, select: { id: true, slug: true, name: true, identityImageUrl: true, coverArtUrl: true } },
        },
      });
      if (!s) return null;
      const branchIds = s.branches.map((b) => b.id);
      const [sameBranch, sameOwner] = await Promise.all([
        branchIds.length ? prisma.study.findMany({ where: { slug: { not: id }, branches: { some: { id: { in: branchIds } } } }, select: { slug: true, title: true, backgroundUrl: true }, take: 4, orderBy: { updatedAt: "desc" } }) : [],
        prisma.study.findMany({ where: { slug: { not: id }, ownerId: s.ownerId }, select: { slug: true, title: true, backgroundUrl: true }, take: 3, orderBy: { updatedAt: "desc" } }),
      ]);
      return {
        title: s.title,
        context: s.branches.map((b) => mk("branch", b.slug, b.name, "branch", b.identityImageUrl ?? b.coverArtUrl)),
        conversation: [s.channel && chatRef(s.channel)].filter((x): x is ChatRef => !!x),
        neighbors: [
          ...sameBranch.map((x) => mk("study", x.slug, x.title, "same branch", x.backgroundUrl)),
          ...sameOwner.map((x) => mk("study", x.slug, x.title, `by ${s.owner.username}`, x.backgroundUrl)),
        ],
      };
    }
    case "album": {
      const a = await prisma.album.findFirst({
        where: { slug: id, branch: { visibility: SHOWN } },
        select: { title: true, branch: { select: { id: true, slug: true, name: true, identityImageUrl: true, coverArtUrl: true, channel: { select: CHAT_SELECT } } } },
      });
      if (!a) return null;
      const [more, studies] = await Promise.all([
        prisma.album.findMany({ where: { branchId: a.branch.id, slug: { not: id } }, select: { slug: true, title: true, coverArtUrl: true, composer: true }, take: 4, orderBy: { createdAt: "desc" } }),
        prisma.study.findMany({ where: { branches: { some: { id: a.branch.id } } }, select: { slug: true, title: true, backgroundUrl: true }, take: 2, orderBy: { updatedAt: "desc" } }),
      ]);
      return {
        title: a.title,
        context: [mk("branch", a.branch.slug, a.branch.name, "branch", a.branch.identityImageUrl ?? a.branch.coverArtUrl)],
        conversation: [a.branch.channel && chatRef(a.branch.channel)].filter((x): x is ChatRef => !!x),
        neighbors: [...more.map((x) => mk("album", x.slug, x.title, x.composer, x.coverArtUrl)), ...studies.map((x) => mk("study", x.slug, x.title, "study", x.backgroundUrl))],
      };
    }
    case "wiki": {
      const w = await prisma.wikiPage.findUnique({ where: { slug: id }, select: { title: true, parentId: true, parent: { select: { slug: true, title: true } }, children: { select: { slug: true, title: true }, take: 6, orderBy: { title: "asc" } } } });
      if (!w) return null;
      const siblings = w.parentId ? await prisma.wikiPage.findMany({ where: { parentId: w.parentId, slug: { not: id } }, select: { slug: true, title: true }, take: 4, orderBy: { title: "asc" } }) : [];
      return {
        title: w.title,
        context: w.parent ? [mk("wiki", w.parent.slug, w.parent.title, "page above")] : [],
        conversation: [],
        neighbors: [...w.children.map((c) => mk("wiki", c.slug, c.title, "page below")), ...siblings.map((c) => mk("wiki", c.slug, c.title, "same level"))],
      };
    }
    case "news": {
      const p = await prisma.blogPost.findFirst({ where: { slug: id, publishedAt: { not: null } }, select: { title: true, publishedAt: true } });
      if (!p || !p.publishedAt) return null;
      const [before, after] = await Promise.all([
        prisma.blogPost.findFirst({ where: { publishedAt: { lt: p.publishedAt } }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true, coverImageUrl: true } }),
        prisma.blogPost.findFirst({ where: { publishedAt: { gt: p.publishedAt, not: null } }, orderBy: { publishedAt: "asc" }, select: { slug: true, title: true, coverImageUrl: true } }),
      ]);
      return { title: p.title, context: [], conversation: [], neighbors: [...(before ? [mk("news", before.slug, before.title, "earlier", before.coverImageUrl)] : []), ...(after ? [mk("news", after.slug, after.title, "later", after.coverImageUrl)] : [])] };
    }
    case "topic": {
      const t = await prisma.forumChannel.findFirst({ where: { slug: id, kind: "DISCUSSION" }, select: { name: true, studies: { select: { slug: true, title: true, backgroundUrl: true }, take: 4, orderBy: { updatedAt: "desc" } } } });
      if (!t) return null;
      return { title: t.name, context: [], conversation: [], neighbors: t.studies.map((s) => mk("study", s.slug, s.title, "study", s.backgroundUrl)) };
    }
    case "resource": {
      const n = Number(id);
      if (!Number.isInteger(n)) return null;
      const r = await prisma.sampleBankItem.findUnique({ where: { id: n }, select: { title: true, ownerId: true, tags: true } });
      if (!r) return null;
      const more = await prisma.sampleBankItem.findMany({ where: { id: { not: n }, OR: [{ ownerId: r.ownerId }, ...(r.tags.length ? [{ tags: { hasSome: r.tags } }] : [])] }, select: { id: true, title: true, imageUrls: true }, take: 5, orderBy: { createdAt: "desc" } });
      return { ...empty, title: r.title, neighbors: more.map((x) => mk("resource", x.id, x.title, "resource", x.imageUrls[0])) };
    }
    case "call": {
      const n = Number(id);
      if (!Number.isInteger(n)) return null;
      const c = await prisma.challenge.findFirst({ where: { id: n, active: true }, select: { title: true } });
      return c ? { ...empty, title: c.title } : null;
    }
  }
}

const traceLimiter = makeLimiter(40, 60_000);

export async function atlasRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/atlas/index", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=30");
    return indexRows();
  });

  app.get<{ Querystring: { key?: string } }>("/api/atlas/around", async (req, reply) => {
    const p = parseKey(req.query.key);
    if (!p) return reply.code(400).send({ error: "bad key" });
    const found = await around(p.type, p.id);
    if (!found) return reply.code(404).send({ error: "not found" });
    const self = keyOf(p.type, p.id);
    // Where people went from here, once enough of them did.
    const rows = await prisma.edgeCount.findMany({ where: { from: self }, orderBy: { n: "desc" }, take: 12, select: { to: true, n: true } });
    const paths = (await describe(topPaths(rows, 3, 4))).map((n) => ({ ...n, sub: "people went on to this" }));
    reply.header("Cache-Control", "public, max-age=20");
    return { key: self, title: found.title, context: found.context, conversation: found.conversation, neighbors: mergeNeighbors([found.neighbors, paths], self, 9) };
  });

  // The client reports the hops it made between things (batched, as aggregate counts only). Nothing identifies the person.
  app.post<{ Body: { edges?: unknown } }>("/api/atlas/trace", async (req, reply) => {
    if (!traceLimiter.hit(req.ip)) return reply.code(429).send({ error: "slow down" });
    const edges = cleanEdges(req.body?.edges, 10);
    for (const [from, to] of edges) {
      await prisma.edgeCount.upsert({ where: { from_to: { from, to } }, create: { from, to, n: 1 }, update: { n: { increment: 1 } } });
    }
    return reply.code(204).send();
  });
}
