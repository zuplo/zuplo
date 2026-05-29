import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Generic per-kit smoke suite. A kit's `tests/smoke.test.ts` calls this with
 * the kit's directory and gets:
 *
 *   - Verifies `config/routes.oas.json` is valid JSON and has the expected shape
 *   - Verifies the two-layer MCP wiring agrees (route annotations vs `/mcp` operations)
 *   - Imports every handler and orchestrator module to catch import-time errors
 *   - Verifies each module exports a `default` function
 *   - Verifies `package.json` references `@zuplo/starter-kit-shared`
 *
 * No per-kit boilerplate beyond `runKitSmokeSuite(import.meta.dirname)`.
 */

interface SmokeOptions {
  /** Skip handler import. Useful in CI without dependencies installed. */
  skipImport?: boolean;
}

interface OasOperation {
  operationId?: string;
  "x-zuplo-route"?: {
    handler?: {
      module?: string;
      export?: string;
      options?: { operations?: { id: string; file?: string }[] };
    };
    mcp?: { type?: string };
  };
}

export function runKitSmokeSuite(kitDir: string, options: SmokeOptions = {}): void {
  const kitName = path.basename(kitDir);
  const routesPath = path.join(kitDir, "config/routes.oas.json");
  const policiesPath = path.join(kitDir, "config/policies.json");
  const packagePath = path.join(kitDir, "package.json");

  describe(`${kitName} smoke`, () => {
    it("has config/routes.oas.json", () => {
      expect(fs.existsSync(routesPath), `expected ${routesPath} to exist`).toBe(true);
    });

    it("has config/policies.json", () => {
      expect(fs.existsSync(policiesPath), `expected ${policiesPath} to exist`).toBe(true);
    });

    it("has package.json wired to @zuplo/starter-kit-shared", () => {
      expect(fs.existsSync(packagePath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      expect(pkg.dependencies?.["@zuplo/starter-kit-shared"]).toBeDefined();
    });

    it("routes.oas.json is valid JSON with paths", () => {
      const oas = JSON.parse(fs.readFileSync(routesPath, "utf8"));
      expect(oas.paths).toBeDefined();
      expect(typeof oas.paths).toBe("object");
    });

    const oas = fs.existsSync(routesPath)
      ? JSON.parse(fs.readFileSync(routesPath, "utf8"))
      : { paths: {} };
    const handlers = collectHandlers(oas);
    const { annotated, registered } = collectMcpLayers(oas);

    it("two-layer MCP wiring agrees", () => {
      const annotatedNotReg = [...annotated].filter((x) => !registered.has(x));
      const regNotAnnotated = [...registered].filter((x) => !annotated.has(x));
      expect(
        annotatedNotReg,
        `operations annotated but not registered in /mcp: ${annotatedNotReg.join(", ")}`,
      ).toEqual([]);
      expect(
        regNotAnnotated,
        `operations registered in /mcp but missing annotation: ${regNotAnnotated.join(", ")}`,
      ).toEqual([]);
    });

    it("each MCP-tool operation has a non-empty description", () => {
      const missing: string[] = [];
      for (const [, methods] of Object.entries(oas.paths ?? {})) {
        for (const [, op] of Object.entries(methods as Record<string, OasOperation>)) {
          const route = op["x-zuplo-route"];
          if (!route?.mcp) continue;
          if (!(op as { description?: string }).description?.trim()) {
            missing.push(op.operationId ?? "(no id)");
          }
        }
      }
      expect(
        missing,
        `operations missing description (LLMs ground on these): ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it("each MCP-tool operationId is snake_case action verb", () => {
      const bad: string[] = [];
      for (const op of annotated) {
        if (!/^[a-z][a-z0-9_]*$/.test(op)) bad.push(op);
      }
      expect(bad, `operationIds must be snake_case: ${bad.join(", ")}`).toEqual([]);
    });

    it(`all ${handlers.size} handler modules can be imported`, async () => {
      if (options.skipImport) return;
      const failures: { module: string; error: string }[] = [];
      for (const handlerModule of handlers) {
        try {
          await importHandler(kitDir, handlerModule);
        } catch (err) {
          failures.push({
            module: handlerModule,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      expect(
        failures,
        `handler modules failed to import:\n${failures.map((f) => `  ${f.module}: ${f.error}`).join("\n")}`,
      ).toEqual([]);
    });

    it("each handler exports a default function", async () => {
      if (options.skipImport) return;
      const bad: { module: string; reason: string }[] = [];
      for (const handlerModule of handlers) {
        try {
          const mod = await importHandler(kitDir, handlerModule);
          const handler = (mod as { default?: unknown }).default;
          if (typeof handler !== "function") {
            bad.push({ module: handlerModule, reason: `default export is ${typeof handler}` });
          }
        } catch {
          // import failure already reported above
        }
      }
      expect(bad).toEqual([]);
    });
  });
}

function collectHandlers(oas: { paths?: Record<string, Record<string, OasOperation>> }): Set<string> {
  const handlers = new Set<string>();
  for (const [, methods] of Object.entries(oas.paths ?? {})) {
    for (const [, op] of Object.entries(methods)) {
      const route = op["x-zuplo-route"];
      const mod = route?.handler?.module;
      if (typeof mod === "string" && mod.startsWith("$import(")) {
        const inner = mod.slice("$import(".length, -1);
        if (inner.startsWith("./")) handlers.add(inner);
      }
    }
  }
  return handlers;
}

function collectMcpLayers(oas: { paths?: Record<string, Record<string, OasOperation>> }): {
  annotated: Set<string>;
  registered: Set<string>;
} {
  const annotated = new Set<string>();
  const registered = new Set<string>();
  for (const [, methods] of Object.entries(oas.paths ?? {})) {
    for (const [, op] of Object.entries(methods)) {
      const route = op["x-zuplo-route"];
      if (!route) continue;
      if (route.mcp?.type === "tool" || route.mcp?.type === "prompt" || route.mcp?.type === "resource") {
        if (op.operationId) annotated.add(op.operationId);
      }
      const ops = route.handler?.options?.operations;
      if (ops) for (const r of ops) registered.add(r.id);
    }
  }
  return { annotated, registered };
}

async function importHandler(kitDir: string, modulePath: string): Promise<Record<string, unknown>> {
  const candidates = [
    path.join(kitDir, modulePath + ".ts"),
    path.join(kitDir, modulePath + ".js"),
    path.join(kitDir, modulePath, "index.ts"),
    path.join(kitDir, modulePath, "index.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(candidate) as Promise<Record<string, unknown>>;
    }
  }
  throw new Error(`module file not found for ${modulePath} (tried .ts/.js)`);
}
