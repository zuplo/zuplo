import { ZuploRequest, ZuploContext, ZoneCache } from "@zuplo/runtime";

interface Bookmark {
  id: string;
  url: string;
  title: string;
  tags: string[];
  created_at: string;
}

interface BookmarkStore {
  bookmarks: Bookmark[];
}

const CACHE_KEY = "bookmarks-store";
const CACHE_TTL = 86400 * 30;

function daysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString();
}

function getSeedData(): BookmarkStore {
  return {
    bookmarks: [
      {
        id: crypto.randomUUID(),
        url: "https://modelcontextprotocol.io/introduction",
        title: "Introduction to MCP",
        tags: ["mcp", "ai"],
        created_at: daysAgo(2),
      },
      {
        id: crypto.randomUUID(),
        url: "https://zuplo.com/blog/2024/12/16/building-mcp-servers-with-zuplo",
        title: "Building MCP Servers with Zuplo",
        tags: ["mcp", "zuplo", "api"],
        created_at: daysAgo(3),
      },
      {
        id: crypto.randomUUID(),
        url: "https://anthropic.com/news/model-context-protocol",
        title: "Anthropic announces MCP",
        tags: ["mcp", "ai", "anthropic"],
        created_at: daysAgo(5),
      },
      {
        id: crypto.randomUUID(),
        url: "https://openapi.org/specification",
        title: "OpenAPI Specification",
        tags: ["api", "openapi"],
        created_at: daysAgo(6),
      },
      {
        id: crypto.randomUUID(),
        url: "https://www.anthropic.com/research/building-effective-agents",
        title: "Building Effective AI Agents",
        tags: ["ai", "agents", "anthropic"],
        created_at: daysAgo(4),
      },
      {
        id: crypto.randomUUID(),
        url: "https://zuplo.com/docs/articles/api-key-management",
        title: "API Key Management Best Practices",
        tags: ["api", "security", "zuplo"],
        created_at: daysAgo(1),
      },
    ],
  };
}

async function getStore(context: ZuploContext): Promise<BookmarkStore> {
  const cache = new ZoneCache<BookmarkStore>("bookmark-cache", context);
  const store = await cache.get(CACHE_KEY);

  if (store) {
    return store;
  }

  const seedStore = getSeedData();
  await saveStore(context, seedStore);
  return seedStore;
}

async function saveStore(
  context: ZuploContext,
  store: BookmarkStore
): Promise<void> {
  const cache = new ZoneCache<BookmarkStore>("bookmark-cache", context);
  await cache.put(CACHE_KEY, store, CACHE_TTL);
}

export async function listBookmarks(
  request: ZuploRequest,
  context: ZuploContext
) {
  const store = await getStore(context);
  const tag = new URL(request.url).searchParams.get("tag");

  let results = store.bookmarks;
  if (tag) {
    results = results.filter((b) => b.tags.includes(tag));
  }

  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json" },
  });
}

export async function saveBookmark(
  request: ZuploRequest,
  context: ZuploContext
) {
  const body = await request.json();
  const store = await getStore(context);

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url: body.url,
    title: body.title,
    tags: body.tags ?? [],
    created_at: new Date().toISOString(),
  };

  store.bookmarks.push(bookmark);
  await saveStore(context, store);

  return new Response(JSON.stringify(bookmark), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

export async function deleteBookmark(
  request: ZuploRequest,
  context: ZuploContext
) {
  const id = request.params.id;
  const store = await getStore(context);

  const index = store.bookmarks.findIndex((b) => b.id === id);
  if (index === -1) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  store.bookmarks.splice(index, 1);
  await saveStore(context, store);

  return new Response(null, { status: 204 });
}