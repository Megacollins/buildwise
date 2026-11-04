/**
 * Smoke test: starts the connector over stdio like Claude/Switch does, lists its tools and
 * makes read-only calls. Needs BUILDWISE_URL and BUILDWISE_AGENT_KEY in the environment.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "buildwise-smoke", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL("./server.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], env: { ...process.env } }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const text = (r) => r.content.map((c) => c.text).join("");
const project = await client.callTool({ name: "get_project", arguments: {} });
if (project.isError) throw new Error(text(project));
const p = JSON.parse(text(project));
console.log("get_project:", p.project.name, "· v" + p.currentVersion.number, "·", p.estimate.currency, p.estimate.expected);

const bad = await client.callTool({ name: "propose_change", arguments: { op: { kind: "teleport" } } });
console.log("propose_change (unsupported op) → isError:", bad.isError === true, "·", text(bad).slice(0, 80));

const notApproved = await client.callTool({ name: "apply_approved_change", arguments: { changeId: "does-not-exist" } });
console.log("apply_approved_change (unknown id) → isError:", notApproved.isError === true, "·", text(notApproved).slice(0, 80));

await client.close();
