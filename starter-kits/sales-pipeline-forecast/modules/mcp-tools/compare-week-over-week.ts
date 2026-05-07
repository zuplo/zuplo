import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { PipelineSnapshot } from "../repositories/pipeline-snapshots.ts";

interface Body {
  repEmail: string;
  weeks?: number;
}

interface SnapshotPage { items: PipelineSnapshot[]; nextCursor: string | null; }

/**
 * Orchestrator: compare_week_over_week.
 *
 * Diffs the latest two pipeline snapshots for a rep (or the latest pair
 * within `weeks` if specified). Returns deltas in pipeline, commit, and
 * upside.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const weeks = body.weeks ?? 2;

  const repSnaps: PipelineSnapshot[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<SnapshotPage>(context, `/pipeline-snapshots?${qs}`, {
      headers: { authorization: auth },
    });
    for (const s of page.items) {
      if (s.repEmail.toLowerCase() === body.repEmail.toLowerCase()) repSnaps.push(s);
    }
    cursor = page.nextCursor;
  } while (cursor);

  repSnaps.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));

  if (repSnaps.length < 2) {
    return new Response(
      JSON.stringify({
        repEmail: body.repEmail,
        weeks,
        haveEnoughSnapshots: false,
        snapshotsAvailable: repSnaps.length,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const latest = repSnaps[0];
  const cutoff = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
  const previous = repSnaps.slice(1).find((s) => s.takenAt <= cutoff) ?? repSnaps[1];

  const delta = {
    totalPipelineCents: latest.totalPipelineCents - previous.totalPipelineCents,
    totalCommitCents: latest.totalCommitCents - previous.totalCommitCents,
    totalUpsideCents: latest.totalUpsideCents - previous.totalUpsideCents,
    dealCount: latest.dealCount - previous.dealCount,
  };

  return new Response(
    JSON.stringify({
      repEmail: body.repEmail,
      weeks,
      haveEnoughSnapshots: true,
      latest,
      previous,
      delta,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
