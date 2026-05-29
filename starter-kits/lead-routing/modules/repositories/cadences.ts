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

/**
 * Outreach cadence — a sequence of touch steps, used to onboard a routed
 * Lead into outbound activity.
 */
export interface CadenceStep {
  dayOffset: number;
  kind: "email" | "call" | "task";
  template: string;
}

export interface Cadence extends Entity {
  name: string;
  steps: CadenceStep[];
}

function build(): Repository<Cadence> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Cadence>({ provider: "in-memory", entityName: "Cadence" });
    case "supabase":
      return createRepository<Cadence>({
        provider: "supabase",
        entityName: "Cadence",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CADENCES_TABLE ?? "cadences",
        },
      });
    case "firestore":
      return createRepository<Cadence>({
        provider: "firestore",
        entityName: "Cadence",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CADENCES_COLLECTION ?? "cadences",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Cadence>({
        provider: "upstash-redis",
        entityName: "Cadence",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CADENCES_PREFIX ?? "cadences",
        },
      });
    case "neon":
      return createRepository<Cadence>({
        provider: "neon",
        entityName: "Cadence",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CADENCES_TABLE ?? "cadences",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const cadenceRepository: Repository<Cadence> = build();
