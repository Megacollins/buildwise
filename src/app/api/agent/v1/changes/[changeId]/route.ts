import { agentRoute } from "@/server/agent/http";
import { getChange } from "@/server/agent/service";

export const dynamic = "force-dynamic";

export const GET = agentRoute<{ changeId: string }>(({ ctx, base, params }) => getChange(ctx, base, params.changeId));
