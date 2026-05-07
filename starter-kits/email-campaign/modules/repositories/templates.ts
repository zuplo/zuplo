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
 * An email template — re-usable subject/body shell.
 */
export interface Template extends Entity {
  name: string;
  subjectTemplate: string;
  htmlBody: string;
  textBody: string;
  createdAt: string;
}

function build(): Repository<Template> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Template>({ provider: "in-memory", entityName: "Template" });
    case "supabase":
      return createRepository<Template>({
        provider: "supabase",
        entityName: "Template",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TEMPLATES_TABLE ?? "templates",
        },
      });
    case "firestore":
      return createRepository<Template>({
        provider: "firestore",
        entityName: "Template",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TEMPLATES_COLLECTION ?? "templates",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Template>({
        provider: "upstash-redis",
        entityName: "Template",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TEMPLATES_PREFIX ?? "templates",
        },
      });
    case "neon":
      return createRepository<Template>({
        provider: "neon",
        entityName: "Template",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TEMPLATES_TABLE ?? "templates",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const templateRepository: Repository<Template> = build();
