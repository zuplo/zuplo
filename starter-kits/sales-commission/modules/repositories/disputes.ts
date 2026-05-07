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
 * A Dispute — a rep's challenge against a payout calculation. Tracked
 * with reason + resolution for audit.
 */
export interface Dispute extends Entity {
  payoutId: string;
  repEmail: string;
  reason: string;
  status: "open" | "resolved";
  resolution: string;
  filedAt: string;
  resolvedAt: string | null;
}

function build(): Repository<Dispute> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Dispute>({ provider: "in-memory", entityName: "Dispute" });
    case "supabase":
      return createRepository<Dispute>({
        provider: "supabase",
        entityName: "Dispute",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_DISPUTES_TABLE ?? "disputes",
        },
      });
    case "firestore":
      return createRepository<Dispute>({
        provider: "firestore",
        entityName: "Dispute",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_DISPUTES_COLLECTION ?? "disputes",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Dispute>({
        provider: "upstash-redis",
        entityName: "Dispute",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_DISPUTES_PREFIX ?? "disputes",
        },
      });
    case "neon":
      return createRepository<Dispute>({
        provider: "neon",
        entityName: "Dispute",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_DISPUTES_TABLE ?? "disputes",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const disputeRepository: Repository<Dispute> = build();
