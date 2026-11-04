#!/usr/bin/env node
/**
 * Buildwise Construction Desk — MCP connector for a Switch agent.
 *
 * A thin stdio bridge to the Buildwise agent API (/api/agent/v1). It holds no logic of its
 * own: every number comes from Buildwise's building model and cost engine, and Buildwise
 * decides what is allowed. The key is scoped to ONE project and can propose changes, but
 * only the project owner can approve them, inside Buildwise.
 *
 * Configuration (environment, never source code):
 *   BUILDWISE_URL        e.g. http://localhost:3210
 *   BUILDWISE_AGENT_KEY  bwk_… key created on the project's Versions page
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.BUILDWISE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.BUILDWISE_AGENT_KEY ?? "";
const TIMEOUT_MS = 60_000;

async function call(method, path, body) {
  if (!BASE || !/^https?:\/\//.test(BASE)) return fail("BUILDWISE_URL is not configured for this connector.");
  if (!KEY) return fail("BUILDWISE_AGENT_KEY is not configured for this connector.");
  let res;
  try {
    res = await fetch(`${BASE}/api/agent/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return fail(`Couldn't reach Buildwise at ${BASE} (${e.name === "TimeoutError" ? "timed out" : e.message}).`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { return fail(`Buildwise returned an unexpected response (HTTP ${res.status}).`); }
  if (!res.ok) return fail(`Buildwise refused (HTTP ${res.status}, ${data?.error?.code ?? "error"}): ${data?.error?.message ?? "no details"}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
const fail = (message) => ({ isError: true, content: [{ type: "text", text: message }] });

const RequirementsPatch = z.object({
  bedrooms: z.number().int().min(1).max(8).optional(),
  bathrooms: z.number().int().min(1).max(8).optional(),
  floors: z.number().int().min(1).max(3).optional(),
  parking: z.number().int().min(0).max(4).optional(),
  garage: z.boolean().optional(), office: z.boolean().optional(), laundry: z.boolean().optional(),
  storage: z.boolean().optional(), guestRoomDownstairs: z.boolean().optional(), familyLounge: z.boolean().optional(),
  separateDining: z.boolean().optional(), balcony: z.boolean().optional(), outdoorSpace: z.boolean().optional(),
  pool: z.boolean().optional(), majlis: z.boolean().optional(), staffRooms: z.number().int().min(0).max(2).optional(),
  carport: z.boolean().optional(), style: z.string().max(40).optional(), notes: z.string().max(2000).optional(),
}).describe("Only the requirements that change; everything else stays as the project has it.");

const OP_HELP = `One Buildwise model operation (validated by Buildwise; unsupported ones are refused). Supported kinds:
- {kind:"selection", category, materialId}  swap one material (ids come from suggest_changes)
- {kind:"selections", selections:{category: materialId}}
- {kind:"resizeRoom", roomId, axis:"width"|"depth", delta}  mm, -3000..3000 (room ids from get_project)
- {kind:"renameRoom", roomId, name} · {kind:"removeRoom", roomId}
- {kind:"moveWall", levelId, wallId, delta} · {kind:"scale", factor 0.7..1.3}
- {kind:"roof", type:"flat"|"gable"|"hip"} · {kind:"glazing", factor 0.5..1.8}
- {kind:"pool", size:"none"|"small"|"medium"|"large"}
- {kind:"projection", group, depth} · {kind:"levelDepth", group, level, depth}
Prefer ops returned by suggest_changes.`;

const server = new McpServer(
  { name: "buildwise", version: "0.1.0" },
  {
    instructions:
      "Buildwise Construction Desk for one project. Read with get_project; explore with suggest_changes and preview_designs. " +
      "propose_change records a change for the project OWNER to approve in Buildwise and returns an approvalUrl — post that link and the cost difference. " +
      "Never claim a change is saved until apply_approved_change succeeds, and only call it after the owner says they approved it. " +
      "Report numbers exactly as Buildwise returns them.",
  },
);

server.registerTool("get_project", {
  title: "Get project",
  description: "Current design of this Buildwise project: rooms, quantities, cost estimate, model check and links.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, () => call("GET", "/project"));

server.registerTool("preview_designs", {
  title: "Preview design options",
  description: "Generates three design concepts for changed requirements on this project's plot, with real floor area and cost. Saves nothing.",
  inputSchema: { requirements: RequirementsPatch },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, ({ requirements }) => call("POST", "/concepts", { requirements }));

server.registerTool("suggest_changes", {
  title: "Suggest changes",
  description: "Turns a plain-language request (e.g. 'cut cost', 'bigger master bedroom', 'hip roof') into supported operations with their measured cost impact. Saves nothing.",
  inputSchema: { text: z.string().min(1).max(1000).describe("The request, in plain language") },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, ({ text }) => call("POST", "/suggestions", { text }));

server.registerTool("propose_change", {
  title: "Propose change for owner approval",
  description: "Validates a change against the current design and records it as PENDING owner approval, with the before/after quantity and cost comparison. " +
    "Give exactly one of op or design. Returns approvalUrl for the owner. Does NOT change the design.",
  inputSchema: {
    op: z.record(z.string(), z.unknown()).optional().describe(OP_HELP),
    design: z.object({ requirements: RequirementsPatch.optional(), conceptKey: z.enum(["A", "B", "C"]) }).optional()
      .describe("Replace the design with a concept from preview_designs (same requirements + conceptKey)."),
    requestText: z.string().max(2000).optional().describe("What the person in the room asked for, for the decision record"),
    roomRef: z.string().max(120).optional().describe("The Switch room this came from"),
    idempotencyKey: z.string().min(8).max(100).optional().describe("Reuse when retrying the same proposal so it isn't recorded twice"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, (args) => call("POST", "/changes", args));

server.registerTool("get_change", {
  title: "Get change request",
  description: "Status (PENDING, APPROVED, REJECTED, APPLIED, STALE, FAILED), decision note and full comparison of one change request.",
  inputSchema: { changeId: z.string().min(1).max(40) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, ({ changeId }) => call("GET", `/changes/${encodeURIComponent(changeId)}`));

server.registerTool("list_changes", {
  title: "List change requests",
  description: "The project's 10 most recent change requests with status and cost difference — the decision record.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, () => call("GET", "/changes"));

server.registerTool("apply_approved_change", {
  title: "Apply approved change",
  description: "Saves an owner-APPROVED change as a new design version. Buildwise refuses it unless the owner approved it in Buildwise and the design hasn't changed since. Safe to retry.",
  inputSchema: { changeId: z.string().min(1).max(40) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, ({ changeId }) => call("POST", `/changes/${encodeURIComponent(changeId)}/apply`));

await server.connect(new StdioServerTransport());
