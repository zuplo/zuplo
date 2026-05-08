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
 * A shipment created against an order with carrier tracking metadata.
 */
export interface Shipment extends Entity {
  orderId: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  status: "label_purchased" | "in_transit" | "delivered" | "exception";
  shippedAt: string | null;
  deliveredAt: string | null;
  /** ShipEngine label id (when created via ShipEngine). */
  shipengineLabelId?: string | null;
  /** Public URL to the label PDF returned by ShipEngine. */
  labelUrl?: string | null;
  /** Carrier-specific tracking URL. */
  trackingUrl?: string | null;
}

function build(): Repository<Shipment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Shipment>({ provider: "in-memory", entityName: "Shipment" });
    case "supabase":
      return createRepository<Shipment>({
        provider: "supabase",
        entityName: "Shipment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SHIPMENTS_TABLE ?? "shipments",
        },
      });
    case "firestore":
      return createRepository<Shipment>({
        provider: "firestore",
        entityName: "Shipment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SHIPMENTS_COLLECTION ?? "shipments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Shipment>({
        provider: "upstash-redis",
        entityName: "Shipment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SHIPMENTS_PREFIX ?? "shipments",
        },
      });
    case "neon":
      return createRepository<Shipment>({
        provider: "neon",
        entityName: "Shipment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SHIPMENTS_TABLE ?? "shipments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const shipmentRepository: Repository<Shipment> = build();
