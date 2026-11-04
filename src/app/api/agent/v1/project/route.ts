import { agentRoute } from "@/server/agent/http";
import { projectSummary } from "@/server/agent/service";

export const dynamic = "force-dynamic";

/** The key's project: current design, quantities, estimate and links. */
export const GET = agentRoute(({ ctx, base }) => projectSummary(ctx, base));
