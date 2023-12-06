import fs from "fs/promises";
import path from "path";
import prettier from "prettier";

// Ensures that each operation has an operationId

const files = await fs.readdir(path.join(process.cwd(), "config"));
await Promise.all(
  files.map(async (file) => {
    if (file.endsWith(".oas.json")) {
      const specPath = path.join(process.cwd(), "config", file);
      const content = await fs.readFile(specPath, "utf-8").then(JSON.parse);
      const newPaths = {};
      for (const [path, entry] of Object.entries(content.paths)) {
        for (const method of Object.keys(entry)) {
          if (method.startsWith("x-")) continue;
          entry[method].operationId =
            entry[method].operationId ?? `${method}${path.replace(/\//g, "-")}`;
        }
        newPaths[path] = entry;
      }

      content.paths = newPaths;

      const json = JSON.stringify(content, null, 2);
      const output = prettier.format(json, { parser: "json" });

      await fs.writeFile(specPath, output, "utf-8");
    }
  }),
);
