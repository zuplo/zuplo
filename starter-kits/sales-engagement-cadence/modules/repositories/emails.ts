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
 * An Email — one outbound message tied to a step in an enrollment, with
 * delivery / engagement timestamps.
 */
export interface Email extends Entity {
  enrollmentId: string;
  stepIndex: number;
  subject: string;
  body: string;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

function build(): Repository<Email> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Email>({ provider: "in-memory", entityName: "Email" });
    case "supabase":
      return createRepository<Email>({
        provider: "supabase",
        entityName: "Email",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EMAILS_TABLE ?? "emails",
        },
      });
    case "firestore":
      return createRepository<Email>({
        provider: "firestore",
        entityName: "Email",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EMAILS_COLLECTION ?? "emails",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Email>({
        provider: "upstash-redis",
        entityName: "Email",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EMAILS_PREFIX ?? "emails",
        },
      });
    case "neon":
      return createRepository<Email>({
        provider: "neon",
        entityName: "Email",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EMAILS_TABLE ?? "emails",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const emailRepository: Repository<Email> = build();
