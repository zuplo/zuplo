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
 * The Consent entity — a signed (or withdrawn) consent record.
 */
export interface Consent extends Entity {
  patientId: string;
  kind: "treatment" | "hipaa" | "telehealth" | "research";
  version: string;
  signedAt: string;
  withdrawnAt: string | null;
}

function build(): Repository<Consent> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Consent>({
        provider: "in-memory",
        entityName: "Consent",
      });
    case "supabase":
      return createRepository<Consent>({
        provider: "supabase",
        entityName: "Consent",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONSENTS_TABLE ?? "consents",
        },
      });
    case "firestore":
      return createRepository<Consent>({
        provider: "firestore",
        entityName: "Consent",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONSENTS_COLLECTION ?? "consents",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Consent>({
        provider: "upstash-redis",
        entityName: "Consent",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONSENTS_PREFIX ?? "consents",
        },
      });
    case "neon":
      return createRepository<Consent>({
        provider: "neon",
        entityName: "Consent",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONSENTS_TABLE ?? "consents",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const consentRepository: Repository<Consent> = build();
