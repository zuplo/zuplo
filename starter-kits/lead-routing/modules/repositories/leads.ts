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
 * A sales Lead — the parent entity in lead-routing. Status drives the
 * SDR funnel; assignedTo records the rep that owns it.
 */
export interface Lead extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "unqualified" | "converted";
  assignedTo: string | null;
  assignedAt: string | null;
  score: number;
  createdAt: string;
}

function build(): Repository<Lead> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Lead>({ provider: "in-memory", entityName: "Lead" });
    case "supabase":
      return createRepository<Lead>({
        provider: "supabase",
        entityName: "Lead",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LEADS_TABLE ?? "leads",
        },
      });
    case "firestore":
      return createRepository<Lead>({
        provider: "firestore",
        entityName: "Lead",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LEADS_COLLECTION ?? "leads",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Lead>({
        provider: "upstash-redis",
        entityName: "Lead",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LEADS_PREFIX ?? "leads",
        },
      });
    case "neon":
      return createRepository<Lead>({
        provider: "neon",
        entityName: "Lead",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LEADS_TABLE ?? "leads",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const leadRepository: Repository<Lead> = build();
