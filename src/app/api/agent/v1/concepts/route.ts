import { agentRoute } from "@/server/agent/http";
import { previewConcepts } from "@/server/agent/service";

export const dynamic = "force-dynamic";

/** Generates design options for (partial) new requirements on this plot. Saves nothing. */
export const POST = agentRoute(({ ctx, body }) => previewConcepts(ctx, (body as { requirements?: unknown } | undefined)?.requirements));
