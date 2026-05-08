import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Student } from "../repositories/students.ts";
import { sendResendEmail } from "../integrations/resend.ts";

/**
 * Orchestrator MCP tool: send_progress_report.
 *
 * Composes `draft_progress_report` (which assembles the per-section
 * narrative) and ships the result via Resend. Recipient defaults to the
 * parent email on file (falling back to the student email). Returns the
 * structured draft alongside the Resend message id so the caller can
 * audit what was sent.
 */

interface Body {
  studentId: string;
  /** Optional course filter — restrict the report to a single course. */
  courseId?: string;
  /** Override the email recipient. Defaults to parent email, then student email. */
  toEmail?: string;
  /** Optional CC list (e.g. [counselor]). */
  cc?: string[];
  /** Override the subject. */
  subject?: string;
  /** When false, only return the draft — don't send. Defaults to true. */
  send?: boolean;
}

interface DraftSection {
  enrollmentId: string;
  courseId: string;
  courseName: string;
  enrollmentStatus: string;
  averageGradePct: number | null;
  gradeCount: number;
  attendanceRate: number | null;
  narrative: string;
  recentGrades: Array<{ id: string; score: number; maxScore: number }>;
}

interface DraftResponse {
  student: Student;
  generatedAt: string;
  sections: DraftSection[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.studentId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "studentId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const send = body.send !== false;

  // Reuse the existing draft orchestrator so the prose stays in one place.
  const draft = await invokeJson<DraftResponse>(
    context,
    "/draft-progress-report",
    {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        studentId: body.studentId,
        courseId: body.courseId,
      }),
    },
  );

  const recipient =
    body.toEmail ?? draft.student.parentEmail ?? draft.student.email;
  const subject =
    body.subject ?? `Progress report — ${draft.student.firstName} ${draft.student.lastName}`;

  const lines: string[] = [];
  lines.push(`Progress report for ${draft.student.firstName} ${draft.student.lastName}`);
  lines.push(`Generated ${draft.generatedAt}`);
  lines.push("");
  for (const sec of draft.sections) {
    lines.push(`# ${sec.courseName}`);
    lines.push(sec.narrative);
    lines.push("");
  }
  if (draft.sections.length === 0) {
    lines.push("(No active enrollments to report on.)");
  }
  const text = lines.join("\n");

  const sectionHtml = draft.sections
    .map(
      (s) => `
        <h3 style="margin:1.2em 0 0.4em;font-size:1em">${escapeHtml(s.courseName)}</h3>
        <p style="margin:0 0 0.6em">${escapeHtml(s.narrative)}</p>
      `,
    )
    .join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;line-height:1.5">
      <h2 style="margin:0 0 0.6em">${escapeHtml(`${draft.student.firstName} ${draft.student.lastName}`)} — progress report</h2>
      <p style="color:#666;margin:0 0 1em">${escapeHtml(draft.generatedAt)}</p>
      ${sectionHtml || "<p>(No active enrollments to report on.)</p>"}
    </div>`;

  let messageId: string | null = null;
  let sendError: string | null = null;
  if (send) {
    try {
      const resp = await sendResendEmail({
        to: recipient,
        cc: body.cc,
        subject,
        text,
        html,
        idempotencyKey: `progress-${body.studentId}-${draft.generatedAt.slice(0, 10)}${body.courseId ? `-${body.courseId}` : ""}`,
      });
      messageId = resp.id;
    } catch (err) {
      sendError = (err as Error).message;
    }
  }

  return new Response(
    JSON.stringify({
      student: draft.student,
      generatedAt: draft.generatedAt,
      sections: draft.sections,
      to: recipient,
      subject,
      sent: Boolean(messageId),
      messageId,
      sendError,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
