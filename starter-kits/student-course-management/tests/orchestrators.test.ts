import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import draftProgressReport from "../modules/mcp-tools/draft-progress-report.ts";
import flagAtRiskStudents from "../modules/mcp-tools/flag-at-risk-students.ts";
import recommendRemediation from "../modules/mcp-tools/recommend-remediation.ts";
import sendProgressReport from "../modules/mcp-tools/send-progress-report.ts";
import createLesson from "../modules/handlers/create-lesson.ts";
import getStudent from "../modules/handlers/get-student.ts";
import getCourse from "../modules/handlers/get-course.ts";
import getEnrollment from "../modules/handlers/get-enrollment.ts";
import listStudents from "../modules/handlers/list-students.ts";
import listCourses from "../modules/handlers/list-courses.ts";
import listEnrollments from "../modules/handlers/list-enrollments.ts";
import listGrades from "../modules/handlers/list-grades.ts";
import listAttendance from "../modules/handlers/list-attendance.ts";
import listLessons from "../modules/handlers/list-lessons.ts";
import {
  studentRepository,
  type Student,
} from "../modules/repositories/students.ts";
import {
  courseRepository,
  type Course,
} from "../modules/repositories/courses.ts";
import {
  enrollmentRepository,
  type Enrollment,
} from "../modules/repositories/enrollments.ts";
import { gradeRepository, type Grade } from "../modules/repositories/grades.ts";
import {
  attendanceRepository,
  type Attendance,
} from "../modules/repositories/attendance.ts";
import { lessonRepository } from "../modules/repositories/lessons.ts";
import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

const baseRoutes = {
  "GET /students": (req: ZuploRequest, ctx: ZuploContext) => listStudents(req, ctx),
  "GET /students/:id": (req: ZuploRequest, ctx: ZuploContext) => getStudent(req, ctx),
  "GET /courses": (req: ZuploRequest, ctx: ZuploContext) => listCourses(req, ctx),
  "GET /courses/:id": (req: ZuploRequest, ctx: ZuploContext) => getCourse(req, ctx),
  "GET /enrollments": (req: ZuploRequest, ctx: ZuploContext) => listEnrollments(req, ctx),
  "GET /enrollments/:id": (req: ZuploRequest, ctx: ZuploContext) => getEnrollment(req, ctx),
  "GET /grades": (req: ZuploRequest, ctx: ZuploContext) => listGrades(req, ctx),
  "GET /attendance": (req: ZuploRequest, ctx: ZuploContext) => listAttendance(req, ctx),
  "GET /lessons": (req: ZuploRequest, ctx: ZuploContext) => listLessons(req, ctx),
};

// send_progress_report calls /draft-progress-report internally — wire that too.
const routes = {
  ...baseRoutes,
  "POST /draft-progress-report": (req: ZuploRequest, ctx: ZuploContext) =>
    draftProgressReport(req, ctx),
};

