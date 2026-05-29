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
 * An internal IT helpdesk ticket raised by an employee.
 */
export interface IncidentTicket extends Entity {
  requesterEmail: string;
  subject: string;
  body: string;
  category: "hardware" | "software" | "access" | "network" | "other";
  priority: "low" | "med" | "high" | "critical";
  status: "new" | "in_progress" | "awaiting_user" | "resolved" | "closed";
  assigneeEmail: string | null;
  slaBreachAt: string | null;
  openedAt: string;
  resolvedAt: string | null;
  tags: string[];
}

/**
 * A comment posted to a ticket. `kind: internal` is hidden from the requester.
 */
export interface Comment extends Entity {
  ticketId: string;
  authorEmail: string;
  body: string;
  kind: "public" | "internal";
  postedAt: string;
}

/**
 * A service-level agreement defining response and resolution targets per priority.
 */
export interface SLA extends Entity {
  priority: "low" | "med" | "high" | "critical";
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

/**
 * A knowledge base article that may resolve an incoming ticket without an agent.
 */
export interface KBArticle extends Entity {
  title: string;
  body: string;
  tags: string[];
  category: "hardware" | "software" | "access" | "network" | "other";
  helpfulCount: number;
  lastUpdatedAt: string;
}

/**
 * A ticket category with an optional default assignee for routing.
 */
export interface Category extends Entity {
  slug: string;
  name: string;
  defaultAssigneeEmail: string | null;
}

function buildTickets(): Repository<IncidentTicket> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<IncidentTicket>({ provider: "in-memory", entityName: "IncidentTicket" });
    case "supabase":
      return createRepository<IncidentTicket>({
        provider: "supabase",
        entityName: "IncidentTicket",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TICKETS_TABLE ?? "tickets",
        },
      });
    case "firestore":
      return createRepository<IncidentTicket>({
        provider: "firestore",
        entityName: "IncidentTicket",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TICKETS_COLLECTION ?? "tickets",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<IncidentTicket>({
        provider: "upstash-redis",
        entityName: "IncidentTicket",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TICKETS_PREFIX ?? "tickets",
        },
      });
    case "neon":
      return createRepository<IncidentTicket>({
        provider: "neon",
        entityName: "IncidentTicket",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TICKETS_TABLE ?? "tickets",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildComments(): Repository<Comment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Comment>({ provider: "in-memory", entityName: "Comment" });
    case "supabase":
      return createRepository<Comment>({
        provider: "supabase",
        entityName: "Comment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COMMENTS_TABLE ?? "comments",
        },
      });
    case "firestore":
      return createRepository<Comment>({
        provider: "firestore",
        entityName: "Comment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COMMENTS_COLLECTION ?? "comments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Comment>({
        provider: "upstash-redis",
        entityName: "Comment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_COMMENTS_PREFIX ?? "comments",
        },
      });
    case "neon":
      return createRepository<Comment>({
        provider: "neon",
        entityName: "Comment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COMMENTS_TABLE ?? "comments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildKBArticles(): Repository<KBArticle> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<KBArticle>({ provider: "in-memory", entityName: "KBArticle" });
    case "supabase":
      return createRepository<KBArticle>({
        provider: "supabase",
        entityName: "KBArticle",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_KB_TABLE ?? "kb_articles",
        },
      });
    case "firestore":
      return createRepository<KBArticle>({
        provider: "firestore",
        entityName: "KBArticle",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_KB_COLLECTION ?? "kb_articles",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<KBArticle>({
        provider: "upstash-redis",
        entityName: "KBArticle",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_KB_PREFIX ?? "kb_articles",
        },
      });
    case "neon":
      return createRepository<KBArticle>({
        provider: "neon",
        entityName: "KBArticle",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_KB_TABLE ?? "kb_articles",
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

function buildSLA(): Repository<SLA> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<SLA>({ provider: "in-memory", entityName: "SLA" });
    case "supabase":
      return createRepository<SLA>({
        provider: "supabase",
        entityName: "SLA",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SLA_TABLE ?? "slas",
        },
      });
    case "firestore":
      return createRepository<SLA>({
        provider: "firestore",
        entityName: "SLA",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SLA_COLLECTION ?? "slas",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<SLA>({
        provider: "upstash-redis",
        entityName: "SLA",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SLA_PREFIX ?? "slas",
        },
      });
    case "neon":
      return createRepository<SLA>({
        provider: "neon",
        entityName: "SLA",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SLA_TABLE ?? "slas",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const ticketRepository: Repository<IncidentTicket> = buildTickets();
export const commentRepository: Repository<Comment> = buildComments();
export const kbArticleRepository: Repository<KBArticle> = buildKBArticles();
export const categoryRepository: Repository<Category> = buildCategories();
export const slaRepository: Repository<SLA> = buildSLA();
