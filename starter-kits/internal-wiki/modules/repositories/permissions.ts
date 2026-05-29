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
 * The Permission entity. Per-employee role on a Space. Production forks
 * would resolve viewer/editor/admin during read time, but the kit treats
 * these as plain rows you list and update.
 */
export interface Permission extends Entity {
  spaceSlug: string;
  employeeEmail: string;
  role: "viewer" | "editor" | "admin";
  updatedAt: string;
}

function build(): Repository<Permission> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Permission>({
        provider: "in-memory",
        entityName: "Permission",
      });
    case "supabase":
      return createRepository<Permission>({
        provider: "supabase",
        entityName: "Permission",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PERMISSIONS_TABLE ?? "permissions",
        },
      });
    case "firestore":
      return createRepository<Permission>({
        provider: "firestore",
        entityName: "Permission",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_PERMISSIONS_COLLECTION ?? "permissions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Permission>({
        provider: "upstash-redis",
        entityName: "Permission",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_PERMISSIONS_KEY_PREFIX ?? "permissions",
        },
      });
    case "neon":
      return createRepository<Permission>({
        provider: "neon",
        entityName: "Permission",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PERMISSIONS_TABLE ?? "permissions",
        },
      });
    case "clickhouse":
      return createRepository<Permission>({
        provider: "clickhouse",
        entityName: "Permission",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_PERMISSIONS_TABLE ?? "permissions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const permissionRepository: Repository<Permission> = build();
