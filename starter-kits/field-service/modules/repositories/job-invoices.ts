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
 * The JobInvoice entity. An invoice issued for a completed job.
 */
export interface JobInvoice extends Entity {
  jobId: string;
  totalCents: number;
  status: "draft" | "sent" | "paid" | "overdue";
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

function build(): Repository<JobInvoice> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<JobInvoice>({
        provider: "in-memory",
        entityName: "JobInvoice",
      });
    case "supabase":
      return createRepository<JobInvoice>({
        provider: "supabase",
        entityName: "JobInvoice",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_JOB_INVOICES_TABLE ?? "job_invoices",
        },
      });
    case "firestore":
      return createRepository<JobInvoice>({
        provider: "firestore",
        entityName: "JobInvoice",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_JOB_INVOICES_COLLECTION ?? "job_invoices",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<JobInvoice>({
        provider: "upstash-redis",
        entityName: "JobInvoice",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_JOB_INVOICES_KEY_PREFIX ?? "job_invoices",
        },
      });
    case "neon":
      return createRepository<JobInvoice>({
        provider: "neon",
        entityName: "JobInvoice",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_JOB_INVOICES_TABLE ?? "job_invoices",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const jobInvoiceRepository: Repository<JobInvoice> = build();
