import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { reactionRepository, type Reaction } from "../repositories/reactions.ts";
import { postRepository } from "../repositories/posts.ts";

interface Body {
  postId: string;
  memberEmail: string;
  kind: Reaction["kind"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await reactionRepository.create(tenantId, {
    postId: body.postId,
    memberEmail: body.memberEmail,
    kind: body.kind,
    createdAt: now,
  });

  // Bump the post's like counter on a "like" reaction. Other kinds roll
  // up later in the helpful-members orchestrator.
  if (body.kind === "like") {
    try {
      const post = await postRepository.get(tenantId, body.postId);
      if (post) {
        await postRepository.update(tenantId, body.postId, {
          likeCount: post.likeCount + 1,
        });
      }
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
