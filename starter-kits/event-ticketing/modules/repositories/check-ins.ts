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
 * Audit record of when a ticket was scanned at a gate.
 */
export interface CheckIn extends Entity {
  ticketId: string;
  checkedInAt: string;
  checkedInBy: string;
  gate: string;
}

function build(): Repository<CheckIn> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<CheckIn>({ provider: "in-memory", entityName: "CheckIn" });
    case "supabase":
      return createRepository<CheckIn>({
        provider: "supabase",
        entityName: "CheckIn",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CHECK_INS_TABLE ?? "check_ins",
        },
      });
    case "firestore":
      return createRepository<CheckIn>({
        provider: "firestore",
        entityName: "CheckIn",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CHECK_INS_COLLECTION ?? "check_ins",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<CheckIn>({
        provider: "upstash-redis",
        entityName: "CheckIn",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CHECK_INS_PREFIX ?? "check_ins",
        },
      });
    case "neon":
      return createRepository<CheckIn>({
        provider: "neon",
        entityName: "CheckIn",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CHECK_INS_TABLE ?? "check_ins",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const checkInRepository: Repository<CheckIn> = build();
