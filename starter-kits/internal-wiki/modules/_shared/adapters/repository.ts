/**
 * Repository<T> — the contract every starter-kit adapter implements.
 *
 * Adapters are HTTP-only because Zuplo runs in an edge runtime. No `pg`,
 * no native MongoDB driver, no D1 native binding. Only providers reachable
 * over HTTP (Supabase, Firestore, ClickHouse, Upstash, Neon HTTP).
 *
 * Multi-tenancy is enforced at the type level: every method requires a
 * `tenantId`. The auth layer resolves it from API key metadata and passes
 * it in. Repositories must use it as a hard filter on every query.
 */

export interface Entity {
  id: string;
  tenantId: string;
}

export type EntityCreate<T extends Entity> = Omit<T, "id" | "tenantId">;
export type EntityUpdate<T extends Entity> = Partial<EntityCreate<T>>;

export interface ListQuery<T extends Entity> {
  /** Field-equality filters. Adapters apply tenantId in addition to these. */
  where?: Partial<EntityCreate<T>>;
  /** Order by a field, ascending or descending. */
  orderBy?: { field: keyof T; direction: "asc" | "desc" };
  /** Maximum results to return. Default 50. */
  limit?: number;
  /** Opaque pagination cursor returned by previous list() call. Pass `nextCursor` from a previous Page. */
  cursor?: string | null;
}

export interface Page<T extends Entity> {
  items: T[];
  /** Pass back as `cursor` to fetch the next page. Null when no more results. */
  nextCursor: string | null;
}

export interface Repository<T extends Entity> {
  get(tenantId: string, id: string): Promise<T | null>;
  list(tenantId: string, query?: ListQuery<T>): Promise<Page<T>>;
  create(tenantId: string, data: EntityCreate<T>): Promise<T>;
  update(tenantId: string, id: string, patch: EntityUpdate<T>): Promise<T>;
  delete(tenantId: string, id: string): Promise<void>;
}

/**
 * Capabilities each adapter exposes. Kits can introspect these to enable or
 * skip certain features (e.g. don't offer aggregations on Upstash).
 */
export interface AdapterCapabilities {
  transactions: boolean;
  fullTextSearch: boolean;
  aggregations: "sql" | "pipeline" | "none";
}

export interface Adapter {
  capabilities: AdapterCapabilities;
}

/**
 * Standard error thrown when a tenant-scoped operation finds no row.
 * Repositories return `null` from get() on miss; throw NotFound from update()
 * and delete() so callers can map to a 404 cleanly.
 */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when a write violates a uniqueness constraint (adapter-specific).
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
