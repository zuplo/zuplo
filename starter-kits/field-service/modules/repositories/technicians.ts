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
 * The Technician entity. A field worker dispatched to jobs.
 */
export interface Technician extends Entity {
  email: string;
  firstName: string;
  lastName: string;
  skills: string[];
  territory: string | null;
  status: "active" | "on_leave";
}

function build(): Repository<Technician> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Technician>({
        provider: "in-memory",
        entityName: "Technician",
      });
    case "supabase":
      return createRepository<Technician>({
        provider: "supabase",
        entityName: "Technician",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TECHNICIANS_TABLE ?? "technicians",
        },
      });
    case "firestore":
      return createRepository<Technician>({
        provider: "firestore",
        entityName: "Technician",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_TECHNICIANS_COLLECTION ?? "technicians",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Technician>({
        provider: "upstash-redis",
        entityName: "Technician",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_TECHNICIANS_KEY_PREFIX ?? "technicians",
        },
      });
    case "neon":
      return createRepository<Technician>({
        provider: "neon",
        entityName: "Technician",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TECHNICIANS_TABLE ?? "technicians",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const technicianRepository: Repository<Technician> = build();
