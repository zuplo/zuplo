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
 * The Survey entity — a survey, poll, or quiz.
 */
export interface Survey extends Entity {
  slug: string;
  title: string;
  description: string;
  kind: "survey" | "poll" | "quiz";
  status: "draft" | "open" | "closed";
  openedAt: string | null;
  closesAt: string | null;
  anonymous: boolean;
  audienceSlug: string | null;
  createdAt: string;
}

/**
 * The Question entity — one prompt in a survey.
 */
export interface Question extends Entity {
  surveyId: string;
  prompt: string;
  kind: "single_choice" | "multi_choice" | "text" | "rating" | "nps";
  options: string[];
  required: boolean;
  displayOrder: number;
  createdAt: string;
}

/**
 * The Response entity — one respondent's submission to a survey.
 */
export interface Response_ extends Entity {
  surveyId: string;
  respondentEmail: string | null;
  submittedAt: string;
  anonymous: boolean;
  createdAt: string;
}

/**
 * The Answer entity — a respondent's answer to a single question.
 */
export interface Answer extends Entity {
  responseId: string;
  questionId: string;
  // value is intentionally `unknown` — answer shape depends on question.kind.
  value: unknown;
  createdAt: string;
}

/**
 * The Cohort entity — a named subset of respondents.
 */
export interface Cohort extends Entity {
  slug: string;
  name: string;
  // Free-form criteria (e.g. { team: "engineering", tenure: { gte: 365 } }).
  criteria: Record<string, unknown>;
  createdAt: string;
}

function buildSurveys(): Repository<Survey> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Survey>({ provider: "in-memory", entityName: "Survey" });
    case "supabase":
      return createRepository<Survey>({
        provider: "supabase",
        entityName: "Survey",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SURVEYS_TABLE ?? "surveys",
        },
      });
    case "firestore":
      return createRepository<Survey>({
        provider: "firestore",
        entityName: "Survey",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SURVEYS_COLLECTION ?? "surveys",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Survey>({
        provider: "upstash-redis",
        entityName: "Survey",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SURVEYS_PREFIX ?? "surveys",
        },
      });
    case "neon":
      return createRepository<Survey>({
        provider: "neon",
        entityName: "Survey",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SURVEYS_TABLE ?? "surveys",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildQuestions(): Repository<Question> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Question>({ provider: "in-memory", entityName: "Question" });
    case "supabase":
      return createRepository<Question>({
        provider: "supabase",
        entityName: "Question",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_QUESTIONS_TABLE ?? "questions",
        },
      });
    case "firestore":
      return createRepository<Question>({
        provider: "firestore",
        entityName: "Question",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_QUESTIONS_COLLECTION ?? "questions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Question>({
        provider: "upstash-redis",
        entityName: "Question",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_QUESTIONS_PREFIX ?? "questions",
        },
      });
    case "neon":
      return createRepository<Question>({
        provider: "neon",
        entityName: "Question",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_QUESTIONS_TABLE ?? "questions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildResponses(): Repository<Response_> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Response_>({ provider: "in-memory", entityName: "Response" });
    case "supabase":
      return createRepository<Response_>({
        provider: "supabase",
        entityName: "Response",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RESPONSES_TABLE ?? "responses",
        },
      });
    case "firestore":
      return createRepository<Response_>({
        provider: "firestore",
        entityName: "Response",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RESPONSES_COLLECTION ?? "responses",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Response_>({
        provider: "upstash-redis",
        entityName: "Response",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RESPONSES_PREFIX ?? "responses",
        },
      });
    case "neon":
      return createRepository<Response_>({
        provider: "neon",
        entityName: "Response",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RESPONSES_TABLE ?? "responses",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAnswers(): Repository<Answer> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Answer>({ provider: "in-memory", entityName: "Answer" });
    case "supabase":
      return createRepository<Answer>({
        provider: "supabase",
        entityName: "Answer",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ANSWERS_TABLE ?? "answers",
        },
      });
    case "firestore":
      return createRepository<Answer>({
        provider: "firestore",
        entityName: "Answer",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ANSWERS_COLLECTION ?? "answers",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Answer>({
        provider: "upstash-redis",
        entityName: "Answer",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ANSWERS_PREFIX ?? "answers",
        },
      });
    case "neon":
      return createRepository<Answer>({
        provider: "neon",
        entityName: "Answer",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ANSWERS_TABLE ?? "answers",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildCohorts(): Repository<Cohort> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Cohort>({ provider: "in-memory", entityName: "Cohort" });
    case "supabase":
      return createRepository<Cohort>({
        provider: "supabase",
        entityName: "Cohort",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COHORTS_TABLE ?? "cohorts",
        },
      });
    case "firestore":
      return createRepository<Cohort>({
        provider: "firestore",
        entityName: "Cohort",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COHORTS_COLLECTION ?? "cohorts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Cohort>({
        provider: "upstash-redis",
        entityName: "Cohort",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_COHORTS_PREFIX ?? "cohorts",
        },
      });
    case "neon":
      return createRepository<Cohort>({
        provider: "neon",
        entityName: "Cohort",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COHORTS_TABLE ?? "cohorts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const surveyRepository: Repository<Survey> = buildSurveys();
export const questionRepository: Repository<Question> = buildQuestions();
export const responseRepository: Repository<Response_> = buildResponses();
export const answerRepository: Repository<Answer> = buildAnswers();
export const cohortRepository: Repository<Cohort> = buildCohorts();
