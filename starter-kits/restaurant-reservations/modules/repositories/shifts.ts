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
 * The Shift entity. A scheduled service window (lunch/dinner/brunch/event).
 */
export interface Shift extends Entity {
  startsAt: string;
  endsAt: string;
  kind: "lunch" | "dinner" | "brunch" | "event";
  expectedCovers: number;
}

function build(): Repository<Shift> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Shift>({
        provider: "in-memory",
        entityName: "Shift",
      });
    case "supabase":
      return createRepository<Shift>({
        provider: "supabase",
        entityName: "Shift",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SHIFTS_TABLE ?? "shifts",
        },
      });
    case "firestore":
      return createRepository<Shift>({
        provider: "firestore",
        entityName: "Shift",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SHIFTS_COLLECTION ?? "shifts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Shift>({
        provider: "upstash-redis",
        entityName: "Shift",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SHIFTS_KEY_PREFIX ?? "shifts",
        },
      });
    case "neon":
      return createRepository<Shift>({
        provider: "neon",
        entityName: "Shift",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SHIFTS_TABLE ?? "shifts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const shiftRepository: Repository<Shift> = build();
