import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import OpenAI from "./third-party/openai";

export default async function echo(
  request: ZuploRequest,
  context: ZuploContext
) {
  const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
  });
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: "Say this is a test" }],
    model: "gpt-3.5-turbo",
  });

  context.log.info(chatCompletion);

  return new Response("Hello");
}
