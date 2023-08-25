#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import shelljs from "shelljs";
import * as prettier from "prettier";

const rawPackage = await readFileSync("package.json", "utf8");
const packageJson = JSON.parse(rawPackage);

for (const dep in packageJson.dependencies) {
  if (dep.startsWith("@zuplo/")) {
    const { stdout } = shelljs.exec(`npm view ${dep} version`, {
      silent: true,
    });
    packageJson.dependencies[dep] = stdout.trim();
  }
}

writeFileSync(
  "package.json",
  await prettier.format(JSON.stringify(packageJson), { parser: "json" })
);