async function seedStudent(
  tenantId: string,
  overrides: Partial<Student> = {},
): Promise<Student> {
  return studentRepository.create(tenantId, {
    firstName: "Sam",
    lastName: "Student",
    email: "sam@school.example",
    dateOfBirth: "2010-01-01",
    parentEmail: "parent@school.example",
    gradeLevel: "9",
    status: "active",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Omit<Student, "id" | "tenantId">);
}

async function seedCourse(
  tenantId: string,
  overrides: Partial<Course> = {},
): Promise<Course> {
  return courseRepository.create(tenantId, {
    slug: `course-${Math.random().toString(36).slice(2, 7)}`,
    name: "Algebra 101",
    description: "Intro algebra",
    instructorEmail: "teacher@school.example",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    capacity: 30,
    schedule: "MWF 09:00",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Omit<Course, "id" | "tenantId">);
}

async function seedEnrollment(
  tenantId: string,
  studentId: string,
  courseId: string,
  overrides: Partial<Enrollment> = {},
): Promise<Enrollment> {
  return enrollmentRepository.create(tenantId, {
    studentId,
    courseId,
    status: "enrolled",
    enrolledAt: new Date().toISOString(),
    completedAt: null,
    finalGrade: null,
    ...overrides,
  } as Omit<Enrollment, "id" | "tenantId">);
}

async function seedGrade(
  tenantId: string,
  enrollmentId: string,
  overrides: Partial<Grade> = {},
): Promise<Grade> {
  return gradeRepository.create(tenantId, {
    enrollmentId,
    lessonId: null,
    kind: "quiz",
    score: 85,
    maxScore: 100,
    gradedAt: new Date().toISOString(),
    feedback: null,
    ...overrides,
  } as Omit<Grade, "id" | "tenantId">);
}

async function seedAttendance(
  tenantId: string,
  studentId: string,
  status: Attendance["status"],
  overrides: Partial<Attendance> = {},
): Promise<Attendance> {
  return attendanceRepository.create(tenantId, {
    lessonId: "lesson_1",
    studentId,
    status,
    markedAt: new Date().toISOString(),
    ...overrides,
  } as Omit<Attendance, "id" | "tenantId">);
}

describe("orchestrator: draft_progress_report", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns sections per enrollment with grades, attendance, and narrative", async () => {
    const tenantId = "tenant-pr-1";
    const student = await seedStudent(tenantId);
    const course = await seedCourse(tenantId, { name: "Intro Bio" });
    const enrollment = await seedEnrollment(tenantId, student.id, course.id);
    await seedGrade(tenantId, enrollment.id, { score: 90, maxScore: 100 });
    await seedGrade(tenantId, enrollment.id, { score: 80, maxScore: 100 });
    await seedAttendance(tenantId, student.id, "present");
    await seedAttendance(tenantId, student.id, "absent");

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-progress-report",
      method: "POST",
      body: { studentId: student.id },
      tenantId,
    });

    const response = await draftProgressReport(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      sections: Array<{
        courseName: string;
        averageGradePct: number | null;
        attendanceRate: number | null;
        narrative: string;
      }>;
    };
    expect(json.sections).toHaveLength(1);
    expect(json.sections[0].courseName).toBe("Intro Bio");
    expect(json.sections[0].averageGradePct).toBe(85);
    expect(json.sections[0].attendanceRate).toBe(0.5);
    expect(json.sections[0].narrative).toContain("Sam Student");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown student", async () => {
    const { context } = makeContext({ routes, tenantId: "t-pr-404" });
    const request = makeRequest({
      url: "https://kit.test/draft-progress-report",
      method: "POST",
      body: { studentId: "missing" },
      tenantId: "t-pr-404",
    });
    const response = await draftProgressReport(request, context);
    expect(response.status).toBe(404);
  });

  it("returns empty sections when student has no enrollments", async () => {
    const tenantId = "tenant-pr-empty";
    const student = await seedStudent(tenantId);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-progress-report",
      method: "POST",
      body: { studentId: student.id },
      tenantId,
    });

    const response = await draftProgressReport(request, context);
    const json = (await response.json()) as { sections: unknown[] };
    expect(json.sections).toEqual([]);
  });
});

describe("orchestrator: send_progress_report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  });

  it("happy path: drafts the report and emails the parent via Resend", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@school.example");
    const tenantId = "tenant-spr-1";
    const student = await seedStudent(tenantId, {
      parentEmail: "parent@example.com",
      email: "student@example.com",
    });
    const course = await seedCourse(tenantId);
    const enrollment = await seedEnrollment(tenantId, student.id, course.id);
    await seedGrade(tenantId, enrollment.id, { score: 92, maxScore: 100 });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_progress" }), { status: 200 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-progress-report",
      method: "POST",
      body: { studentId: student.id },
      tenantId,
    });

    const response = await sendProgressReport(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      sent: boolean;
      messageId: string | null;
      to: string;
    };
    expect(json.sent).toBe(true);
    expect(json.messageId).toBe("re_progress");
    expect(json.to).toBe("parent@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("draft-only path: send=false returns the draft without calling Resend", async () => {
    const tenantId = "tenant-spr-draft";
    const student = await seedStudent(tenantId);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-progress-report",
      method: "POST",
      body: { studentId: student.id, send: false },
      tenantId,
    });

    const response = await sendProgressReport(request, context);
    const json = (await response.json()) as {
      sent: boolean;
      messageId: string | null;
    };
    expect(json.sent).toBe(false);
    expect(json.messageId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures sendError when Resend fails (send=true)", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@school.example");
    const tenantId = "tenant-spr-fail";
    const student = await seedStudent(tenantId);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-progress-report",
      method: "POST",
      body: { studentId: student.id },
      tenantId,
    });

    const response = await sendProgressReport(request, context);
    const json = (await response.json()) as {
      sent: boolean;
      sendError: string | null;
    };
    expect(json.sent).toBe(false);
    expect(json.sendError).toMatch(/429/);
  });

  it("falls back to student email when parent email is null", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@school.example");
    const tenantId = "tenant-spr-noparent";
    const student = await seedStudent(tenantId, {
      parentEmail: null,
      email: "lone@example.com",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_x" }), { status: 200 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-progress-report",
      method: "POST",
      body: { studentId: student.id },
      tenantId,
    });

    const response = await sendProgressReport(request, context);
    const json = (await response.json()) as { to: string };
    expect(json.to).toBe("lone@example.com");
    const sentBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(sentBody.to).toBe("lone@example.com");
  });
});

