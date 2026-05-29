import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** A vendor that the company can issue POs to. */
export interface Vendor extends Entity {
  name: string;
  email: string | null;
  taxId: string | null;
  paymentTerms: string;
  preferredVendor: boolean;
  createdAt: string;
}

function build(): Repository<Vendor> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Vendor>({ provider: "in-memory", entityName: "Vendor" });
    case "supabase":
      return createRepository<Vendor>({
        provider: "supabase",
        entityName: "Vendor",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_VENDORS_TABLE ?? "vendors",
        },
      });
    case "firestore":
      return createRepository<Vendor>({
        provider: "firestore",
        entityName: "Vendor",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_VENDORS_COLLECTION ?? "vendors",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Vendor>({
        provider: "upstash-redis",
        entityName: "Vendor",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_VENDORS_PREFIX ?? "vendors",
        },
      });
    case "neon":
      return createRepository<Vendor>({
        provider: "neon",
        entityName: "Vendor",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_VENDORS_TABLE ?? "vendors",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const vendorRepository: Repository<Vendor> = build();
