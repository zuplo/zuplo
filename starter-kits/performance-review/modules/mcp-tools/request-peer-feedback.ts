import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Review } from "../repositories/reviews.ts";

/**
 * Orchestrator MCP tool: request_peer_feedback.
 *
 * Given a reviewee + a list of peer emails + a cycle, creates one draft
 * Review per peer with kind=peer, status=draft. Each Review goes through
 * the public create_review endpoint via context.invokeRoute so multi-tenant
 * scoping and validation stay enforced.
 */

interface Body {
  revieweeEmail: string;
  peerEmails: string[];
  cycleId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.revieweeEmail || !body.cycleId || !Array.isArray(body.peerEmails) || body.peerEmails.length === 0) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "revieweeEmail, peerEmails (non-empty), and cycleId are required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const created: Review[] = [];

  for (const peer of body.peerEmails) {
    if (peer === body.revieweeEmail) continue; // can't peer-review yourself
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
    created.push(review);
  }

  return new Response(
    JSON.stringify({
      revieweeEmail: body.revieweeEmail,
      cycleId: body.cycleId,
      requested: created.length,
      reviews: created,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
