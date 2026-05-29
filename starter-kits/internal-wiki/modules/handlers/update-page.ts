import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { pageRepository } from "../repositories/pages.ts";
import { revisionRepository } from "../repositories/revisions.ts";

interface Body {
  title?: string;
  body?: string;
  parentPageId?: string | null;
  editorEmail: string;
}

/**
 * Updates a page and writes a revision row capturing the previous body.
 * The revision rows are the audit trail used by list_revisions.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const existing = await pageRepository.get(tenantId, id);
  if (!existing) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Page not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Snapshot the current body before mutating
  if (typeof body.body === "string" && body.body !== existing.body) {
    await revisionRepository.create(tenantId, {
      pageId: id,
      body: existing.body,
      savedBy: existing.lastEditedBy,
      savedAt: existing.lastEditedAt,
    });
  }

  try {
    const updated = await pageRepository.update(tenantId, id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.parentPageId !== undefined
        ? { parentPageId: body.parentPageId }
        : {}),
      lastEditedBy: body.editorEmail,
      lastEditedAt: now,
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({
          error: { type: "not_found", message: err.message },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
