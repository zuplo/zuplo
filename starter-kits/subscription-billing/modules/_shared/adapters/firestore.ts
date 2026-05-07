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
 * Firestore adapter — uses the Firestore REST API.
 *
 * Stores documents at:
 *   projects/{project}/databases/(default)/documents/{collection}/{tenantId}/items/{id}
 *
 * The tenant-scoped subcollection layout enforces isolation by URL path.
 * The adapter still requires `tenantId` on every call — defense in depth.
 *
 * Auth: requires a Firebase service account access token. Pass an OAuth2
 * access token (typically minted upstream by the Zuplo Firebase Auth policy)
 * via the `getAccessToken` callback so we can refresh it per-request.
 *
 * See examples/proxy-firestore-user/ for the upstream auth pattern.
 */

export interface FirestoreRepositoryOptions {
  /** GCP project ID containing the Firestore database. */
  projectId: string;
  /** Top-level collection name (kit picks one per entity). */
  collection: string;
  /** Returns a current OAuth2 access token for Firestore. */
  getAccessToken: () => Promise<string>;
}

type FirestoreField =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreField[] } }
  | { mapValue: { fields?: Record<string, FirestoreField> } };

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreField>;
  createTime?: string;
  updateTime?: string;
}

function toFirestoreField(value: unknown): FirestoreField {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreField) } };
  }
  if (typeof value === "object") {
    const fields: Record<string, FirestoreField> = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreField(v);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

function fromFirestoreField(field: FirestoreField): unknown {
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return parseInt(field.integerValue, 10);
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  if ("arrayValue" in field) {
    return (field.arrayValue.values ?? []).map(fromFirestoreField);
  }
  if ("mapValue" in field) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(field.mapValue.fields ?? {})) {
      out[k] = fromFirestoreField(v);
    }
    return out;
  }
  return null;
}

function fromFirestoreDoc<T extends Entity>(doc: FirestoreDocument): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = fromFirestoreField(v);
  }
  // Document name is the last path segment; use it as `id` if missing.
  const segments = doc.name.split("/");
  out.id ??= segments[segments.length - 1];
  return out as T;
}

export function firestoreRepository<T extends Entity>(
  entityName: string,
  options: FirestoreRepositoryOptions,
): Repository<T> & Adapter {
  const { projectId, collection, getAccessToken } = options;
  const dbBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  function tenantPath(tenantId: string) {
    return `${dbBase}/${collection}/${encodeURIComponent(tenantId)}/items`;
  }

  async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken();
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  const capabilities: AdapterCapabilities = {
    transactions: true, // single-document and small batched writes
    fullTextSearch: false,
    aggregations: "none",
  };

  return {
    capabilities,

    async get(tenantId, id) {
      const res = await authedFetch(`${tenantPath(tenantId)}/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
      const doc = (await res.json()) as FirestoreDocument;
      return fromFirestoreDoc<T>(doc);
    },

    async list(tenantId, query = {}) {
      // Firestore REST list with optional structured query for filtering.
      const url = new URL(tenantPath(tenantId));
      const limit = query.limit ?? 50;
      url.searchParams.set("pageSize", String(limit));
      if (query.cursor) url.searchParams.set("pageToken", query.cursor);

      // Firestore REST `list` does not support arbitrary `where`. For filtered
      // queries, kits should use Firestore's `runQuery` endpoint via a custom
      // method on this adapter. The basic list endpoint returns everything in
      // the tenant's `items` subcollection.
      const res = await authedFetch(url.toString());
      if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as {
        documents?: FirestoreDocument[];
        nextPageToken?: string;
      };
      let items = (body.documents ?? []).map((d) => fromFirestoreDoc<T>(d));
      if (query.where) {
        items = items.filter((item) => {
          for (const [k, v] of Object.entries(query.where!)) {
            if ((item as Record<string, unknown>)[k] !== v) return false;
          }
          return true;
        });
      }
      return {
        items,
        nextCursor: body.nextPageToken ?? null,
      };
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const fields: Record<string, FirestoreField> = {};
      for (const [k, v] of Object.entries(data as object)) {
        fields[k] = toFirestoreField(v);
      }
      fields.id = toFirestoreField(id);
      fields.tenantId = toFirestoreField(tenantId);

      const res = await authedFetch(
        `${tenantPath(tenantId)}?documentId=${encodeURIComponent(id)}`,
        {
          method: "POST",
          body: JSON.stringify({ fields }),
        },
      );
      if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
      return { ...(data as object), id, tenantId } as T;
    },

    async update(tenantId, id, patch) {
      const fields: Record<string, FirestoreField> = {};
      for (const [k, v] of Object.entries(patch)) {
        fields[k] = toFirestoreField(v);
      }
      const updateMaskParams = Object.keys(patch)
        .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
        .join("&");

      const res = await authedFetch(
        `${tenantPath(tenantId)}/${encodeURIComponent(id)}?${updateMaskParams}`,
        {
          method: "PATCH",
          body: JSON.stringify({ fields }),
        },
      );
      if (res.status === 404) throw new NotFoundError(entityName, id);
      if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
      const doc = (await res.json()) as FirestoreDocument;
      return fromFirestoreDoc<T>(doc);
    },

    async delete(tenantId, id) {
      const res = await authedFetch(`${tenantPath(tenantId)}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.status === 404) throw new NotFoundError(entityName, id);
      if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
    },
  };
}
