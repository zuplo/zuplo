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
 * The signed contract behind a renewal opportunity. Persisted separately
 * from the renewal so historical contracts stay queryable after a renewal
 * closes.
 */
export interface Contract extends Entity {
  accountId: string;
  startDate: string;
  endDate: string;
  autoRenews: boolean;
  currentArrCents: number;
  currency: string;
  terms: string;
}

function build(): Repository<Contract> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Contract>({
        provider: "in-memory",
        entityName: "Contract",
      });
    case "supabase":
      return createRepository<Contract>({
        provider: "supabase",
        entityName: "Contract",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONTRACTS_TABLE ?? "contracts",
        },
      });
    case "firestore":
      return createRepository<Contract>({
        provider: "firestore",
        entityName: "Contract",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONTRACTS_COLLECTION ?? "contracts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Contract>({
        provider: "upstash-redis",
        entityName: "Contract",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONTRACTS_PREFIX ?? "contracts",
        },
      });
    case "neon":
      return createRepository<Contract>({
        provider: "neon",
        entityName: "Contract",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONTRACTS_TABLE ?? "contracts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const contractRepository: Repository<Contract> = build();
