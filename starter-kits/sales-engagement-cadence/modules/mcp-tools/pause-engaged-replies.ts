import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Enrollment } from "../repositories/enrollments.ts";
import type { Email } from "../repositories/emails.ts";

interface EnrollmentPage {
  items: Enrollment[];
  nextCursor: string | null;
}

interface EmailPage {
  items: Email[];
  nextCursor: string | null;
}

/**
 * Orchestrator: pause_engaged_replies.
 *
 * Cross-references emails that have a `repliedAt` with their parent
 * enrollment. If the enrollment is still active and the rep hasn't
 * already paused it, transition the enrollment to status='replied' so
 * it stops sending. Returns the number paused + the enrollment ids.
 *
 * Real-world: a Gmail webhook would call this nightly.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const auth = request.headers.get("authorization") ?? "";

  const repliedEnrollmentIds = new Set<string>();
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<EmailPage>(context, `/emails?${qs}`, {
      headers: { authorization: auth },
    });
    for (const email of page.items) {
      if (email.repliedAt) repliedEnrollmentIds.add(email.enrollmentId);
    }
    cursor = page.nextCursor;
  } while (cursor);

  const paused: string[] = [];
  let enrollCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (enrollCursor) qs.set("cursor", enrollCursor);
    const page = await invokeJson<EnrollmentPage>(context, `/enrollments?${qs}`, {
      headers: { authorization: auth },
    });
    for (const enrollment of page.items) {
      if (enrollment.status !== "active") continue;
      if (!repliedEnrollmentIds.has(enrollment.id)) continue;
      // Transition this enrollment by reusing the pause endpoint with a
      // different target status.
      await invokeJson(context, `/enrollments/${enrollment.id}/pause`, {
        method: "PATCH",
        headers: { authorization: auth },
      });
      paused.push(enrollment.id);
    }
    enrollCursor = page.nextCursor;
  } while (enrollCursor);

  return new Response(
    JSON.stringify({
      pausedCount: paused.length,
      pausedEnrollmentIds: paused,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
