import {
  Adapter,
  AdapterCapabilities,
  Entity,
  EntityCreate,
  EntityUpdate,
  ListQuery,
  NotFoundError,
  Page,
  Repository,
} from "./repository.ts";

/**
 * In-memory adapter for tests and local development.
 * Data lives in a Map keyed by `${tenantId}:${id}` and is lost on restart.
 */

export interface InMemoryRepositoryOptions<T extends Entity> {
  /** Optional seed data, indexed per-tenant. */
  seed?: Record<string, T[]>;
  /** Function to generate IDs. Defaults to crypto.randomUUID(). */
  idFactory?: () => string;
}

export function inMemoryRepository<T extends Entity>(
  entityName: string,
  options: InMemoryRepositoryOptions<T> = {},
): Repository<T> & Adapter {
  const store = new Map<string, T>();
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());

  if (options.seed) {
    for (const [tenantId, items] of Object.entries(options.seed)) {
      for (const item of items) {
        store.set(`${tenantId}:${item.id}`, { ...item, tenantId });
      }
    }
  }

  function key(tenantId: string, id: string) {
    return `${tenantId}:${id}`;
  }

  function matchesWhere(item: T, where: Partial<EntityCreate<T>>): boolean {
    for (const [field, expected] of Object.entries(where)) {
      if ((item as Record<string, unknown>)[field] !== expected) return false;
    }
    return true;
  }

  const capabilities: AdapterCapabilities = {
    transactions: true,
    fullTextSearch: false,
    aggregations: "none",
  };

  return {
    capabilities,

    async get(tenantId, id) {
      return store.get(key(tenantId, id)) ?? null;
    },

    async list(tenantId, query = {}) {
      let items = Array.from(store.values()).filter((i) => i.tenantId === tenantId);
      if (query.where) {
        items = items.filter((i) => matchesWhere(i, query.where!));
      }
      if (query.orderBy) {
        const { field, direction } = query.orderBy;
        items.sort((a, b) => {
          const av = a[field];
          const bv = b[field];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (direction === "asc" ? 1 : -1);
        });
      }
      const limit = query.limit ?? 50;
      const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
      const slice = items.slice(offset, offset + limit);
      const nextCursor =
        offset + slice.length < items.length ? String(offset + slice.length) : null;
      return { items: slice, nextCursor };
    },

    async create(tenantId, data) {
      const id = idFactory();
      const item = { ...(data as object), id, tenantId } as T;
      store.set(key(tenantId, id), item);
      return item;
    },

    async update(tenantId, id, patch) {
      const existing = store.get(key(tenantId, id));
      if (!existing) throw new NotFoundError(entityName, id);
      const updated = { ...existing, ...patch, id, tenantId } as T;
      store.set(key(tenantId, id), updated);
      return updated;
    },

    async delete(tenantId, id) {
      const existing = store.get(key(tenantId, id));
      if (!existing) throw new NotFoundError(entityName, id);
      store.delete(key(tenantId, id));
    },
  };
}
