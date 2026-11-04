import { agentRoute } from "@/server/agent/http";
import { AgentError, suggestChanges } from "@/server/agent/service";

export const dynamic = "force-dynamic";

/** Interprets a plain-language request into supported operations with their cost impact. Saves nothing. */
export const POST = agentRoute(({ ctx, body }) => {
  const text = (body as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string" || !text.trim()) throw new AgentError(400, "invalid_request", "Provide the request as { text }.");
  return suggestChanges(ctx, text);
});
