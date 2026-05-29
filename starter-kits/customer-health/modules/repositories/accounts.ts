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
 * A customer account. The unit of CSM ownership and renewal.
 */
export interface Account extends Entity {
  name: string;
  csmEmail: string;
  arrCents: number;
  renewsAt: string;
  segment: "smb" | "midmarket" | "enterprise";
  lifecycleStage: string;
}

function build(): Repository<Account> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Account>({
        provider: "in-memory",
        entityName: "Account",
      });
    case "supabase":
      return createRepository<Account>({
        provider: "supabase",
        entityName: "Account",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ACCOUNTS_TABLE ?? "accounts",
        },
      });
    case "firestore":
      return createRepository<Account>({
        provider: "firestore",
        entityName: "Account",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ACCOUNTS_COLLECTION ?? "accounts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Account>({
        provider: "upstash-redis",
        entityName: "Account",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ACCOUNTS_PREFIX ?? "accounts",
        },
      });
    case "neon":
      return createRepository<Account>({
        provider: "neon",
        entityName: "Account",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ACCOUNTS_TABLE ?? "accounts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const accountRepository: Repository<Account> = build();
