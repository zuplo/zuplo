import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pageRepository } from "../repositories/pages.ts";

/**
 * Orchestrator MCP tool: merge_duplicate_pages.
 *
 * Given two page ids, returns a *proposed* merge — the concatenated content
 * with section headers, plus the references that should be updated. The
 * tool deliberately does NOT delete or rewrite anything; it just produces
 * the proposal. The LLM (or a human) is expected to call update_page on the
 * winner with the suggested body and then archive_page on the loser.
 */

interface Body {
  pageIdA: string;
  pageIdB: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.pageIdA || !body.pageIdB) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "pageIdA and pageIdB are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const [pageA, pageB] = await Promise.all([
    pageRepository.get(tenantId, body.pageIdA),
    pageRepository.get(tenantId, body.pageIdB),
  ]);

  if (!pageA || !pageB) {
    return new Response(
      JSON.stringify({
        error: {
          type: "not_found",
          message: "One or both pages not found in this tenant",
        },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Pick a winner: most-viewed wins, ties broken by most-recent edit.
  const aIsWinner =
    pageA.viewCount > pageB.viewCount ||
    (pageA.viewCount === pageB.viewCount &&
      new Date(pageA.lastEditedAt).getTime() >=
        new Date(pageB.lastEditedAt).getTime());

  const winner = aIsWinner ? pageA : pageB;
  const loser = aIsWinner ? pageB : pageA;

  const mergedBody = [
    `# ${winner.title}`,
    "",
    winner.body,
    "",
    `## Merged content from ${loser.title}`,
    "",
    loser.body,
    "",
    `## References`,
    `- Originally from: ${loser.spaceSlug}/${loser.slug}`,
    `- Loser page id (archive after merging): ${loser.id}`,
  ].join("\n");

  return new Response(
    JSON.stringify({
      proposedWinnerPageId: winner.id,
      proposedLoserPageId: loser.id,
      proposedTitle: winner.title,
      proposedBody: mergedBody,
      reasoning: aIsWinner
        ? `Page A wins on viewCount (${pageA.viewCount} vs ${pageB.viewCount}) and recency.`
        : `Page B wins on viewCount (${pageB.viewCount} vs ${pageA.viewCount}) and recency.`,
      nextSteps: [
        `Call update_page on ${winner.id} with the proposed body to keep its history intact.`,
        `Call archive_page on ${loser.id} after the merge so the redirect/audit row stays.`,
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
}