describe("orchestrator: flag_at_risk_students", () => {
  afterEach(() => vi.restoreAllMocks());

  it("flags a student whose average grade is below the threshold", async () => {
    const tenantId = "tenant-flag-1";
    const student = await seedStudent(tenantId, { firstName: "Risky" });
    const course = await seedCourse(tenantId);
    const enrollment = await seedEnrollment(tenantId, student.id, course.id);
    // Average 50% — well below 70.
    await seedGrade(tenantId, enrollment.id, { score: 50, maxScore: 100 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-at-risk-students",
      method: "POST",
      body: { failingGradePct: 70 },
      tenantId,
    });

    const response = await flagAtRiskStudents(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      flaggedCount: number;
      flagged: Array<{ studentId: string; signals: string[] }>;
    };
    expect(json.flaggedCount).toBe(1);
    expect(json.flagged[0].studentId).toBe(student.id);
    expect(json.flagged[0].signals[0]).toMatch(/average_grade/);
  });

  it("does not flag a student with passing grades and good attendance", async () => {
    const tenantId = "tenant-flag-empty";
    const student = await seedStudent(tenantId);
    const course = await seedCourse(tenantId);
    const enrollment = await seedEnrollment(tenantId, student.id, course.id);
    await seedGrade(tenantId, enrollment.id, { score: 95, maxScore: 100 });
    for (let i = 0; i < 10; i++) await seedAttendance(tenantId, student.id, "present");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-at-risk-students",
      method: "POST",
      body: {},
      tenantId,
    });

    const response = await flagAtRiskStudents(request, context);
    const json = (await response.json()) as { flaggedCount: number };
    expect(json.flaggedCount).toBe(0);
  });

  it("does not see another tenant's enrollments", async () => {
    const tenantA = "tenant-flag-iso-a";
    const tenantB = "tenant-flag-iso-b";
    const student = await seedStudent(tenantB);
    const course = await seedCourse(tenantB);
    const enrollment = await seedEnrollment(tenantB, student.id, course.id);
    await seedGrade(tenantB, enrollment.id, { score: 30, maxScore: 100 });

    const { context } = makeContext({ routes, tenantId: tenantA });
    const request = makeRequest({
      url: "https://kit.test/flag-at-risk-students",
      method: "POST",
      body: {},
      tenantId: tenantA,
    });
    const response = await flagAtRiskStudents(request, context);
    const json = (await response.json()) as { flaggedCount: number };
    expect(json.flaggedCount).toBe(0);
  });
});

