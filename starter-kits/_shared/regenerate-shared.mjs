#!/usr/bin/env node
// Vendor starter-kits/_shared/* into each kit's modules/_shared/ and rewrite
// `@zuplo/starter-kit-shared/...` imports to relative paths pointing at the
// vendored copies. Also drops `@zuplo/starter-kit-shared` from each kit's
// package.json deps. Idempotent: re-running matches the current state.
//
// Run after editing anything under starter-kits/_shared/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KITS_DIR = path.join(ROOT, "starter-kits");
const SHARED_DIR = path.join(KITS_DIR, "_shared");

// Map subpath specifier -> vendored file (relative to <kit>/modules/_shared/)
const SUBPATH_TO_FILE = {
  "mcp": "mcp/helpers.ts",
  "adapters": "adapters/index.ts",
  "auth": "auth/index.ts",
  "testing": "testing/index.ts",
  "testing/vitest.config": "testing/vitest.config.ts",
};

// Map subpath specifier -> source dirs to vendor (relative to _shared/)
const SUBPATH_TO_VENDOR_DIRS = {
  "mcp": ["mcp"],
  "adapters": ["adapters"],
  "auth": ["auth"],
  "testing": ["testing"],
  "testing/vitest.config": ["testing"],
};

const PACKAGE_NAME = "@zuplo/starter-kit-shared";
const IMPORT_RE = /@zuplo\/starter-kit-shared\/([a-zA-Z0-9._/-]+)/g;
const REWRITE_RE = /(["'])@zuplo\/starter-kit-shared\/([a-zA-Z0-9._/-]+)(["'])/g;
// Match relative imports of vendored files that already exist in a kit. Used
// so re-running the script doesn't wipe vendored dirs once the migration is done.
const VENDORED_IMPORT_RE = /(?:["'])(?:\.\.?\/)+(?:[^"']*\/)?_shared\/(mcp|adapters|auth|testing)\/[^"']+(?:["'])/g;

function listKitDirs() {
  return fs
    .readdirSync(KITS_DIR)
    .filter((d) => {
      if (d === "_shared") return false;
      const full = path.join(KITS_DIR, d);
      return fs.statSync(full).isDirectory();
    })
    .map((d) => path.join(KITS_DIR, d));
}

function walkKitTsFiles(kitDir) {
  const files = [];
  const vendoredRoot = path.join(kitDir, "modules", "_shared");
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".zuplo" || entry.name === "dist") continue;
        if (full === vendoredRoot) continue;
        walk(full);
      } else if (entry.isFile() && /\.ts$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  walk(kitDir);
  return files;
}

function findUsedSubpaths(kitFiles) {
  const used = new Set();
  for (const file of kitFiles) {
    const src = fs.readFileSync(file, "utf8");
    let m;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      used.add(m[1]);
    }
    // Also detect existing relative imports into a vendored _shared/<sub>/.
    // The captured group is the top-level vendor dir (mcp/adapters/auth/testing).
    let v;
    while ((v = VENDORED_IMPORT_RE.exec(src)) !== null) {
      // Map vendor dir back to the canonical subpath specifier.
      // testing/vitest.config is the only multi-segment one — preserve it
      // by inspecting the matched string for the file name.
      const dir = v[1];
      const segment = v[0];
      if (dir === "testing" && segment.includes("vitest.config")) {
        used.add("testing/vitest.config");
      } else {
        used.add(dir);
      }
    }
  }
  return used;
}

function copyVendorDirs(usedSubpaths, kitDir) {
  const vendorRoot = path.join(kitDir, "modules", "_shared");
  const dirs = new Set();
  for (const sub of usedSubpaths) {
    const vendorDirs = SUBPATH_TO_VENDOR_DIRS[sub];
    if (!vendorDirs) {
      throw new Error(`Unknown ${PACKAGE_NAME} subpath ${sub} in ${kitDir}`);
    }
    for (const d of vendorDirs) dirs.add(d);
  }
  if (fs.existsSync(vendorRoot)) {
    fs.rmSync(vendorRoot, { recursive: true, force: true });
  }
  if (dirs.size === 0) return;
  fs.mkdirSync(vendorRoot, { recursive: true });
  for (const d of dirs) {
    const src = path.join(SHARED_DIR, d);
    const dst = path.join(vendorRoot, d);
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      // Test files run from _shared/ in the monorepo; don't ship them into kits.
      if (/\.test\.ts$/.test(entry.name)) continue;
      fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name));
    }
  }
}

function rewriteImports(kitDir, kitFiles) {
  const vendorRoot = path.join(kitDir, "modules", "_shared");
  let changed = 0;
  for (const file of kitFiles) {
    const orig = fs.readFileSync(file, "utf8");
    if (!orig.includes(`${PACKAGE_NAME}/`)) continue;
    const fileDir = path.dirname(file);
    const rewritten = orig.replace(REWRITE_RE, (_match, q1, sub, q2) => {
      const targetRel = SUBPATH_TO_FILE[sub];
      if (!targetRel) {
        throw new Error(`Unknown ${PACKAGE_NAME} subpath '${sub}' in ${file}`);
      }
      const targetAbs = path.join(vendorRoot, targetRel);
      let rel = path.relative(fileDir, targetAbs).split(path.sep).join("/");
      if (!rel.startsWith(".")) rel = "./" + rel;
      return `${q1}${rel}${q2}`;
    });
    if (rewritten !== orig) {
      fs.writeFileSync(file, rewritten);
      changed++;
    }
  }
  return changed;
}

function dropPackageDep(kitDir) {
  const pkgPath = path.join(kitDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  let mutated = false;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (pkg[field] && PACKAGE_NAME in pkg[field]) {
      delete pkg[field][PACKAGE_NAME];
      mutated = true;
    }
  }
  if (mutated) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
  return mutated;
}

const kits = listKitDirs();
let totalRewrites = 0;
let totalDepDrops = 0;
let totalVendored = 0;
for (const kitDir of kits) {
  const kitFiles = walkKitTsFiles(kitDir);
  const used = findUsedSubpaths(kitFiles);
  copyVendorDirs(used, kitDir);
  if (used.size > 0) totalVendored++;
  totalRewrites += rewriteImports(kitDir, kitFiles);
  if (dropPackageDep(kitDir)) totalDepDrops++;
}
console.log(
  `Vendored modules/_shared in ${totalVendored}/${kits.length} kits, ` +
    `rewrote imports in ${totalRewrites} files, ` +
    `dropped ${PACKAGE_NAME} dep from ${totalDepDrops} package.json files.`,
);
