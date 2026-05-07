#!/usr/bin/env node
// Regenerate per-kit README.md and CLAUDE.md for any kit whose docs still
// match the canonical _template scaffolding. Pulls metadata from
// starter-kits.json + the kit's routes.oas.json so the docs always match
// what's actually wired up.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KITS_DIR = path.join(ROOT, "starter-kits");
const GALLERY = JSON.parse(fs.readFileSync(path.join(KITS_DIR, "starter-kits.json"), "utf8"));

const ALL_ADAPTER_LABELS = {
  "in-memory": "In-Memory (tests/local)",
  "supabase": "Supabase (PostgREST)",
  "firestore": "Firestore (REST)",
  "clickhouse": "ClickHouse (HTTP)",
  "upstash-redis": "Upstash Redis (REST)",
  "neon": "Neon (HTTP serverless)",
};

function isStaleClaude(content) {
  return content.includes("`Item` example entity");
}

function isStaleReadme(content) {
  return content.includes("Canonical Zuplo Starter Kit");
}

function buildRoutesTable(oas) {
  const rows = [];
  for (const [p, methods] of Object.entries(oas.paths || {})) {
    for (const [m, op] of Object.entries(methods)) {
      if (p === "/mcp") continue;
      const opId = op.operationId;
      const summary = op.summary || op.description || opId;
      const route = op["x-zuplo-route"];
      const isMcp = route && route.mcp && (route.mcp.type === "tool" || route.mcp.type === "prompt" || route.mcp.type === "resource");
      const tag = isMcp ? "tool" : "—";
      rows.push({ method: m.toUpperCase(), path: p, operationId: opId, summary, mcp: tag });
    }
  }
  rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  rows.push({ method: "POST", path: "/mcp", operationId: "mcp_handler", summary: "MCP server endpoint", mcp: "—" });
  return rows;
}

function readme(kit, oas) {
  const rows = buildRoutesTable(oas);
  const adaptersTable = kit.adapters
    .map((a) => `| \`${a}\` | ${ALL_ADAPTER_LABELS[a] ?? a} |`)
    .join("\n");

  const tools = kit.mcpTools.map((t) => `\`${t}\``).join(", ");

  return `# ${kit.title}

${kit.description}

**Replaces:** ${kit.replaces.join(", ")}.
**SEO target:** "${kit.seoQuery}".

## Quickstart

\`\`\`bash
npx create-zuplo-api@latest --example starter-kits/${kit.slug}
cd ${kit.slug}
cp env.example .env
npm install
npm run dev
\`\`\`

The gateway boots at \`http://localhost:9000\`. To explore the MCP server:

\`\`\`bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
\`\`\`

## Choosing a database

This kit ships with HTTP-only adapters (the kits run in Zuplo's edge runtime — no TCP drivers). Set \`DB_PROVIDER\` in \`.env\` to one of:

| \`DB_PROVIDER\` | Adapter |
|---|---|
${adaptersTable}

\`in-memory\` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
${rows.map((r) => `| ${r.method} | \`${r.path}\` | \`${r.operationId}\` | ${r.summary} | ${r.mcp} |`).join("\n")}

OpenAPI: [\`config/routes.oas.json\`](./config/routes.oas.json).

## MCP tools

${kit.mcpTools.length} tools registered: ${tools}.

Both layers of Zuplo's MCP wiring agree:
- Per-route \`mcp: { type: "tool" }\` annotations on each operation in \`config/routes.oas.json\`
- The \`/mcp\` route's \`options.operations: [...]\` array lists every \`operationId\` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through \`context.invokeRoute()\` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (\`triage_x\`, \`summarize_x\`, \`flag_x\`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits \`api-key-inbound\` + \`rate-limit\` policies, and the \`/mcp\` route adds \`prompt-injection-outbound\` + \`secret-masking-outbound\` defenses for AI traffic.

## Extending

- **New entity:** add a repository in \`modules/repositories/\` (follow the factory pattern keyed by \`DB_PROVIDER\`).
- **New endpoint:** add a handler in \`modules/handlers/\`, append the route to \`config/routes.oas.json\` with \`mcp: { type: "tool" }\`, and add the \`operationId\` to the \`/mcp\` route's \`options.operations: [...]\` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in \`modules/mcp-tools/\` that uses \`invokeJson\` from \`@zuplo/starter-kit-shared/mcp\` to compose existing endpoints. Pass the inbound \`authorization\` header through so the inner calls re-run policies.
- **Switch databases:** change \`DB_PROVIDER\` in \`.env\` — the handlers don't change.
`;
}

function claude(kit, oas) {
  const rows = buildRoutesTable(oas);
  const tools = kit.mcpTools.map((t) => `- \`${t}\``).join("\n");
  return `# ${kit.title}

${kit.description}

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
${rows.map((r) => `| ${r.method} | \`${r.path}\` | \`${r.operationId}\` | ${r.mcp} |`).join("\n")}

## MCP tools

${kit.mcpTools.length} tools across both layers (per-route \`mcp: { type: "tool" }\` annotations and the \`/mcp\` route's \`operations: [...]\` array):

${tools}

## Verifying the kit

\`\`\`bash
cp env.example .env
npm install
npm run dev
\`\`\`

In another terminal, connect an MCP inspector to \`http://localhost:9000/mcp\`. The tool list should match the ${kit.mcpTools.length} entries above.

## Replaces

${kit.replaces.map((r) => `- ${r}`).join("\n")}
`;
}

const targets = process.argv.slice(2);
const kits = targets.length === 0 ? GALLERY.starterKits.map((k) => k.slug) : targets;

let regen = 0;
for (const slug of kits) {
  const kitDir = path.join(KITS_DIR, slug);
  const claudePath = path.join(kitDir, "CLAUDE.md");
  const readmePath = path.join(kitDir, "README.md");
  const routesPath = path.join(kitDir, "config/routes.oas.json");
  if (!fs.existsSync(routesPath)) {
    console.error(`SKIP ${slug}: no routes.oas.json`);
    continue;
  }
  const kitMeta = GALLERY.starterKits.find((k) => k.slug === slug);
  if (!kitMeta) {
    console.error(`SKIP ${slug}: not in starter-kits.json`);
    continue;
  }
  const oas = JSON.parse(fs.readFileSync(routesPath, "utf8"));

  const claudeStale = !fs.existsSync(claudePath) || isStaleClaude(fs.readFileSync(claudePath, "utf8"));
  const readmeStale = !fs.existsSync(readmePath) || isStaleReadme(fs.readFileSync(readmePath, "utf8"));

  if (claudeStale) {
    fs.writeFileSync(claudePath, claude(kitMeta, oas));
    console.log(`OK ${slug}: CLAUDE.md regenerated`);
    regen++;
  }
  if (readmeStale) {
    fs.writeFileSync(readmePath, readme(kitMeta, oas));
    console.log(`OK ${slug}: README.md regenerated`);
    regen++;
  }
  if (!claudeStale && !readmeStale) {
    // console.log(`OK ${slug}: docs already custom`);
  }
}
console.log(`\nRegenerated ${regen} doc files.`);
