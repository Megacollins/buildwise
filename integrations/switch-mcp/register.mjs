#!/usr/bin/env node
/**
 * Registers this connector with Claude Code at user level, so the Claude agent Switch runs
 * gets the Buildwise tools in every room. The key goes into Claude's MCP env config, never
 * into source code, and is never printed.
 *
 *   node register.mjs [BUILDWISE_URL]        (prompts for the key, input hidden)
 *   BUILDWISE_AGENT_KEY=bwk_… node register.mjs http://localhost:3210
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const url = (process.argv[2] ?? process.env.BUILDWISE_URL ?? "http://localhost:3210").replace(/\/$/, "");
const serverPath = fileURLToPath(new URL("./server.mjs", import.meta.url));

async function promptHidden(question) {
  if (!process.stdin.isTTY) {
    // Piped input: read the first line.
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) { rl.close(); return line.trim(); }
    return "";
  }
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  let value = "";
  for await (const chunk of process.stdin) {
    for (const ch of chunk.toString("utf8")) {
      if (ch === "\r" || ch === "\n") { process.stdin.setRawMode(false); process.stdout.write("\n"); process.stdin.pause(); return value.trim(); }
      if (ch === "\u0003") process.exit(130);
      if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1); else value += ch;
    }
  }
  return value.trim();
}

const key = process.env.BUILDWISE_AGENT_KEY || await promptHidden("Paste the Buildwise agent key (hidden): ");
if (!/^bwk_[A-Za-z0-9_-]{32}$/.test(key)) { console.error("That doesn't look like a Buildwise agent key (bwk_…)."); process.exit(1); }

// Check the key against Buildwise before saving it anywhere.
let project;
try {
  const res = await fetch(`${url}/api/agent/v1/project`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
  const data = await res.json();
  if (!res.ok) { console.error(`Buildwise rejected the key: ${data?.error?.message ?? res.status}`); process.exit(1); }
  project = data.project;
} catch (e) {
  console.error(`Couldn't reach Buildwise at ${url}: ${e.message}`);
  process.exit(1);
}

// On Windows `claude` is a .cmd shim, which needs a shell; quote arguments containing spaces for it.
const win = process.platform === "win32";
const q = (a) => (win && /\s/.test(a) ? `"${a}"` : a);
const claude = (args) => win
  ? spawnSync(["claude", ...args.map(q)].join(" "), { stdio: ["ignore", "pipe", "pipe"], shell: true, encoding: "utf8" })
  : spawnSync("claude", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
claude(["mcp", "remove", "buildwise", "--scope", "user"]); // replace an earlier registration, if any
const r = claude(["mcp", "add", "--scope", "user", "buildwise",
  "-e", `BUILDWISE_URL=${url}`, "-e", `BUILDWISE_AGENT_KEY=${key}`, "--", process.execPath, serverPath]);
if (r.status !== 0) { console.error("claude mcp add failed:", (r.stderr || r.stdout).replaceAll(key, "bwk_…")); process.exit(1); }
console.log(`Registered MCP server "buildwise" (user scope) for project "${project.name}" at ${url}.`);
console.log("Restart the agent's session in Switch so it picks up the new tools.");
