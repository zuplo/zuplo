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
 * The Ticket entity — a single support inquiry from a customer.
 */
export interface Ticket extends Entity {
  customerEmail: string;
  subject: string;
  body: string;
  status: "new" | "open" | "pending" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  channel: "email" | "chat" | "web" | "api";
  assigneeEmail: string | null;
  tags: string[];
  slaBreachAt: string | null;
  openedAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * A conversation entry on a ticket. `kind=internal` is hidden from the customer.
 */
export interface Conversation extends Entity {
  ticketId: string;
  kind: "public" | "internal";
  authorEmail: string;
  body: string;
  sentAt: string;
  createdAt: string;
}

/**
 * A reusable canned reply that can be applied to a ticket.
 */
export interface Macro extends Entity {
  name: string;
  body: string;
  tags: string[];
  createdAt: string;
}

/**
 * Per-priority SLA targets (in minutes).
 */
export interface SLA extends Entity {
  priorityLevel: "low" | "normal" | "high" | "urgent";
  firstResponseMinutes: number;
  resolutionMinutes: number;
  createdAt: string;
}

/**
 * A customer who can open tickets. Looked up by email.
 */
export interface Customer extends Entity {
  email: string;
  name: string;
  plan: string;
  accountId: string;
  createdAt: string;
}

function buildTickets(): Repository<Ticket> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Ticket>({ provider: "in-memory", entityName: "Ticket" });
    case "supabase":
      return createRepository<Ticket>({
        provider: "supabase",
        entityName: "Ticket",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TICKETS_TABLE ?? "tickets",
        },
      });
    case "firestore":
      return createRepository<Ticket>({
        provider: "firestore",
        entityName: "Ticket",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TICKETS_COLLECTION ?? "tickets",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Ticket>({
        provider: "upstash-redis",
        entityName: "Ticket",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TICKETS_PREFIX ?? "tickets",
        },
      });
    case "neon":
      return createRepository<Ticket>({
        provider: "neon",
        entityName: "Ticket",
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

function buildConversations(): Repository<Conversation> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Conversation>({ provider: "in-memory", entityName: "Conversation" });
    case "supabase":
      return createRepository<Conversation>({
        provider: "supabase",
        entityName: "Conversation",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONVERSATIONS_TABLE ?? "conversations",
        },
      });
    case "firestore":
      return createRepository<Conversation>({
        provider: "firestore",
        entityName: "Conversation",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONVERSATIONS_COLLECTION ?? "conversations",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Conversation>({
        provider: "upstash-redis",
        entityName: "Conversation",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONVERSATIONS_PREFIX ?? "conversations",
        },
      });
    case "neon":
      return createRepository<Conversation>({
        provider: "neon",
        entityName: "Conversation",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONVERSATIONS_TABLE ?? "conversations",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildMacros(): Repository<Macro> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Macro>({ provider: "in-memory", entityName: "Macro" });
    case "supabase":
      return createRepository<Macro>({
        provider: "supabase",
        entityName: "Macro",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_MACROS_TABLE ?? "macros",
        },
      });
    case "firestore":
      return createRepository<Macro>({
        provider: "firestore",
        entityName: "Macro",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_MACROS_COLLECTION ?? "macros",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Macro>({
        provider: "upstash-redis",
        entityName: "Macro",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_MACROS_PREFIX ?? "macros",
        },
      });
    case "neon":
      return createRepository<Macro>({
        provider: "neon",
        entityName: "Macro",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_MACROS_TABLE ?? "macros",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildSlas(): Repository<SLA> {
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
          table: environment.SUPABASE_SLAS_TABLE ?? "slas",
        },
      });
    case "firestore":
      return createRepository<SLA>({
        provider: "firestore",
        entityName: "SLA",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SLAS_COLLECTION ?? "slas",
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
          keyPrefix: environment.UPSTASH_SLAS_PREFIX ?? "slas",
        },
      });
    case "neon":
      return createRepository<SLA>({
        provider: "neon",
        entityName: "SLA",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SLAS_TABLE ?? "slas",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildCustomers(): Repository<Customer> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Customer>({ provider: "in-memory", entityName: "Customer" });
    case "supabase":
      return createRepository<Customer>({
        provider: "supabase",
        entityName: "Customer",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CUSTOMERS_TABLE ?? "customers",
        },
      });
    case "firestore":
      return createRepository<Customer>({
        provider: "firestore",
        entityName: "Customer",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CUSTOMERS_COLLECTION ?? "customers",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Customer>({
        provider: "upstash-redis",
        entityName: "Customer",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CUSTOMERS_PREFIX ?? "customers",
        },
      });
    case "neon":
      return createRepository<Customer>({
        provider: "neon",
        entityName: "Customer",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CUSTOMERS_TABLE ?? "customers",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const ticketRepository: Repository<Ticket> = buildTickets();
export const conversationRepository: Repository<Conversation> = buildConversations();
export const macroRepository: Repository<Macro> = buildMacros();
export const slaRepository: Repository<SLA> = buildSlas();
export const customerRepository: Repository<Customer> = buildCustomers();
