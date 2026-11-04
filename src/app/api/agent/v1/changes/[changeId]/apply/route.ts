import { agentRoute } from "@/server/agent/http";
import { applyChange } from "@/server/agent/service";

export const dynamic = "force-dynamic";

/** Applies a change the project owner approved in Buildwise. Refuses anything else. */
export const POST = agentRoute<{ changeId: string }>(({ ctx, base, params }) => applyChange(ctx, base, params.changeId));
