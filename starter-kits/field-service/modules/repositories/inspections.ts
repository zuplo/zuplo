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

export interface InspectionFinding {
  item: string;
  status: "pass" | "fail" | "warning";
  notes?: string;
}

/**
 * The Inspection entity. A structured inspection report against a job.
 */
export interface Inspection extends Entity {
  jobId: string;
  kind: string;
  performedAt: string;
  findings: InspectionFinding[];
}

function build(): Repository<Inspection> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Inspection>({
        provider: "in-memory",
        entityName: "Inspection",
      });
    case "supabase":
      return createRepository<Inspection>({
        provider: "supabase",
        entityName: "Inspection",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INSPECTIONS_TABLE ?? "inspections",
        },
      });
    case "firestore":
      return createRepository<Inspection>({
        provider: "firestore",
        entityName: "Inspection",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_INSPECTIONS_COLLECTION ?? "inspections",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Inspection>({
        provider: "upstash-redis",
        entityName: "Inspection",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_INSPECTIONS_KEY_PREFIX ?? "inspections",
        },
      });
    case "neon":
      return createRepository<Inspection>({
        provider: "neon",
        entityName: "Inspection",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INSPECTIONS_TABLE ?? "inspections",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const inspectionRepository: Repository<Inspection> = build();
