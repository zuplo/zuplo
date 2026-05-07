export * from "./repository.ts";
export { inMemoryRepository } from "./in-memory.ts";
export { supabaseRepository } from "./supabase.ts";
export { firestoreRepository } from "./firestore.ts";
export { clickhouseRepository } from "./clickhouse.ts";
export { upstashRedisRepository } from "./upstash-redis.ts";
export { neonRepository } from "./neon.ts";

import { Adapter, Entity, Repository } from "./repository.ts";
import { inMemoryRepository } from "./in-memory.ts";
import { supabaseRepository, SupabaseRepositoryOptions } from "./supabase.ts";
import { firestoreRepository, FirestoreRepositoryOptions } from "./firestore.ts";
import { clickhouseRepository, ClickHouseRepositoryOptions } from "./clickhouse.ts";
import { upstashRedisRepository, UpstashRedisRepositoryOptions } from "./upstash-redis.ts";
import { neonRepository, NeonRepositoryOptions } from "./neon.ts";

export type DbProvider =
  | "in-memory"
  | "supabase"
  | "firestore"
  | "clickhouse"
  | "upstash-redis"
  | "neon";

export interface RepositoryConfig {
  provider: DbProvider;
  entityName: string;
  inMemory?: { seed?: Record<string, unknown[]> };
  supabase?: SupabaseRepositoryOptions;
  firestore?: FirestoreRepositoryOptions;
  clickhouse?: ClickHouseRepositoryOptions;
  upstashRedis?: UpstashRedisRepositoryOptions;
  neon?: NeonRepositoryOptions;
}

/**
 * Create a Repository<T> backed by the configured provider. Kits typically
 * call this once at module-load time using `environment` from @zuplo/runtime
 * to resolve the provider and credentials.
 */
export function createRepository<T extends Entity>(
  config: RepositoryConfig,
): Repository<T> & Adapter {
  switch (config.provider) {
    case "in-memory":
      return inMemoryRepository<T>(config.entityName, {
        seed: config.inMemory?.seed as Record<string, T[]> | undefined,
      });
    case "supabase":
      if (!config.supabase) throw new Error("Missing supabase config");
      return supabaseRepository<T>(config.entityName, config.supabase);
    case "firestore":
      if (!config.firestore) throw new Error("Missing firestore config");
      return firestoreRepository<T>(config.entityName, config.firestore);
    case "clickhouse":
      if (!config.clickhouse) throw new Error("Missing clickhouse config");
      return clickhouseRepository<T>(config.entityName, config.clickhouse);
    case "upstash-redis":
      if (!config.upstashRedis) throw new Error("Missing upstashRedis config");
      return upstashRedisRepository<T>(config.entityName, config.upstashRedis);
    case "neon":
      if (!config.neon) throw new Error("Missing neon config");
      return neonRepository<T>(config.entityName, config.neon);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown DbProvider: ${String(_exhaustive)}`);
    }
  }
}
