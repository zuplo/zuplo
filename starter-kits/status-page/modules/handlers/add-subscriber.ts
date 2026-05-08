import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  subscriberRepository,
  type Subscriber,
} from "../repositories/subscribers.ts";

interface Body {
  email: string;
  phone?: string | null;
  slackWebhookUrl?: string | null;
  channels?: Subscriber["channels"];
  components?: string[];
  notifyOnImpact?: Subscriber["notifyOnImpact"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  // Default to email-only when no channels specified, but ensure the chosen
  // channels are actually deliverable to (e.g. sms requires phone).
  const channels: Subscriber["channels"] =
    body.channels && body.channels.length > 0 ? body.channels : ["email"];
  if (channels.includes("sms") && !body.phone) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "phone is required when channels includes 'sms'" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (channels.includes("slack") && !body.slackWebhookUrl) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "slackWebhookUrl is required when channels includes 'slack'",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const created = await subscriberRepository.create(tenantId, {
    email: body.email,
    phone: body.phone ?? null,
    slackWebhookUrl: body.slackWebhookUrl ?? null,
    channels,
    components: body.components ?? [],
    notifyOnImpact: body.notifyOnImpact ?? "minor",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
