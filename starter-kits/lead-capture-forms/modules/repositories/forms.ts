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
 * A single field on a form.
 */
export interface FormField {
  name: string;
  type: string;
  required: boolean;
  label: string;
}

/**
 * A form definition. Fields, slug, optional webhook + redirect URLs.
 */
export interface Form extends Entity {
  name: string;
  slug: string;
  fields: FormField[];
  webhookUrl: string | null;
  redirectUrl: string | null;
  active: boolean;
  createdAt: string;
}

function build(): Repository<Form> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Form>({ provider: "in-memory", entityName: "Form" });
    case "supabase":
      return createRepository<Form>({
        provider: "supabase",
        entityName: "Form",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_FORMS_TABLE ?? "forms",
        },
      });
    case "firestore":
      return createRepository<Form>({
        provider: "firestore",
        entityName: "Form",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_FORMS_COLLECTION ?? "forms",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Form>({
        provider: "upstash-redis",
        entityName: "Form",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_FORMS_PREFIX ?? "forms",
        },
      });
    case "neon":
      return createRepository<Form>({
        provider: "neon",
        entityName: "Form",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_FORMS_TABLE ?? "forms",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const formRepository: Repository<Form> = build();
