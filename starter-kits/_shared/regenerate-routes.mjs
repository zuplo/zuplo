#!/usr/bin/env node
// Regenerate config/routes.oas.json for any starter kit whose routes are still
// the unmodified template (operationId "list_items" present). Reads existing
// modules/handlers/*.ts and modules/mcp-tools/*.ts and emits a routes.oas.json
// that wires each handler to a sensible HTTP method+path with snake_case
// operationIds, plus a /mcp route registering every operationId in the
// `operations: [...]` array (Zuplo's two-layer MCP opt-in, second layer).
//
// Usage:  node starter-kits/_shared/regenerate-routes.mjs <slug>...
//         node starter-kits/_shared/regenerate-routes.mjs --auto    (process all template-routes kits)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const KITS_DIR = path.join(ROOT, "starter-kits");

// Verb prefix → HTTP method + path-param needed
// Conservative defaults; everything else falls into POST /<verb-resource>.
const PREFIX_RULES = [
  { prefix: "list-",      method: "GET",    pathSuffix: "",          destructive: false, readOnly: true,  needsParam: false },
  { prefix: "get-",       method: "GET",    pathSuffix: "/{id}",     destructive: false, readOnly: true,  needsParam: true  },
  { prefix: "create-",    method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "register-",  method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "update-",    method: "PATCH",  pathSuffix: "/{id}",     destructive: false, readOnly: false, needsParam: true  },
  { prefix: "set-",       method: "PATCH",  pathSuffix: "/{id}",     destructive: false, readOnly: false, needsParam: true  },
  { prefix: "delete-",    method: "DELETE", pathSuffix: "/{id}",     destructive: true,  readOnly: false, needsParam: true  },
  { prefix: "remove-",    method: "DELETE", pathSuffix: "/{id}",     destructive: true,  readOnly: false, needsParam: true  },
  { prefix: "void-",      method: "POST",   pathSuffix: "/{id}/void",destructive: true,  readOnly: false, needsParam: true  },
  { prefix: "cancel-",    method: "POST",   pathSuffix: "/{id}/cancel", destructive: true, readOnly: false, needsParam: true },
  { prefix: "archive-",   method: "POST",   pathSuffix: "/{id}/archive", destructive: true, readOnly: false, needsParam: true },
  { prefix: "retire-",    method: "POST",   pathSuffix: "/{id}/retire", destructive: true, readOnly: false, needsParam: true },
  { prefix: "close-",     method: "POST",   pathSuffix: "/{id}/close", destructive: false, readOnly: false, needsParam: true },
  { prefix: "approve-",   method: "POST",   pathSuffix: "/{id}/approve", destructive: false, readOnly: false, needsParam: true },
  { prefix: "reject-",    method: "POST",   pathSuffix: "/{id}/reject", destructive: false, readOnly: false, needsParam: true },
  { prefix: "submit-",    method: "POST",   pathSuffix: "/{id}/submit", destructive: false, readOnly: false, needsParam: true },
  { prefix: "complete-",  method: "POST",   pathSuffix: "/{id}/complete", destructive: false, readOnly: false, needsParam: true },
  { prefix: "publish-",   method: "POST",   pathSuffix: "/{id}/publish", destructive: false, readOnly: false, needsParam: true },
  { prefix: "schedule-",  method: "POST",   pathSuffix: "/{id}/schedule", destructive: false, readOnly: false, needsParam: true },
  { prefix: "pause-",     method: "POST",   pathSuffix: "/{id}/pause", destructive: false, readOnly: false, needsParam: true },
  { prefix: "resume-",    method: "POST",   pathSuffix: "/{id}/resume", destructive: false, readOnly: false, needsParam: true },
  { prefix: "start-",     method: "POST",   pathSuffix: "/{id}/start", destructive: false, readOnly: false, needsParam: true },
  { prefix: "assign-",    method: "POST",   pathSuffix: "/{id}/assign", destructive: false, readOnly: false, needsParam: true },
  { prefix: "open-",      method: "POST",   pathSuffix: "/{id}/open", destructive: false, readOnly: false, needsParam: true },
  { prefix: "reopen-",    method: "POST",   pathSuffix: "/{id}/reopen", destructive: false, readOnly: false, needsParam: true },
  { prefix: "freeze-",    method: "POST",   pathSuffix: "/{id}/freeze", destructive: false, readOnly: false, needsParam: true },
  { prefix: "unfreeze-",  method: "POST",   pathSuffix: "/{id}/unfreeze", destructive: false, readOnly: false, needsParam: true },
  { prefix: "withdraw-",  method: "POST",   pathSuffix: "/{id}/withdraw", destructive: true, readOnly: false, needsParam: true },
  { prefix: "send-",      method: "POST",   pathSuffix: "/{id}/send", destructive: false, readOnly: false, needsParam: true },
  { prefix: "verify-",    method: "POST",   pathSuffix: "/{id}/verify", destructive: false, readOnly: false, needsParam: true },
  { prefix: "log-",       method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "record-",    method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "add-",       method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "ingest-",    method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "search-",    method: "GET",    pathSuffix: "/search",   destructive: false, readOnly: true,  needsParam: false },
  { prefix: "compute-",   method: "POST",   pathSuffix: "/{id}/compute", destructive: false, readOnly: false, needsParam: true },
  { prefix: "calculate-", method: "POST",   pathSuffix: "/calculate", destructive: false, readOnly: false, needsParam: false },
  { prefix: "match-",     method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "subscribe",  method: "POST",   pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
  { prefix: "unsubscribe", method: "POST",  pathSuffix: "",          destructive: false, readOnly: false, needsParam: false },
];

function snake(s) {
  return s.replace(/-/g, "_");
}

// Normalize the resource portion: handler `list-cycles.ts` → resource `cycles`
function deriveResource(remainder) {
  // remainder is everything after the verb prefix, kebab-case
  return remainder;
}

function classifyHandler(filename) {
  const base = filename.replace(/\.ts$/, "");
  for (const rule of PREFIX_RULES) {
    if (base.startsWith(rule.prefix)) {
      const rest = base.slice(rule.prefix.length); // e.g. "cycles", "review-status"
      if (!rest) continue;
      const resource = deriveResource(rest);
      const operationId = snake(rule.prefix.replace(/-$/, "") + "_" + rest);
      let pathStr;
      if (rule.pathSuffix === "") {
        pathStr = "/" + resource;
      } else if (rule.pathSuffix === "/search") {
        pathStr = "/" + resource + "/search";
      } else {
        // `/{id}` or `/{id}/<verb>` — the resource needs to come first
        pathStr = "/" + resource + rule.pathSuffix;
      }
      return {
        operationId,
        method: rule.method,
        path: pathStr,
        destructive: rule.destructive,
        readOnly: rule.readOnly,
        needsParam: rule.needsParam,
        kind: "handler",
        modulePath: `$import(./modules/handlers/${base})`,
      };
    }
  }
  // Fallback: POST /<verb-resource> with operationId snake_case
  return {
    operationId: snake(base),
    method: "POST",
    path: "/" + base,
    destructive: false,
    readOnly: false,
    needsParam: false,
    kind: "handler",
    modulePath: `$import(./modules/handlers/${base})`,
  };
}

function classifyOrchestrator(filename) {
  const base = filename.replace(/\.ts$/, "");
  return {
    operationId: snake(base),
    method: "POST",
    path: "/" + base,
    destructive: false,
    readOnly: false,
    needsParam: false,
    kind: "orchestrator",
    modulePath: `$import(./modules/mcp-tools/${base})`,
  };
}

function buildRoutes(kit, ops) {
  const paths = {};
  for (const op of ops) {
    paths[op.path] ||= {};
    const operationObj = {
      operationId: op.operationId,
      summary: humanize(op.operationId),
      description: humanize(op.operationId) + ".",
    };
    if (op.needsParam) {
      operationObj.parameters = [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Resource id.",
          schema: { type: "string" },
        },
      ];
    }
    if (op.method === "POST" || op.method === "PATCH") {
      operationObj.requestBody = {
        required: false,
        content: {
          "application/json": {
            schema: { type: "object", description: "Operation payload — see handler for schema." },
          },
        },
      };
    }
    operationObj.responses = {
      "200": {
        description: "OK",
        content: {
          "application/json": { schema: { type: "object" } },
        },
      },
    };
    if (op.method === "DELETE") {
      operationObj.responses = {
        "204": { description: "Deleted." },
        "404": { description: "Not found in this tenant." },
      };
    }
    operationObj["x-zuplo-route"] = {
      corsPolicy: "anything-goes",
      handler: { export: "default", module: op.modulePath },
      policies: { inbound: ["api-key-inbound", "rate-limit"] },
      mcp: {
        type: "tool",
        annotations: op.readOnly
          ? { readOnlyHint: true }
          : op.destructive
            ? { destructiveHint: true }
            : { readOnlyHint: false },
      },
    };
    paths[op.path][op.method.toLowerCase()] = operationObj;
  }

  // /mcp route
  paths["/mcp"] = {
    post: {
      operationId: "mcp_handler",
      summary: "MCP server endpoint",
      "x-zuplo-route": {
        corsPolicy: "anything-goes",
        handler: {
          export: "mcpServerHandler",
          module: "$import(@zuplo/runtime)",
          options: {
            name: kit + "-server",
            version: "1.0.0",
            operations: ops.map((op) => ({
              file: "./config/routes.oas.json",
              id: op.operationId,
            })),
          },
        },
        policies: {
          inbound: ["api-key-inbound", "rate-limit"],
          outbound: ["prompt-injection-outbound", "secret-masking-outbound"],
        },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: humanize(kit) + " API",
      version: "1.0.0",
      description: `Zuplo Starter Kit: ${humanize(kit)}. Multi-tenant via API-key metadata. MCP server at POST /mcp.`,
    },
    paths,
  };
}

function humanize(s) {
  return s
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function isTemplateRoutes(routesPath) {
  let content;
  try {
    content = fs.readFileSync(routesPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return true;
    throw err;
  }
  return content.includes('"list_items"');
}

function processKit(slug) {
  const kitDir = path.join(KITS_DIR, slug);
  const handlersDir = path.join(kitDir, "modules/handlers");
  const orchestratorsDir = path.join(kitDir, "modules/mcp-tools");
  const routesPath = path.join(kitDir, "config/routes.oas.json");

  if (!fs.existsSync(kitDir)) {
    console.error(`SKIP ${slug}: directory not found`);
    return;
  }

  const handlers = fs.existsSync(handlersDir)
    ? fs.readdirSync(handlersDir).filter((f) => f.endsWith(".ts"))
    : [];
  const orchestrators = fs.existsSync(orchestratorsDir)
    ? fs.readdirSync(orchestratorsDir).filter((f) => f.endsWith(".ts"))
    : [];

  if (handlers.length === 0 && orchestrators.length === 0) {
    console.error(`SKIP ${slug}: no handlers or orchestrators found`);
    return;
  }

  const ops = [];
  for (const h of handlers) ops.push(classifyHandler(h));
  for (const o of orchestrators) ops.push(classifyOrchestrator(o));

  // Make sure operationIds are unique (rare collisions from path overlap)
  const seen = new Map();
  for (const op of ops) {
    if (seen.has(op.operationId)) {
      console.error(`WARN ${slug}: duplicate operationId ${op.operationId}`);
    }
    seen.set(op.operationId, op);
  }

  // Detect colliding (path, method) pairs and append a suffix
  const seenPaths = new Map();
  for (const op of ops) {
    const key = op.method + " " + op.path;
    if (seenPaths.has(key)) {
      const old = seenPaths.get(key);
      console.error(`WARN ${slug}: path collision ${key} (${old.operationId} vs ${op.operationId}); renaming second to /${op.operationId.replace(/_/g, "-")}`);
      op.path = "/" + op.operationId.replace(/_/g, "-");
      op.needsParam = false;
      op.method = op.method === "GET" ? "POST" : op.method;
    } else {
      seenPaths.set(key, op);
    }
  }

  const oas = buildRoutes(slug, ops);
  fs.mkdirSync(path.dirname(routesPath), { recursive: true });
  fs.writeFileSync(routesPath, JSON.stringify(oas, null, 2) + "\n");
  console.log(`OK ${slug}: ${handlers.length} handlers + ${orchestrators.length} orchestrators → ${ops.length} ops`);
}

function findTemplateKits() {
  const out = [];
  for (const entry of fs.readdirSync(KITS_DIR)) {
    if (entry.startsWith("_")) continue;
    const kitDir = path.join(KITS_DIR, entry);
    if (!fs.statSync(kitDir).isDirectory()) continue;
    const routesPath = path.join(kitDir, "config/routes.oas.json");
    if (isTemplateRoutes(routesPath)) out.push(entry);
  }
  return out;
}

const args = process.argv.slice(2);
let targets;
if (args[0] === "--auto") {
  targets = findTemplateKits();
  console.log(`Auto-discovered ${targets.length} kits with template routes: ${targets.join(", ")}`);
} else {
  targets = args;
}

for (const slug of targets) processKit(slug);
