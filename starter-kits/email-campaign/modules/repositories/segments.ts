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
 * A saved subscriber filter.
 */
export interface Segment extends Entity {
  name: string;
  criteria: Record<string, unknown>;
  subscriberCount: number;
  createdAt: string;
}

function build(): Repository<Segment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Segment>({ provider: "in-memory", entityName: "Segment" });
    case "supabase":
      return createRepository<Segment>({
        provider: "supabase",
        entityName: "Segment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SEGMENTS_TABLE ?? "segments",
        },
      });
    case "firestore":
      return createRepository<Segment>({
        provider: "firestore",
        entityName: "Segment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SEGMENTS_COLLECTION ?? "segments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Segment>({
        provider: "upstash-redis",
        entityName: "Segment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SEGMENTS_PREFIX ?? "segments",
        },
      });
    case "neon":
      return createRepository<Segment>({
        provider: "neon",
        entityName: "Segment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SEGMENTS_TABLE ?? "segments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const segmentRepository: Repository<Segment> = build();
