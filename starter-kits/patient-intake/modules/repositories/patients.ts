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
 * The Patient entity — the person an intake submission is about.
 */
export interface Patient extends Entity {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  mrn: string;
  address: string;
  primaryProviderEmail: string | null;
  status: "active" | "inactive";
  createdAt: string;
}

function build(): Repository<Patient> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Patient>({
        provider: "in-memory",
        entityName: "Patient",
      });
    case "supabase":
      return createRepository<Patient>({
        provider: "supabase",
        entityName: "Patient",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PATIENTS_TABLE ?? "patients",
        },
      });
    case "firestore":
      return createRepository<Patient>({
        provider: "firestore",
        entityName: "Patient",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PATIENTS_COLLECTION ?? "patients",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Patient>({
        provider: "upstash-redis",
        entityName: "Patient",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PATIENTS_PREFIX ?? "patients",
        },
      });
    case "neon":
      return createRepository<Patient>({
        provider: "neon",
        entityName: "Patient",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PATIENTS_TABLE ?? "patients",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const patientRepository: Repository<Patient> = build();
