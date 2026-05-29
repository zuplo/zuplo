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
 * An in-flight playbook execution against a specific account. `currentStep`
 * is an index into the playbook's `steps` array.
 */
export interface PlaybookRun extends Entity {
  playbookId: string;
  accountId: string;
  status: "active" | "completed" | "canceled";
  currentStep: number;
  startedAt: string;
}

function build(): Repository<PlaybookRun> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<PlaybookRun>({
        provider: "in-memory",
        entityName: "PlaybookRun",
      });
    case "supabase":
      return createRepository<PlaybookRun>({
        provider: "supabase",
        entityName: "PlaybookRun",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PLAYBOOK_RUNS_TABLE ?? "playbook_runs",
        },
      });
    case "firestore":
      return createRepository<PlaybookRun>({
        provider: "firestore",
        entityName: "PlaybookRun",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PLAYBOOK_RUNS_COLLECTION ?? "playbook_runs",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<PlaybookRun>({
        provider: "upstash-redis",
        entityName: "PlaybookRun",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PLAYBOOK_RUNS_PREFIX ?? "playbook_runs",
        },
      });
    case "neon":
      return createRepository<PlaybookRun>({
        provider: "neon",
        entityName: "PlaybookRun",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PLAYBOOK_RUNS_TABLE ?? "playbook_runs",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const playbookRunRepository: Repository<PlaybookRun> = build();
