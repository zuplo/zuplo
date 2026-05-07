import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "../_shared/adapters/index.ts";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** A fundraising campaign. */
export interface Campaign extends Entity {
  name: string;
  goalCents: number;
  startDate: string;
  endDate: string;
  raisedCents: number;
  donorCount: number;
  status: "active" | "closed";
}

function build(): Repository<Campaign> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Campaign>({ provider: "in-memory", entityName: "Campaign" });
    case "supabase":
      return createRepository<Campaign>({
        provider: "supabase",
        entityName: "Campaign",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CAMPAIGNS_TABLE ?? "campaigns",
        },
      });
    case "firestore":
      return createRepository<Campaign>({
        provider: "firestore",
        entityName: "Campaign",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CAMPAIGNS_COLLECTION ?? "campaigns",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Campaign>({
        provider: "upstash-redis",
        entityName: "Campaign",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CAMPAIGNS_PREFIX ?? "campaigns",
        },
      });
    case "neon":
      return createRepository<Campaign>({
        provider: "neon",
        entityName: "Campaign",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CAMPAIGNS_TABLE ?? "campaigns",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const campaignRepository: Repository<Campaign> = build();
