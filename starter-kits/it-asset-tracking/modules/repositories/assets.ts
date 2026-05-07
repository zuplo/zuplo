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
 * The Asset entity — a tracked piece of company hardware (laptop, monitor, etc.).
 */
export interface Asset extends Entity {
  assetTag: string;
  kind: "laptop" | "monitor" | "phone" | "peripheral" | "server" | "other";
  make: string;
  model: string;
  serialNumber: string;
  status: "in_stock" | "assigned" | "in_repair" | "retired" | "lost";
  purchaseDate: string;
  purchaseCostCents: number;
  warrantyEndDate: string | null;
  location: string;
  createdAt: string;
}

/**
 * An assignment of an asset to an employee.
 */
export interface Assignment extends Entity {
  assetId: string;
  employeeEmail: string;
  assignedAt: string;
  returnedAt: string | null;
  returnCondition: string | null;
  createdAt: string;
}

/**
 * A maintenance record (repair, upgrade, audit) against an asset.
 */
export interface MaintenanceRecord extends Entity {
  assetId: string;
  kind: "repair" | "upgrade" | "audit";
  description: string;
  technicianEmail: string;
  costCents: number;
  performedAt: string;
  createdAt: string;
}

/**
 * A software license tracked alongside an asset.
 */
export interface License extends Entity {
  assetId: string;
  softwareName: string;
  licenseKey: string;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * A physical location where assets live (HQ, remote, warehouse, etc.).
 */
export interface Location extends Entity {
  slug: string;
  name: string;
  address: string;
  createdAt: string;
}

function buildAssets(): Repository<Asset> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Asset>({ provider: "in-memory", entityName: "Asset" });
    case "supabase":
      return createRepository<Asset>({
        provider: "supabase",
        entityName: "Asset",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ASSETS_TABLE ?? "assets",
        },
      });
    case "firestore":
      return createRepository<Asset>({
        provider: "firestore",
        entityName: "Asset",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ASSETS_COLLECTION ?? "assets",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Asset>({
        provider: "upstash-redis",
        entityName: "Asset",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ASSETS_PREFIX ?? "assets",
        },
      });
    case "neon":
      return createRepository<Asset>({
        provider: "neon",
        entityName: "Asset",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ASSETS_TABLE ?? "assets",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAssignments(): Repository<Assignment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Assignment>({ provider: "in-memory", entityName: "Assignment" });
    case "supabase":
      return createRepository<Assignment>({
        provider: "supabase",
        entityName: "Assignment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ASSIGNMENTS_TABLE ?? "assignments",
        },
      });
    case "firestore":
      return createRepository<Assignment>({
        provider: "firestore",
        entityName: "Assignment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ASSIGNMENTS_COLLECTION ?? "assignments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Assignment>({
        provider: "upstash-redis",
        entityName: "Assignment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ASSIGNMENTS_PREFIX ?? "assignments",
        },
      });
    case "neon":
      return createRepository<Assignment>({
        provider: "neon",
        entityName: "Assignment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ASSIGNMENTS_TABLE ?? "assignments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildMaintenance(): Repository<MaintenanceRecord> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<MaintenanceRecord>({ provider: "in-memory", entityName: "MaintenanceRecord" });
    case "supabase":
      return createRepository<MaintenanceRecord>({
        provider: "supabase",
        entityName: "MaintenanceRecord",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_MAINTENANCE_TABLE ?? "maintenance_records",
        },
      });
    case "firestore":
      return createRepository<MaintenanceRecord>({
        provider: "firestore",
        entityName: "MaintenanceRecord",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_MAINTENANCE_COLLECTION ?? "maintenance_records",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<MaintenanceRecord>({
        provider: "upstash-redis",
        entityName: "MaintenanceRecord",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_MAINTENANCE_PREFIX ?? "maintenance_records",
        },
      });
    case "neon":
      return createRepository<MaintenanceRecord>({
        provider: "neon",
        entityName: "MaintenanceRecord",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_MAINTENANCE_TABLE ?? "maintenance_records",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildLicenses(): Repository<License> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<License>({ provider: "in-memory", entityName: "License" });
    case "supabase":
      return createRepository<License>({
        provider: "supabase",
        entityName: "License",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LICENSES_TABLE ?? "licenses",
        },
      });
    case "firestore":
      return createRepository<License>({
        provider: "firestore",
        entityName: "License",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LICENSES_COLLECTION ?? "licenses",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<License>({
        provider: "upstash-redis",
        entityName: "License",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LICENSES_PREFIX ?? "licenses",
        },
      });
    case "neon":
      return createRepository<License>({
        provider: "neon",
        entityName: "License",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LICENSES_TABLE ?? "licenses",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildLocations(): Repository<Location> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Location>({ provider: "in-memory", entityName: "Location" });
    case "supabase":
      return createRepository<Location>({
        provider: "supabase",
        entityName: "Location",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LOCATIONS_TABLE ?? "locations",
        },
      });
    case "firestore":
      return createRepository<Location>({
        provider: "firestore",
        entityName: "Location",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LOCATIONS_COLLECTION ?? "locations",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Location>({
        provider: "upstash-redis",
        entityName: "Location",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LOCATIONS_PREFIX ?? "locations",
        },
      });
    case "neon":
      return createRepository<Location>({
        provider: "neon",
        entityName: "Location",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LOCATIONS_TABLE ?? "locations",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const assetRepository: Repository<Asset> = buildAssets();
export const assignmentRepository: Repository<Assignment> = buildAssignments();
export const maintenanceRepository: Repository<MaintenanceRecord> = buildMaintenance();
export const licenseRepository: Repository<License> = buildLicenses();
export const locationRepository: Repository<Location> = buildLocations();
