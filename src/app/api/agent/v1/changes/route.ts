import { agentRoute } from "@/server/agent/http";
import { listChanges, proposeChange } from "@/server/agent/service";

export const dynamic = "force-dynamic";

export const GET = agentRoute(({ ctx, base }) => listChanges(ctx, base));

/** Records a validated change as PENDING owner approval, with its before/after comparison. */
export const POST = agentRoute(({ ctx, base, body }) => proposeChange(ctx, base, body));
