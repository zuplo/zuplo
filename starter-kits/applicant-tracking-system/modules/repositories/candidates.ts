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
 * The Candidate entity. A person; can have multiple applications across jobs.
 */
export interface Candidate extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  currentTitle: string | null;
  createdAt: string;
}

function build(): Repository<Candidate> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Candidate>({ provider: "in-memory", entityName: "Candidate" });
    case "supabase":
      return createRepository<Candidate>({
        provider: "supabase",
        entityName: "Candidate",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CANDIDATES_TABLE ?? "candidates",
        },
      });
    case "firestore":
      return createRepository<Candidate>({
        provider: "firestore",
        entityName: "Candidate",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CANDIDATES_COLLECTION ?? "candidates",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Candidate>({
        provider: "upstash-redis",
        entityName: "Candidate",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CANDIDATES_KEY_PREFIX ?? "candidates",
        },
      });
    case "neon":
      return createRepository<Candidate>({
        provider: "neon",
        entityName: "Candidate",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CANDIDATES_TABLE ?? "candidates",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const candidateRepository: Repository<Candidate> = build();
