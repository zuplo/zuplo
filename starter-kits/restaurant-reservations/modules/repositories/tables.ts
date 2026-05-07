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
 * The Table entity. A physical table in the floor plan.
 */
export interface Table extends Entity {
  number: string;
  capacity: number;
  location: "main" | "bar" | "patio" | "private";
  status: "available" | "occupied" | "reserved" | "out_of_service";
}

function build(): Repository<Table> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Table>({
        provider: "in-memory",
        entityName: "Table",
      });
    case "supabase":
      return createRepository<Table>({
        provider: "supabase",
        entityName: "Table",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TABLES_TABLE ?? "tables",
        },
      });
    case "firestore":
      return createRepository<Table>({
        provider: "firestore",
        entityName: "Table",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TABLES_COLLECTION ?? "tables",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Table>({
        provider: "upstash-redis",
        entityName: "Table",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TABLES_KEY_PREFIX ?? "tables",
        },
      });
    case "neon":
      return createRepository<Table>({
        provider: "neon",
        entityName: "Table",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TABLES_TABLE ?? "tables",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const tableRepository: Repository<Table> = build();
