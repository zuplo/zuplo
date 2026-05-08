import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Review } from "../repositories/reviews.ts";
import { sendResendEmail } from "../integrations/resend.ts";

/**
 * Orchestrator MCP tool: request_peer_feedback.
 *
 * Given a reviewee + a list of peer emails + a cycle, creates one draft
 * Review per peer with kind=peer, status=draft, then (when sendInvites: true)
 * fires a templated email to each reviewer via Resend asking them to fill in
 * their review by the cycle deadline.
 *
 * The email body can be overridden with `messageBody` (with `{{name}}`,
 * `{{revieweeName}}`, `{{deadline}}`, `{{reviewLink}}` placeholders), or
 * left to the default template.
 */

interface Body {
  revieweeEmail: string;
  peerEmails: string[];
  cycleId: string;
  /** When true, send a Resend email to each reviewer once the draft Review is created. */
  sendInvites?: boolean;
  /** Display name for the reviewee, used in the email subject + body. */
  revieweeName?: string;
  /** Optional deadline string surfaced to reviewers (e.g. "Jan 19"). */
  deadline?: string;
  /** Optional URL to your review portal where reviewers fill out their review. */
  reviewLink?: string;
  /** Override the default body. Supports {{name}}, {{revieweeName}}, {{deadline}}, {{reviewLink}}. */
  messageBody?: string;
  /** Override the default subject. */
  messageSubject?: string;
}

interface SentInfo {
  reviewerEmail: string;
  reviewId: string;
  invite: { sent: boolean; id?: string; error?: string } | null;
}

const DEFAULT_BODY = [
  "Hi {{name}},",
  "",
  "{{revieweeName}} has selected you as a peer reviewer for this cycle.",
  "Your feedback is hugely valuable — please share what you've seen of their work, where they shine, and where they have room to grow.",
  "",
  "{{reviewLink}}",
  "",
  "Please submit by {{deadline}}.",
  "",
  "Thanks!",
].join("\n");

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (
    !body.revieweeEmail ||
    !body.cycleId ||
    !Array.isArray(body.peerEmails) ||
    body.peerEmails.length === 0
  ) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "revieweeEmail, peerEmails (non-empty), and cycleId are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const sent: SentInfo[] = [];
  const revieweeName = body.revieweeName ?? body.revieweeEmail;
  const deadline = body.deadline ?? "the cycle deadline";
  const reviewLink = body.reviewLink ?? "(your review portal)";
  const subjectTemplate =
    body.messageSubject ?? `Peer feedback request: ${revieweeName} (${body.cycleId})`;
  const bodyTemplate = body.messageBody ?? DEFAULT_BODY;

  for (const peer of body.peerEmails) {
    if (peer === body.revieweeEmail) continue; // can't peer-review yourself

    // Step 1: create the Review row through the public endpoint.
    const review = await invokeJson<Review>(context, `/reviews`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({
        revieweeEmail: body.revieweeEmail,
        reviewerEmail: peer,
        cycleId: body.cycleId,
        kind: "peer",
        status: "draft",
        ratings: {},
        narrative: "",
      }),
    });

    // Step 2: optionally email the reviewer with a request.
    let invite: SentInfo["invite"] = null;
    if (body.sendInvites) {
      const peerName = peer.split("@")[0] ?? peer;
      const text = fillTemplate(bodyTemplate, {
        name: peerName,
        revieweeName,
        deadline,
        reviewLink,
      });
      const subject = fillTemplate(subjectTemplate, {
        name: peerName,
        revieweeName,
        deadline,
        reviewLink,
      });
      try {
        const result = await sendResendEmail({
          to: peer,
          subject,
          text,
        });
        invite = { sent: true, id: result.id };
      } catch (err) {
        invite = { sent: false, error: (err as Error).message };
      }
    }

    sent.push({
      reviewerEmail: peer,
      reviewId: review.id,
      invite,
    });
  }

  return new Response(
    JSON.stringify({
      revieweeEmail: body.revieweeEmail,
      cycleId: body.cycleId,
      requested: sent.length,
      reviewers: sent,
      invitesAttempted: body.sendInvites === true,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
