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
 * The Insurance entity — a single payer/plan tied to a patient.
 */
export interface Insurance extends Entity {
  patientId: string;
  payerName: string;
  planName: string;
  memberId: string;
  groupNumber: string;
  verified: boolean;
  verifiedAt: string | null;
  eligibility: "active" | "inactive" | "expired" | "unknown";
}

function build(): Repository<Insurance> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Insurance>({
        provider: "in-memory",
        entityName: "Insurance",
      });
    case "supabase":
      return createRepository<Insurance>({
        provider: "supabase",
        entityName: "Insurance",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INSURANCE_TABLE ?? "insurance",
        },
      });
    case "firestore":
      return createRepository<Insurance>({
        provider: "firestore",
        entityName: "Insurance",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_INSURANCE_COLLECTION ?? "insurance",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Insurance>({
        provider: "upstash-redis",
        entityName: "Insurance",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INSURANCE_PREFIX ?? "insurance",
        },
      });
    case "neon":
      return createRepository<Insurance>({
        provider: "neon",
        entityName: "Insurance",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INSURANCE_TABLE ?? "insurance",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const insuranceRepository: Repository<Insurance> = build();
