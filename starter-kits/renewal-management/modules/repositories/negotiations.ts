import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * A back-and-forth proposal during a renewal negotiation. The audit trail
 * for "what did we offer / what did they ask for / what was decided".
 */
export interface Negotiation extends Entity {
  renewalId: string;
  kind: "discount_request" | "term_change" | "product_swap";
  proposal: string;
  status: "open" | "accepted" | "rejected";
  decidedAt: string | null;
}

function build(): Repository<Negotiation> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Negotiation>({
        provider: "in-memory",
        entityName: "Negotiation",
      });
    case "supabase":
      return createRepository<Negotiation>({
        provider: "supabase",
        entityName: "Negotiation",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_NEGOTIATIONS_TABLE ?? "negotiations",
        },
      });
    case "firestore":
      return createRepository<Negotiation>({
        provider: "firestore",
        entityName: "Negotiation",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_NEGOTIATIONS_COLLECTION ?? "negotiations",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Negotiation>({
        provider: "upstash-redis",
        entityName: "Negotiation",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_NEGOTIATIONS_PREFIX ?? "negotiations",
        },
      });
    case "neon":
      return createRepository<Negotiation>({
        provider: "neon",
        entityName: "Negotiation",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_NEGOTIATIONS_TABLE ?? "negotiations",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const negotiationRepository: Repository<Negotiation> = build();
