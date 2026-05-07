import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Enrollment } from "../repositories/enrollments.ts";
import type { Cadence } from "../repositories/cadences.ts";
import type { Prospect } from "../repositories/prospects.ts";

interface Body {
  enrollmentId: string;
  stepIndex: number;
}

interface EnrollmentPage {
  items: Enrollment[];
  nextCursor: string | null;
}

interface ProspectPage {
  items: Prospect[];
  nextCursor: string | null;
}

/**
 * Orchestrator: personalize_step_for_prospect.
 *
 * Reads the enrollment, the parent cadence, and the prospect, then
 * renders the requested step's template with simple {{firstName}}-style
 * placeholders. Returns the rendered subject + body so a downstream
 * mailer can send.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  // Find the enrollment by walking list_enrollments (no get_enrollment route exposed).
  let enrollment: Enrollment | null = null;
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<EnrollmentPage>(context, `/enrollments?${qs}`, {
      headers: { authorization: auth },
    });
    enrollment = page.items.find((e) => e.id === body.enrollmentId) ?? null;
    if (enrollment) break;
    cursor = page.nextCursor;
  } while (cursor);

  if (!enrollment) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Enrollment not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const cadence = await invokeJson<Cadence>(context, `/cadences/${enrollment.cadenceId}`, {
    headers: { authorization: auth },
  });
  const step = cadence.steps[body.stepIndex];
  if (!step) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Step index out of range" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Resolve the prospect.
  let prospect: Prospect | null = null;
  cursor = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ProspectPage>(context, `/prospects?${qs}`, {
      headers: { authorization: auth },
    });
    prospect = page.items.find((p) => p.id === enrollment!.prospectId) ?? null;
    if (prospect) break;
    cursor = page.nextCursor;
  } while (cursor);

  if (!prospect) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Prospect not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Simple template rendering — supports {{firstName}}, {{lastName}},
  // {{company}}, {{title}}, {{email}}, {{repEmail}}.
  const tokens: Record<string, string> = {
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    company: prospect.company,
    title: prospect.title,
    email: prospect.email,
    repEmail: enrollment.repEmail,
  };
  const render = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_m, key) => tokens[key] ?? "");

  // The template format is "subject\n\nbody"; tolerate templates that omit
  // a subject line (then subject is empty).
  const [subjectLine, ...bodyLines] = step.template.split("\n");
  const renderedSubject = render(subjectLine);
  const renderedBody = render(bodyLines.join("\n").trimStart());

  return new Response(
    JSON.stringify({
      enrollmentId: enrollment.id,
      cadenceId: cadence.id,
      stepIndex: body.stepIndex,
      stepKind: step.kind,
      subject: renderedSubject,
      body: renderedBody,
      tokensUsed: tokens,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
