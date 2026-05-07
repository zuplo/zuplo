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
 * A sales quote — the parent CPQ document. A quote rolls up a set of
 * LineItems, applies any matching PricingRules, and tracks the deal
 * lifecycle (draft → sent → accepted/rejected/expired).
 */
export interface Quote extends Entity {
  dealId: string;
  customerId: string;
  ownerEmail: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  validUntil: string;
  sentAt: string | null;
  acceptedAt: string | null;
  terms: string;
  createdAt: string;
}

function build(): Repository<Quote> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Quote>({ provider: "in-memory", entityName: "Quote" });
    case "supabase":
      return createRepository<Quote>({
        provider: "supabase",
        entityName: "Quote",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_QUOTES_TABLE ?? "quotes",
        },
      });
    case "firestore":
      return createRepository<Quote>({
        provider: "firestore",
        entityName: "Quote",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_QUOTES_COLLECTION ?? "quotes",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Quote>({
        provider: "upstash-redis",
        entityName: "Quote",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_QUOTES_PREFIX ?? "quotes",
        },
      });
    case "neon":
      return createRepository<Quote>({
        provider: "neon",
        entityName: "Quote",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_QUOTES_TABLE ?? "quotes",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const quoteRepository: Repository<Quote> = build();
