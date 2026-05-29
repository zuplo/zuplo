import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { postRepository } from "../repositories/posts.ts";
import { topicRepository } from "../repositories/topics.ts";

interface Body {
  topicId: string;
  body: string;
  authorEmail: string;
  parentPostId?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await postRepository.create(tenantId, {
    topicId: body.topicId,
    body: body.body,
    authorEmail: body.authorEmail,
    parentPostId: body.parentPostId ?? null,
    postedAt: now,
    editedAt: null,
    deletedAt: null,
    likeCount: 0,
  });

  // Best-effort: bump parent topic counters and last-reply tracking. The
  // post is the source of truth — if the topic is missing we still return
  // the created post.
  try {
    const topic = await topicRepository.get(tenantId, body.topicId);
    if (topic) {
      await topicRepository.update(tenantId, body.topicId, {
        postCount: topic.postCount + 1,
        replyCount: topic.replyCount + 1,
        lastReplyAt: now,
        lastReplyBy: body.authorEmail,
      });
    }
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
