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

/** A frozen snapshot of a rep's pipeline at a point in time. */
export interface PipelineSnapshot extends Entity {
  repEmail: string;
  takenAt: string;
  totalPipelineCents: number;
  totalCommitCents: number;
  totalUpsideCents: number;
  dealCount: number;
}

function build(): Repository<PipelineSnapshot> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<PipelineSnapshot>({ provider: "in-memory", entityName: "PipelineSnapshot" });
    case "supabase":
      return createRepository<PipelineSnapshot>({
        provider: "supabase",
        entityName: "PipelineSnapshot",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PIPELINE_SNAPSHOTS_TABLE ?? "pipeline_snapshots",
        },
      });
    case "firestore":
      return createRepository<PipelineSnapshot>({
        provider: "firestore",
        entityName: "PipelineSnapshot",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PIPELINE_SNAPSHOTS_COLLECTION ?? "pipeline_snapshots",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<PipelineSnapshot>({
        provider: "upstash-redis",
        entityName: "PipelineSnapshot",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PIPELINE_SNAPSHOTS_PREFIX ?? "pipeline_snapshots",
        },
      });
    case "neon":
      return createRepository<PipelineSnapshot>({
        provider: "neon",
        entityName: "PipelineSnapshot",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PIPELINE_SNAPSHOTS_TABLE ?? "pipeline_snapshots",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const pipelineSnapshotRepository: Repository<PipelineSnapshot> = build();
