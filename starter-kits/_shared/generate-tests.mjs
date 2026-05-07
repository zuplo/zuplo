#!/usr/bin/env node
// Generate tests/smoke.test.ts + vitest.config.ts for every kit. Idempotent —
// re-running rewrites the files exactly. Adds vitest as a devDependency on
// each kit's package.json (uses "*" for workspace-hoisted resolution).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KITS_DIR = path.join(ROOT, "starter-kits");

const SMOKE_TEST = `import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runKitSmokeSuite,
  runKitFunctionalSuite,
} from "@zuplo/starter-kit-shared/testing";

const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runKitSmokeSuite(kitDir);
runKitFunctionalSuite(kitDir);
`;

const VITEST_CONFIG = `export { default } from "@zuplo/starter-kit-shared/testing/vitest.config";
`;

const kits = fs
  .readdirSync(KITS_DIR)
  .filter((d) => !d.startsWith("_") && fs.statSync(path.join(KITS_DIR, d)).isDirectory());

let written = 0;
for (const kit of kits) {
  const kitDir = path.join(KITS_DIR, kit);
  const testsDir = path.join(kitDir, "tests");
  const smokePath = path.join(testsDir, "smoke.test.ts");
  const vitestPath = path.join(kitDir, "vitest.config.ts");
  const pkgPath = path.join(kitDir, "package.json");

  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(smokePath, SMOKE_TEST);
  fs.writeFileSync(vitestPath, VITEST_CONFIG);

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.devDependencies = pkg.devDependencies ?? {};
  if (!pkg.devDependencies.vitest) pkg.devDependencies.vitest = "^2";
  pkg.scripts = pkg.scripts ?? {};
  if (!pkg.scripts.test) pkg.scripts.test = "vitest run";
  if (!pkg.scripts["test:watch"]) pkg.scripts["test:watch"] = "vitest";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  written++;
}
console.log(`Wrote smoke tests + vitest.config for ${written} kits.`);
