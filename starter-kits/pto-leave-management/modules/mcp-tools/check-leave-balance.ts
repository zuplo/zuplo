import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  leaveBalanceRepository,
  type LeaveBalance,
} from "../repositories/leave-balances.ts";

/**
 * Orchestrator MCP tool: check_leave_balance.
 *
 * Reads the snapshot LeaveBalance rows for an employee and returns
 * available days by leave type. In production these balances are computed
 * from accruals + approved requests; this kit treats them as pre-computed
 * snapshots so the MCP tool returns the right shape without an accrual
 * engine. Replace this with your own accrual computation when forking.
 */

interface Body {
  employeeId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.employeeId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "employeeId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Production note: compute from accrual rules + approved leave requests.
  // For this starter kit we read from a snapshot repository.
  const page = await leaveBalanceRepository.list(tenantId, { limit: 200 });
  const balances = page.items.filter((b) => b.employeeId === body.employeeId);

  const byType: Record<string, { balanceDays: number; accruedYtd: number }> = {};
  for (const b of balances) {
    byType[b.type] = {
      balanceDays: b.balanceDays,
      accruedYtd: b.accruedYtd,
    };
  }

  return new Response(
    JSON.stringify({
      employeeId: body.employeeId,
      balances: byType,
      asOf: new Date().toISOString(),
      productionNote: "Snapshot-based. Real implementations compute balances from accrual policies + approved/pending leave.",
    }),
    { headers: { "content-type": "application/json" } },
  );
}
