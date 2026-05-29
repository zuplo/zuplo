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

/** A pledge — promise to give over time. */
export interface Pledge extends Entity {
  donorId: string;
  amountCents: number;
  fulfilledCents: number;
  dueDate: string;
  status: "open" | "fulfilled" | "defaulted";
  createdAt: string;
}

function build(): Repository<Pledge> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Pledge>({ provider: "in-memory", entityName: "Pledge" });
    case "supabase":
      return createRepository<Pledge>({
        provider: "supabase",
        entityName: "Pledge",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PLEDGES_TABLE ?? "pledges",
        },
      });
    case "firestore":
      return createRepository<Pledge>({
        provider: "firestore",
        entityName: "Pledge",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PLEDGES_COLLECTION ?? "pledges",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Pledge>({
        provider: "upstash-redis",
        entityName: "Pledge",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PLEDGES_PREFIX ?? "pledges",
        },
      });
    case "neon":
      return createRepository<Pledge>({
        provider: "neon",
        entityName: "Pledge",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PLEDGES_TABLE ?? "pledges",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const pledgeRepository: Repository<Pledge> = build();
