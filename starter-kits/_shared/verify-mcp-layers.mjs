#!/usr/bin/env node
// Verify the two-layer MCP wiring: every operationId tagged `mcp: { type: "tool" }`
// (etc.) on a route must appear in the /mcp handler's `operations: [...]` array,
// and vice versa. Walks every kit under starter-kits/ except `_*` directories.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KITS_DIR = path.join(ROOT, "starter-kits");

const kits = fs
  .readdirSync(KITS_DIR)
  .filter((d) => !d.startsWith("_") && !d.endsWith(".md") && !d.endsWith(".json") && !d.endsWith(".mjs"))
  .filter((d) => fs.statSync(path.join(KITS_DIR, d)).isDirectory());

let allOk = true;
for (const kit of kits) {
  const routesPath = path.join(KITS_DIR, kit, "config/routes.oas.json");
  if (!fs.existsSync(routesPath)) {
    console.log(`SKIP ${kit}: no routes.oas.json`);
    continue;
  }
  const oas = JSON.parse(fs.readFileSync(routesPath, "utf8"));
  const annotated = new Set();
  const registered = new Set();
  for (const [_p, methods] of Object.entries(oas.paths || {})) {
    for (const [_m, op] of Object.entries(methods)) {
      const route = op["x-zuplo-route"];
      if (!route) continue;
      const mcp = route.mcp;
      if (mcp && (mcp.type === "tool" || mcp.type === "prompt" || mcp.type === "resource")) {
        annotated.add(op.operationId);
      }
      const ops = route.handler && route.handler.options && route.handler.options.operations;
      if (ops) {
        for (const r of ops) registered.add(r.id);
      }
    }
  }
  const annotatedNotReg = [...annotated].filter((x) => !registered.has(x));
  const regNotAnnotated = [...registered].filter((x) => !annotated.has(x));
  const ok = annotatedNotReg.length === 0 && regNotAnnotated.length === 0;
  if (!ok) {
    allOk = false;
    console.log(
      `MISMATCH ${kit}: ` +
        (annotatedNotReg.length ? `annotated_not_registered=[${annotatedNotReg.join(", ")}] ` : "") +
        (regNotAnnotated.length ? `registered_not_annotated=[${regNotAnnotated.join(", ")}]` : ""),
    );
  } else {
    console.log(`OK ${kit}: ${annotated.size} tools (both layers agree)`);
  }
}
process.exit(allOk ? 0 : 1);
