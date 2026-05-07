import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { dealRepository } from "../repositories/deals.ts";
import { pipelineSnapshotRepository } from "../repositories/pipeline-snapshots.ts";

interface Body {
  repEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let totalPipeline = 0;
  let totalCommit = 0;
  let totalUpside = 0;
  let dealCount = 0;

  let cursor: string | null | undefined;
  do {
    const page = await dealRepository.list(tenantId, { limit: 200, cursor: cursor ?? undefined });
    for (const d of page.items) {
      if (d.ownerEmail.toLowerCase() !== body.repEmail.toLowerCase()) continue;
      if (d.stage === "closed_won" || d.stage === "closed_lost") continue;
      totalPipeline += d.amountCents;
      dealCount += 1;
      if (d.forecastCategory === "commit") totalCommit += d.amountCents;
      else if (d.forecastCategory === "upside") totalUpside += d.amountCents;
    }
    cursor = page.nextCursor;
  } while (cursor);

  const snapshot = await pipelineSnapshotRepository.create(tenantId, {
    repEmail: body.repEmail,
    takenAt: new Date().toISOString(),
    totalPipelineCents: totalPipeline,
    totalCommitCents: totalCommit,
    totalUpsideCents: totalUpside,
    dealCount,
  });

  return new Response(JSON.stringify(snapshot), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
