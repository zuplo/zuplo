import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Activity } from "../repositories/activities.ts";
import type { Contact } from "../repositories/contacts.ts";

interface Body {
  targetAccountId: string;
}

interface Page<T> { items: T[]; nextCursor: string | null; }

interface IntroPath {
  ownerEmail: string;
  alsoWorkedWithAccountId: string;
  contactCountAtTarget: number;
  contactCountAtOther: number;
  totalActivities: number;
}

/**
 * Orchestrator: find_warm_intro.
 *
 * Searches activities for owners who have touched both the target account
 * (via direct accountId or its contacts) and other accounts. Surfaces the
 * top owners by combined activity volume — a rep can ask any of them for
 * an intro.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  // Map contactId → accountId for cross-referencing activity contactIds
  const contactToAccount = new Map<string, string>();
  let cCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<Page<Contact>>(context, `/contacts?${qs}`, {
      headers: { authorization: auth },
    });
    for (const c of page.items) contactToAccount.set(c.id, c.accountId);
    cCursor = page.nextCursor;
  } while (cCursor);

  // Build per-owner counts: target account vs other accounts.
  const perOwner = new Map<
    string,
    { targetCount: number; otherCounts: Map<string, number> }
  >();

  let aCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (aCursor) qs.set("cursor", aCursor);
    const page = await invokeJson<Page<Activity>>(context, `/activities?${qs}`, {
      headers: { authorization: auth },
    });
    for (const a of page.items) {
      const accountId =
        a.accountId ?? (a.contactId ? contactToAccount.get(a.contactId) : null);
      if (!accountId) continue;
      const owner = a.ownerEmail;
      const bucket = perOwner.get(owner) ?? {
        targetCount: 0,
        otherCounts: new Map<string, number>(),
      };
      if (accountId === body.targetAccountId) bucket.targetCount += 1;
      else bucket.otherCounts.set(accountId, (bucket.otherCounts.get(accountId) ?? 0) + 1);
      perOwner.set(owner, bucket);
    }
    aCursor = page.nextCursor;
  } while (aCursor);

  const paths: IntroPath[] = [];
  for (const [owner, b] of perOwner) {
    if (b.targetCount === 0) continue;
    for (const [otherAccountId, count] of b.otherCounts) {
      paths.push({
        ownerEmail: owner,
        alsoWorkedWithAccountId: otherAccountId,
        contactCountAtTarget: b.targetCount,
        contactCountAtOther: count,
        totalActivities: b.targetCount + count,
      });
    }
  }
  paths.sort((a, b) => b.totalActivities - a.totalActivities);

  return new Response(
    JSON.stringify({
      targetAccountId: body.targetAccountId,
      count: paths.length,
      paths: paths.slice(0, 50),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
