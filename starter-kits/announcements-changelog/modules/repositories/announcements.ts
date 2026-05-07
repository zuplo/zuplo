import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "../_shared/adapters/index.ts";

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
 * The Announcement entity. The primary record posted to a feed. Each one has a
 * lifecycle (draft -> scheduled -> published -> archived) and is targeted at
 * an Audience.
 */
export interface Announcement extends Entity {
  title: string;
  body: string;
  kind: "feature" | "fix" | "policy" | "event" | "general";
  audienceSlug: string;
  status: "draft" | "scheduled" | "published" | "archived";
  priority: "info" | "normal" | "high" | "critical";
  scheduledFor: string | null;
  publishedAt: string | null;
  authorEmail: string;
  categorySlug: string | null;
  createdAt: string;
}

/**
 * An Audience is a logical group an announcement targets — e.g. "engineering",
 * "all-hands", "us-employees". Criteria is an open object so customers can
 * encode their own segmentation rules.
 */
export interface Audience extends Entity {
  slug: string;
  name: string;
  criteria: Record<string, unknown>;
  createdAt: string;
}

/**
 * Acknowledgement records that a specific employee has read/acknowledged a
 * specific announcement. Used by orchestrator tools to find unread items.
 */
export interface Acknowledgement extends Entity {
  announcementId: string;
  employeeEmail: string;
  acknowledgedAt: string;
}

/**
 * A Category groups announcements (e.g. "release-notes", "ops",
 * "people-policy"). Useful for digests and filtering.
 */
export interface Category extends Entity {
  slug: string;
  name: string;
  color: string;
  createdAt: string;
}

function buildAnnouncements(): Repository<Announcement> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Announcement>({ provider: "in-memory", entityName: "Announcement" });
    case "supabase":
      return createRepository<Announcement>({
        provider: "supabase",
        entityName: "Announcement",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ANNOUNCEMENTS_TABLE ?? "announcements",
        },
      });
    case "firestore":
      return createRepository<Announcement>({
        provider: "firestore",
        entityName: "Announcement",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ANNOUNCEMENTS_COLLECTION ?? "announcements",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Announcement>({
        provider: "upstash-redis",
        entityName: "Announcement",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ANNOUNCEMENTS_PREFIX ?? "announcements",
        },
      });
    case "neon":
      return createRepository<Announcement>({
        provider: "neon",
        entityName: "Announcement",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ANNOUNCEMENTS_TABLE ?? "announcements",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAudiences(): Repository<Audience> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Audience>({ provider: "in-memory", entityName: "Audience" });
    case "supabase":
      return createRepository<Audience>({
        provider: "supabase",
        entityName: "Audience",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_AUDIENCES_TABLE ?? "audiences",
        },
      });
    case "firestore":
      return createRepository<Audience>({
        provider: "firestore",
        entityName: "Audience",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_AUDIENCES_COLLECTION ?? "audiences",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Audience>({
        provider: "upstash-redis",
        entityName: "Audience",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_AUDIENCES_PREFIX ?? "audiences",
        },
      });
    case "neon":
      return createRepository<Audience>({
        provider: "neon",
        entityName: "Audience",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_AUDIENCES_TABLE ?? "audiences",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAcknowledgements(): Repository<Acknowledgement> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Acknowledgement>({ provider: "in-memory", entityName: "Acknowledgement" });
    case "supabase":
      return createRepository<Acknowledgement>({
        provider: "supabase",
        entityName: "Acknowledgement",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ACKS_TABLE ?? "acknowledgements",
        },
      });
    case "firestore":
      return createRepository<Acknowledgement>({
        provider: "firestore",
        entityName: "Acknowledgement",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ACKS_COLLECTION ?? "acknowledgements",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Acknowledgement>({
        provider: "upstash-redis",
        entityName: "Acknowledgement",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ACKS_PREFIX ?? "acknowledgements",
        },
      });
    case "neon":
      return createRepository<Acknowledgement>({
        provider: "neon",
        entityName: "Acknowledgement",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ACKS_TABLE ?? "acknowledgements",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildCategories(): Repository<Category> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Category>({ provider: "in-memory", entityName: "Category" });
    case "supabase":
      return createRepository<Category>({
        provider: "supabase",
        entityName: "Category",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CATEGORIES_TABLE ?? "categories",
        },
      });
    case "firestore":
      return createRepository<Category>({
        provider: "firestore",
        entityName: "Category",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CATEGORIES_COLLECTION ?? "categories",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Category>({
        provider: "upstash-redis",
        entityName: "Category",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CATEGORIES_PREFIX ?? "categories",
        },
      });
    case "neon":
      return createRepository<Category>({
        provider: "neon",
        entityName: "Category",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CATEGORIES_TABLE ?? "categories",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const announcementRepository: Repository<Announcement> = buildAnnouncements();
export const audienceRepository: Repository<Audience> = buildAudiences();
export const acknowledgementRepository: Repository<Acknowledgement> = buildAcknowledgements();
export const categoryRepository: Repository<Category> = buildCategories();
