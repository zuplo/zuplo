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
 * A single field on an IntakeForm.
 */
export interface IntakeFormField {
  id: string;
  label: string;
  kind: "text" | "textarea" | "date" | "select" | "checkbox" | "boolean" | "number";
  required: boolean;
  options?: string[];
}

/**
 * The IntakeForm entity — a versioned form template patients fill out.
 */
export interface IntakeForm extends Entity {
  slug: string;
  name: string;
  fields: IntakeFormField[];
  targetVisitKind: string;
  active: boolean;
  createdAt: string;
}

function build(): Repository<IntakeForm> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<IntakeForm>({
        provider: "in-memory",
        entityName: "IntakeForm",
      });
    case "supabase":
      return createRepository<IntakeForm>({
        provider: "supabase",
        entityName: "IntakeForm",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INTAKE_FORMS_TABLE ?? "intake_forms",
        },
      });
    case "firestore":
      return createRepository<IntakeForm>({
        provider: "firestore",
        entityName: "IntakeForm",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_INTAKE_FORMS_COLLECTION ?? "intake_forms",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<IntakeForm>({
        provider: "upstash-redis",
        entityName: "IntakeForm",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INTAKE_FORMS_PREFIX ?? "intake_forms",
        },
      });
    case "neon":
      return createRepository<IntakeForm>({
        provider: "neon",
        entityName: "IntakeForm",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INTAKE_FORMS_TABLE ?? "intake_forms",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const intakeFormRepository: Repository<IntakeForm> = build();
