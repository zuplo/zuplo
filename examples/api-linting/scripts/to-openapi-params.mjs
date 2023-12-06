import fs from "fs/promises";
import path from "path";
import { pathToRegexp } from "path-to-regexp";
import prettier from "prettier";

// Coverts path to regex url params to OpenAPI style params

const files = await fs.readdir(path.join(process.cwd(), "config"));
await Promise.all(
  files.map(async (file) => {
    if (file.endsWith(".oas.json")) {
      const specPath = path.join(process.cwd(), "config", file);
      const content = await fs.readFile(specPath, "utf-8").then(JSON.parse);
      const newPaths = {};
      Object.entries(content.paths).forEach(([path, entry]) => {
        delete entry["x-zuplo-path"];
        const keys = [];
        pathToRegexp(path, keys);
        let newPath = path;
        keys.forEach((key) => {
          newPath = newPath.replace(`:${key.name}`, `{${key.name}}`);
        });
        Object.entries(entry).forEach(([method, methodEntry]) => {
          if (entry[method].parameters) {
            entry[method].parameters.forEach((param) => {
              if (param.in === "path") {
                param.name = param.name;
              }
            });
          }
        });
        newPaths[newPath] = entry;
      });

      content.paths = newPaths;

      const json = JSON.stringify(content, null, 2);
      const output = prettier.format(json, { parser: "json" });

      await fs.writeFile(specPath, output, "utf-8");
    }
  })
);
