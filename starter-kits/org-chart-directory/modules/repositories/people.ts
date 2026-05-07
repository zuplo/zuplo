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
 * The Person entity. A single employee in the organization.
 */
export interface Person extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  department: string;
  managerEmail: string | null;
  location: string;
  startDate: string;
  status: "active" | "on_leave" | "departed";
  createdAt: string;
}

/**
 * The Team entity. A group with a lead and an optional parent team.
 */
export interface Team extends Entity {
  name: string;
  leadEmail: string;
  parentTeamId: string | null;
  createdAt: string;
}

/**
 * A skill someone in the org might have.
 */
export interface Skill extends Entity {
  name: string;
  category: string;
  createdAt: string;
}

/**
 * The join table between a Person and a Skill, with a proficiency level.
 */
export interface PersonSkill extends Entity {
  personEmail: string;
  skillName: string;
  level: number;
  createdAt: string;
}

function buildPeople(): Repository<Person> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Person>({ provider: "in-memory", entityName: "Person" });
    case "supabase":
      return createRepository<Person>({
        provider: "supabase",
        entityName: "Person",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PEOPLE_TABLE ?? "people",
        },
      });
    case "firestore":
      return createRepository<Person>({
        provider: "firestore",
        entityName: "Person",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PEOPLE_COLLECTION ?? "people",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Person>({
        provider: "upstash-redis",
        entityName: "Person",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PEOPLE_PREFIX ?? "people",
        },
      });
    case "neon":
      return createRepository<Person>({
        provider: "neon",
        entityName: "Person",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PEOPLE_TABLE ?? "people",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildTeams(): Repository<Team> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Team>({ provider: "in-memory", entityName: "Team" });
    case "supabase":
      return createRepository<Team>({
        provider: "supabase",
        entityName: "Team",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TEAMS_TABLE ?? "teams",
        },
      });
    case "firestore":
      return createRepository<Team>({
        provider: "firestore",
        entityName: "Team",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TEAMS_COLLECTION ?? "teams",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Team>({
        provider: "upstash-redis",
        entityName: "Team",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TEAMS_PREFIX ?? "teams",
        },
      });
    case "neon":
      return createRepository<Team>({
        provider: "neon",
        entityName: "Team",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TEAMS_TABLE ?? "teams",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildSkills(): Repository<Skill> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Skill>({ provider: "in-memory", entityName: "Skill" });
    case "supabase":
      return createRepository<Skill>({
        provider: "supabase",
        entityName: "Skill",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SKILLS_TABLE ?? "skills",
        },
      });
    case "firestore":
      return createRepository<Skill>({
        provider: "firestore",
        entityName: "Skill",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SKILLS_COLLECTION ?? "skills",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Skill>({
        provider: "upstash-redis",
        entityName: "Skill",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SKILLS_PREFIX ?? "skills",
        },
      });
    case "neon":
      return createRepository<Skill>({
        provider: "neon",
        entityName: "Skill",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SKILLS_TABLE ?? "skills",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildPersonSkills(): Repository<PersonSkill> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<PersonSkill>({ provider: "in-memory", entityName: "PersonSkill" });
    case "supabase":
      return createRepository<PersonSkill>({
        provider: "supabase",
        entityName: "PersonSkill",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PERSON_SKILLS_TABLE ?? "person_skills",
        },
      });
    case "firestore":
      return createRepository<PersonSkill>({
        provider: "firestore",
        entityName: "PersonSkill",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PERSON_SKILLS_COLLECTION ?? "person_skills",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<PersonSkill>({
        provider: "upstash-redis",
        entityName: "PersonSkill",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PERSON_SKILLS_PREFIX ?? "person_skills",
        },
      });
    case "neon":
      return createRepository<PersonSkill>({
        provider: "neon",
        entityName: "PersonSkill",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PERSON_SKILLS_TABLE ?? "person_skills",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const personRepository: Repository<Person> = buildPeople();
export const teamRepository: Repository<Team> = buildTeams();
export const skillRepository: Repository<Skill> = buildSkills();
export const personSkillRepository: Repository<PersonSkill> = buildPersonSkills();
