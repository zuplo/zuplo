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
 * A Prospect — the contact being engaged. Status mirrors engagement state.
 */
export interface Prospect extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  status: "new" | "engaged" | "replied" | "opted_out";
}

function build(): Repository<Prospect> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Prospect>({ provider: "in-memory", entityName: "Prospect" });
    case "supabase":
      return createRepository<Prospect>({
        provider: "supabase",
        entityName: "Prospect",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PROSPECTS_TABLE ?? "prospects",
        },
      });
    case "firestore":
      return createRepository<Prospect>({
        provider: "firestore",
        entityName: "Prospect",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PROSPECTS_COLLECTION ?? "prospects",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Prospect>({
        provider: "upstash-redis",
        entityName: "Prospect",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PROSPECTS_PREFIX ?? "prospects",
        },
      });
    case "neon":
      return createRepository<Prospect>({
        provider: "neon",
        entityName: "Prospect",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PROSPECTS_TABLE ?? "prospects",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const prospectRepository: Repository<Prospect> = build();
