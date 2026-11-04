# Buildwise Construction Desk (on Switch)

A construction team works in a **Switch room** with a **Claude agent** that drives Buildwise:
it reads the design and cost, finds supported ways to change it, and proposes a change with a
genuine before/after quantity and cost comparison. **Nothing is saved until the project owner
approves it inside Buildwise**, and every decision stays on record as a change request and a
new design version.

Built for the WeMakeDevs *Flip the Switch* hackathon (Best Business Workflow).

## Why Switch is central

Without Switch there is no desk: the room is where the client, architect, QS and builder talk to
the agent together, where each tool call is put to a person as an **Allow / Decline** card, and
where the conversation that led to a decision lives. Switch creates the agent and room from one
template, restricts the agent to exactly seven Buildwise tools, and records every permission
answer.

## How it works

```
 Switch room (Mattermost)                Claude agent "Construction Desk"
 people ask @desk ─────────────────────▶ tools: 7 × mcp__buildwise__* only (no shell/files/web)
 Allow / Decline card per tool call ◀──  │
                                         ▼ stdio MCP (integrations/switch-mcp)
                                  Buildwise agent API  /api/agent/v1   (project-scoped key)
                                         │ same domain code as the app: building model,
                                         │ applyOp, cost engine, model check
                                         ▼
                             ChangeRequest (PENDING + comparison) ──▶ owner opens approval page
                                                                      in Buildwise, signed in
                             APPROVED ──▶ agent applies ──▶ new DesignVersion "Approved change: …"
```

**Two independent gates.** Switch's Allow card decides whether the agent may *call* a tool.
Buildwise decides whether a change may be *saved*: only the signed-in project owner can approve,
only while the change is PENDING, and only if the design hasn't moved since it was proposed. An
Allow click, or a chat message saying "approved", is never an approval.

**What the agent can do** (`integrations/switch-mcp/server.mjs`)

| Tool | Effect |
|---|---|
| `get_project` | Current design: rooms, quantities, estimate, model check, links |
| `preview_designs` | Three concepts for changed requirements on the same plot — saves nothing |
| `suggest_changes` | Plain-language request → supported operations with measured cost impact — saves nothing |
| `propose_change` | Validates a change and records it PENDING with the comparison; returns the approval link |
| `get_change` / `list_changes` | Status and decision record |
| `apply_approved_change` | Saves an APPROVED change as a new version; refused otherwise; safe to retry |

**Guarantees, tested** (`src/server/agent/agent.db.test.ts`, `npm run test:db`)

- Keys are hashed, revocable and scoped to one project; a key can't see or touch another project.
- Unsupported or invalid operations are refused and nothing is recorded.
- A change can't be applied before approval, after rejection, by a non-owner, or once stale.
- Repeated proposals (and retries with the same idempotency key) don't create duplicates.
- Two simultaneous applies create one version; a failed apply is recorded and changes nothing.
- The saved estimate is exactly the one the owner approved.

## Run it (Windows, macOS or Linux)

You need: **Node 20+**, **Docker Desktop** (for Switch's bundled Mattermost), **Switch Console**
(with its local server), and **Claude Code** signed in (`claude auth login`).

### 1. Buildwise

```bash
npm install
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev -- -p 3210
```

Leave the dev server running. To sign in locally, use **Sign in as the local demo user** on the sign-in page (the live site uses Sign in with Google).

### 2. The demo project, key and MCP connector

In a second terminal, in the repository:

```bash
npm --prefix integrations/switch-mcp install
npm run desk:demo -- http://localhost:3210
```

This creates a fresh project "Desk demo — …" at version 1 for the demo account, issues an agent
key for it, and registers the `buildwise` MCP server with Claude Code (user scope) — the key goes
straight into Claude's MCP config and is never printed. It prints the project name to use next.

*Using your own project instead:* open it in Buildwise → **Versions** → **Switch agent access** →
**Create key**, copy the key, then run `node integrations/switch-mcp/register.mjs http://localhost:3210`
and paste it when asked (input is hidden).

### 3. The Switch room

In Switch Console (opened from the Start menu / Applications, with Docker running):

1. **Templates → Import template → Choose file** →
   `integrations/switch-template/construction-desk.yaml` → **Import** → **Save**.
2. **Use template** → Project name: the name printed in step 2 → Messaging app: Mattermost →
   **Create agent and room**.
3. Open the room "*project* - Construction Desk".

If an earlier "Construction Desk" agent exists, delete it first (agent page → gear → trash icon):
agent names are unique. Give each new desk a room name you haven't used before — Mattermost
refuses a duplicate channel, Switch then links the desk to the old channel, and the `@desk` alias
isn't set up there (address it as `@construction-desk` instead).

### 4. The workflow

Post each message in the room; answer the cards as noted.

1. `@desk give me a short status of the project` → **Allow for this session** (`get_project` only reads).
2. `@desk we need to bring the cost down. What are our options?` → **Allow for this session** (`suggest_changes`).
3. `@desk propose option 2` → **Allow once** (`propose_change`). The agent posts the before/after
   table and the approval link.
4. `@desk apply it` → it checks the status, sees **PENDING** and does not apply.
5. Open the approval link, signed in as the owner → review → note → **Approve change**.
6. `@desk the owner approved it, apply it` → **Allow once** → a new version, labelled
   "Approved change: …", appears under **Versions**, with the approved estimate.

## Checks

```bash
npm test          # domain + comparison tests (no database)
npm run test:db   # agent API integration tests against the LOCAL dev database
npm run typecheck
npm run lint
npm --prefix integrations/switch-mcp run smoke   # needs BUILDWISE_URL and BUILDWISE_AGENT_KEY
```

## Known limits and Switch notes

- Prices are **sample data** and designs are **concept designs**; the agent says so.
- The MCP server is registered per machine (user scope), so one machine serves one desk project
  at a time — matching "one agent, one room per project". Re-run `desk:demo` or `register.mjs`
  to point it elsewhere.
- Switch Console 0.40 / server 0.31 on Windows: the template names `provider: claude` because the
  Console's provider picker can't offer providers on Windows; the template has no kickoff message
  because Allow cards can't thread under a template kickoff in Mattermost ("Invalid RootId"). If
  "Use template" reports a timeout, check **Your Agents / Your Rooms** before retrying — the run
  may have succeeded. Switch also adds a new agent to the workspace's standing channels (Town
  Square, Off-Topic); the agent key still limits it to this one project.
- The agent treats "apply only once APPROVED" as a hard rule and won't call
  `apply_approved_change` on a pending change even when asked to; Buildwise's own refusal is
  covered by `npm run test:db`.

## Where things are

| Path | What |
|---|---|
| `src/server/agent/` | Agent keys, service (propose / apply), HTTP wrapper |
| `src/app/api/agent/v1/` | Agent API routes |
| `src/server/changes.ts`, `src/app/app/projects/[id]/changes/` | Owner approval (server + page) |
| `src/domain/changes/compare.ts` | Before/after comparison (pure, tested) |
| `integrations/switch-mcp/` | MCP connector, `register.mjs`, `smoke.mjs` |
| `integrations/switch-template/construction-desk.yaml` | Switch template: one agent + one room |
| `scripts/desk-demo.ts` | Local demo reset |