describe("orchestrator: recommend_remediation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("recommends actions for kinds where average is below threshold", async () => {
    const tenantId = "tenant-rem-1";
    const student = await seedStudent(tenantId);
    const course = await seedCourse(tenantId);
    const enrollment = await seedEnrollment(tenantId, student.id, course.id);
    // Weak quiz average (50%), strong assignment average (90%).
    await seedGrade(tenantId, enrollment.id, { kind: "quiz", score: 50, maxScore: 100 });
    await seedGrade(tenantId, enrollment.id, { kind: "assignment", score: 90, maxScore: 100 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-remediation",
      method: "POST",
      body: { enrollmentId: enrollment.id },
      tenantId,
    });

    const response = await recommendRemediation(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      weakAreas: Array<{ kind: string }>;
      recommendations: Array<{ area: string; action: string }>;
    };
    expect(json.weakAreas.find((w) => w.kind === "quiz")).toBeTruthy();
    expect(json.weakAreas.find((w) => w.kind === "assignment")).toBeFalsy();
    expect(json.recommendations[0].area).toBe("quiz");
    expect(json.recommendations[0].action).toMatch(/quiz prep/);
  });

  it("returns 404 for an unknown enrollment", async () => {
    const { context } = makeContext({ routes, tenantId: "t-rem-404" });
    const request = makeRequest({
      url: "https://kit.test/recommend-remediation",
      method: "POST",
      body: { enrollmentId: "missing" },
      tenantId: "t-rem-404",
    });
    const response = await recommendRemediation(request, context);
    expect(response.status).toBe(404);
  });

  it("returns no weak areas when all averages are above threshold", async () => {
    const tenantId = "tenant-rem-strong";
    const student = await seedStudent(tenantId);
    const course = await seedCourse(tenantId);
    const enrollment = await seedEnrollment(tenantId, student.id, course.id);
    await seedGrade(tenantId, enrollment.id, { kind: "quiz", score: 95, maxScore: 100 });
    await seedGrade(tenantId, enrollment.id, { kind: "exam", score: 90, maxScore: 100 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-remediation",
      method: "POST",
      body: { enrollmentId: enrollment.id },
      tenantId,
    });

    const response = await recommendRemediation(request, context);
    const json = (await response.json()) as {
      weakAreas: unknown[];
      recommendations: unknown[];
    };
    expect(json.weakAreas).toEqual([]);
    expect(json.recommendations).toEqual([]);
  });
});

describe("orchestrator-ish: create_lesson (uses Google Calendar)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
  });

  it("happy path: creates calendar event and persists lesson with calendarEventId", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const tenantId = "tenant-lesson-1";
    const course = await seedCourse(tenantId);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt_lesson",
          htmlLink: "https://cal",
          hangoutLink: "https://meet/abc",
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/lessons",
      method: "POST",
      body: {
        courseId: course.id,
        title: "Week 1: Linear equations",
        description: "intro",
        scheduledFor: "2026-09-08T15:00:00Z",
        durationMinutes: 60,
        inviteStudents: false,
        createMeetLink: true,
      },
      tenantId,
    });

    const response = await createLesson(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      meetLink: string | null;
      lesson: { id: string; calendarEventId: string | null };
    };
    expect(json.calendarEventId).toBe("evt_lesson");
    expect(json.meetLink).toBe("https://meet/abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = await lessonRepository.get(tenantId, json.lesson.id);
    expect(stored?.calendarEventId).toBe("evt_lesson");
  });

  it("silent=true skips calendar but still creates the lesson", async () => {
    const tenantId = "tenant-lesson-silent";
    const course = await seedCourse(tenantId);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/lessons",
      method: "POST",
      body: {
        courseId: course.id,
        title: "Silent lesson",
        description: "x",
        scheduledFor: "2026-09-08T15:00:00Z",
        durationMinutes: 60,
        silent: true,
      },
      tenantId,
    });

    const response = await createLesson(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as { calendarEventId: string | null };
    expect(json.calendarEventId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures calendarError when GCal fails but still creates the lesson", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const tenantId = "tenant-lesson-cal-fail";
    const course = await seedCourse(tenantId);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/lessons",
      method: "POST",
      body: {
        courseId: course.id,
        title: "Failing lesson",
        description: "x",
        scheduledFor: "2026-09-08T15:00:00Z",
        durationMinutes: 60,
        inviteStudents: false,
      },
      tenantId,
    });

    const response = await createLesson(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      calendarError: string | null;
      lesson: { id: string };
    };
    expect(json.calendarEventId).toBeNull();
    expect(json.calendarError).toMatch(/500/);
    const stored = await lessonRepository.get(tenantId, json.lesson.id);
    expect(stored).not.toBeNull();
  });
});
