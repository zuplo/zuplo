import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Set it in .env or in Zuplo Portal > Settings > Environment Variables.`,
    );
  }
  return value;
}

/**
 * The Entry entity. A single localised content row of a given content type.
 * Status moves through draft -> scheduled -> published -> archived.
 */
export interface Entry extends Entity {
  contentTypeSlug: string;
  slug: string;
  locale: string;
  status: "draft" | "published" | "scheduled" | "archived";
  title: string;
  body: string;
  excerpt: string;
  authorEmail: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * The ContentType entity. Defines a schema (set of fields) that Entries follow.
 */
export interface ContentType extends Entity {
  slug: string;
  name: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
  createdAt: string;
}

/**
 * The Asset entity. A media file uploaded for use inside an Entry.
 */
export interface Asset extends Entity {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  altText: string;
  uploadedBy: string;
  createdAt: string;
}

/**
 * The Revision entity. A historical snapshot of an Entry's body and fields.
 */
export interface Revision extends Entity {
  entryId: string;
  body: string;
  fields: Record<string, unknown>;
  savedAt: string;
  savedBy: string;
}

/**
 * The Author entity. A person who can create or edit content.
 */
export interface Author extends Entity {
  email: string;
  displayName: string;
  bio: string;
  createdAt: string;
}

function buildEntries(): Repository<Entry> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Entry>({ provider: "in-memory", entityName: "Entry" });
    case "supabase":
      return createRepository<Entry>({
        provider: "supabase",
        entityName: "Entry",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ENTRIES_TABLE ?? "entries",
        },
      });
    case "firestore":
      return createRepository<Entry>({
        provider: "firestore",
        entityName: "Entry",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ENTRIES_COLLECTION ?? "entries",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Entry>({
        provider: "upstash-redis",
        entityName: "Entry",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ENTRIES_PREFIX ?? "entries",
        },
      });
    case "neon":
      return createRepository<Entry>({
        provider: "neon",
        entityName: "Entry",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ENTRIES_TABLE ?? "entries",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildContentTypes(): Repository<ContentType> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<ContentType>({ provider: "in-memory", entityName: "ContentType" });
    case "supabase":
      return createRepository<ContentType>({
        provider: "supabase",
        entityName: "ContentType",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONTENT_TYPES_TABLE ?? "content_types",
        },
      });
    case "firestore":
      return createRepository<ContentType>({
        provider: "firestore",
        entityName: "ContentType",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONTENT_TYPES_COLLECTION ?? "content_types",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<ContentType>({
        provider: "upstash-redis",
        entityName: "ContentType",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONTENT_TYPES_PREFIX ?? "content_types",
        },
      });
    case "neon":
      return createRepository<ContentType>({
        provider: "neon",
        entityName: "ContentType",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONTENT_TYPES_TABLE ?? "content_types",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAssets(): Repository<Asset> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Asset>({ provider: "in-memory", entityName: "Asset" });
    case "supabase":
      return createRepository<Asset>({
        provider: "supabase",
        entityName: "Asset",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ASSETS_TABLE ?? "assets",
        },
      });
    case "firestore":
      return createRepository<Asset>({
        provider: "firestore",
        entityName: "Asset",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ASSETS_COLLECTION ?? "assets",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Asset>({
        provider: "upstash-redis",
        entityName: "Asset",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ASSETS_PREFIX ?? "assets",
        },
      });
    case "neon":
      return createRepository<Asset>({
        provider: "neon",
        entityName: "Asset",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ASSETS_TABLE ?? "assets",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildRevisions(): Repository<Revision> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Revision>({ provider: "in-memory", entityName: "Revision" });
    case "supabase":
      return createRepository<Revision>({
        provider: "supabase",
        entityName: "Revision",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_REVISIONS_TABLE ?? "revisions",
        },
      });
    case "firestore":
      return createRepository<Revision>({
        provider: "firestore",
        entityName: "Revision",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_REVISIONS_COLLECTION ?? "revisions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Revision>({
        provider: "upstash-redis",
        entityName: "Revision",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_REVISIONS_PREFIX ?? "revisions",
        },
      });
    case "neon":
      return createRepository<Revision>({
        provider: "neon",
        entityName: "Revision",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_REVISIONS_TABLE ?? "revisions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAuthors(): Repository<Author> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Author>({ provider: "in-memory", entityName: "Author" });
    case "supabase":
      return createRepository<Author>({
        provider: "supabase",
        entityName: "Author",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_AUTHORS_TABLE ?? "authors",
        },
      });
    case "firestore":
      return createRepository<Author>({
        provider: "firestore",
        entityName: "Author",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_AUTHORS_COLLECTION ?? "authors",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Author>({
        provider: "upstash-redis",
        entityName: "Author",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_AUTHORS_PREFIX ?? "authors",
        },
      });
    case "neon":
      return createRepository<Author>({
        provider: "neon",
        entityName: "Author",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_AUTHORS_TABLE ?? "authors",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const entryRepository: Repository<Entry> = buildEntries();
export const contentTypeRepository: Repository<ContentType> = buildContentTypes();
export const assetRepository: Repository<Asset> = buildAssets();
export const revisionRepository: Repository<Revision> = buildRevisions();
export const authorRepository: Repository<Author> = buildAuthors();
