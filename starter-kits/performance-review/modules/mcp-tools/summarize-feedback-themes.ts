import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Review } from "../repositories/reviews.ts";
import { completeWithClaude } from "../integrations/claude.ts";

/**
 * Orchestrator MCP tool: summarize_feedback_themes.
 *
 * For a reviewee + cycle, lists all submitted reviews and produces a themed
 * summary structure: per-kind counts, per-competency average ratings, and a
 * concatenation of the narratives keyed by reviewer kind.
 *
 * When `clusterThemes: true`, also asks Claude to read every narrative and
 * cluster them into 3-6 named themes with quotes, evidence counts, and a
 * one-line manager-action recommendation per theme. This is the calibration
 * write-up the manager actually delivers.
 */

interface Body {
  revieweeEmail: string;
  cycleId: string;
  /** When true, ask Claude to cluster narratives into themes. */
  clusterThemes?: boolean;
  /** Optional displayed name for the reviewee in the themed write-up. */
  revieweeName?: string;
}

interface ReviewPage {
  items: Review[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.revieweeEmail || !body.cycleId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "revieweeEmail and cycleId are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const reviews: Review[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      revieweeEmail: body.revieweeEmail,
      cycleId: body.cycleId,
      status: "submitted",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ReviewPage>(
      context,
      `/reviews?${qs}`,
      { headers: { authorization: auth } },
    );
    reviews.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const byKind: Record<string, number> = {};
  const ratingsTotals: Record<string, { sum: number; n: number }> = {};
  const narrativesByKind: Record<string, string[]> = {};

  for (const r of reviews) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    for (const [comp, val] of Object.entries(r.ratings)) {
      const t = (ratingsTotals[comp] ??= { sum: 0, n: 0 });
      t.sum += val;
      t.n += 1;
    }
    if (r.narrative) {
      (narrativesByKind[r.kind] ??= []).push(r.narrative);
    }
  }

  const avgRatings: Record<string, number> = {};
  for (const [k, v] of Object.entries(ratingsTotals)) {
    avgRatings[k] = Math.round((v.sum / v.n) * 100) / 100;
  }

  // Optional Claude theme clustering.
  let themes:
    | {
        text: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        sourceCount: number;
      }
    | undefined;
  if (body.clusterThemes) {
    const allNarratives: string[] = [];
    for (const [kind, ns] of Object.entries(narrativesByKind)) {
      ns.forEach((n, i) => {
        allNarratives.push(`[${kind} reviewer ${i + 1}]: ${n}`);
      });
    }
    if (allNarratives.length === 0) {
      themes = {
        text: "(No submitted narratives to cluster.)",
        model: "",
        inputTokens: 0,
        outputTokens: 0,
        sourceCount: 0,
      };
    } else {
      try {
        const completion = await completeWithClaude({
          system:
            "You are an experienced people manager preparing a calibration write-up for a performance review. Read the peer/manager/self review narratives and cluster them into 3-6 distinct themes (e.g. 'Strong technical breadth', 'Communication gap with stakeholders', 'High ownership on incidents').\n\n" +
            "For each theme output:\n" +
            "- A short theme name as an H3 heading (### Theme name)\n" +
            "- One-line summary\n" +
            "- 2-3 short evidence quotes (in quotation marks). Quote verbatim from the narratives — never paraphrase.\n" +
            "- Number of reviewers who mentioned it (rough count, e.g. '4 of 7 reviewers')\n" +
            "- A one-line manager action recommendation\n\n" +
            "Order themes by frequency of mention. Be specific, never sycophantic. If feedback contradicts itself, name the contradiction explicitly.",
          messages: [
            {
              role: "user",
              content:
                `Reviewee: ${body.revieweeName ?? body.revieweeEmail}\n` +
                `Cycle: ${body.cycleId}\n` +
                `Submitted reviews: ${reviews.length}\n\n` +
                `Average ratings by competency: ${JSON.stringify(avgRatings)}\n\n` +
                `Narratives:\n\n${allNarratives.join("\n\n---\n\n")}`,
            },
          ],
          temperature: 0.4,
          maxTokens: 1800,
        });
        themes = {
          text: completion.text,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          sourceCount: allNarratives.length,
        };
      } catch (err) {
        themes = {
          text: `(Claude theme clustering unavailable: ${(err as Error).message})`,
          model: "",
          inputTokens: 0,
          outputTokens: 0,
          sourceCount: allNarratives.length,
        };
      }
    }
  }

  return new Response(
    JSON.stringify({
      revieweeEmail: body.revieweeEmail,
      cycleId: body.cycleId,
      reviewCount: reviews.length,
      byKind,
      avgRatingsByCompetency: avgRatings,
      narrativesByKind,
      themes,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
