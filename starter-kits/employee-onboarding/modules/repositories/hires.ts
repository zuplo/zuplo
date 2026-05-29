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
 * The Hire entity. A new employee being onboarded.
 */
export interface Hire extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  startDate: string;
  managerEmail: string;
  buddyEmail: string | null;
  status: "pre_start" | "first_week" | "first_month" | "complete";
  createdAt: string;
}

function build(): Repository<Hire> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Hire>({ provider: "in-memory", entityName: "Hire" });
    case "supabase":
      return createRepository<Hire>({
        provider: "supabase",
        entityName: "Hire",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_HIRES_TABLE ?? "hires",
        },
      });
    case "firestore":
      return createRepository<Hire>({
        provider: "firestore",
        entityName: "Hire",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_HIRES_COLLECTION ?? "hires",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Hire>({
        provider: "upstash-redis",
        entityName: "Hire",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_HIRES_KEY_PREFIX ?? "hires",
        },
      });
    case "neon":
      return createRepository<Hire>({
        provider: "neon",
        entityName: "Hire",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_HIRES_TABLE ?? "hires",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const hireRepository: Repository<Hire> = build();
