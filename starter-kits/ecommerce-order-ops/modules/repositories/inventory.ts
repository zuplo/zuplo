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
 * A delta applied to a SKU's stock count, with reason and audit metadata.
 */
export interface InventoryAdjustment extends Entity {
  sku: string;
  delta: number;
  reason: string;
  performedAt: string;
  performedBy: string;
}

function build(): Repository<InventoryAdjustment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<InventoryAdjustment>({
        provider: "in-memory",
        entityName: "InventoryAdjustment",
      });
    case "supabase":
      return createRepository<InventoryAdjustment>({
        provider: "supabase",
        entityName: "InventoryAdjustment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INVENTORY_TABLE ?? "inventory_adjustments",
        },
      });
    case "firestore":
      return createRepository<InventoryAdjustment>({
        provider: "firestore",
        entityName: "InventoryAdjustment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_INVENTORY_COLLECTION ?? "inventory_adjustments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<InventoryAdjustment>({
        provider: "upstash-redis",
        entityName: "InventoryAdjustment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INVENTORY_PREFIX ?? "inventory_adjustments",
        },
      });
    case "neon":
      return createRepository<InventoryAdjustment>({
        provider: "neon",
        entityName: "InventoryAdjustment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INVENTORY_TABLE ?? "inventory_adjustments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const inventoryRepository: Repository<InventoryAdjustment> = build();
