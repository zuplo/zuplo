import fs from "fs/promises";
import kebabCase from "kebab-case";
import path from "path";
import prettier from "prettier";

// Converts all params to kebab-case

const PATH_PARAM_REGEX = /{(\S+?)}/gm;

const files = await fs.readdir(path.join(process.cwd(), "config"));
await Promise.all(
  files.map(async (file) => {
    if (file.endsWith(".oas.json")) {
      const specPath = path.join(process.cwd(), "config", file);
      const content = await fs.readFile(specPath, "utf-8").then(JSON.parse);
      const newPaths = {};
      for (const [path, entry] of Object.entries(content.paths)) {
        let newPath = path;
        let m;
        do {
          // Convert OpenAPI style routes to path to regex
          // escapes RegEx characters and the : character
          m = PATH_PARAM_REGEX.exec(path);
          if (m) {
            newPath = newPath.replace(m[1], kebabCase(m[1]));
          }
        } while (m);
        for (const method of Object.keys(entry)) {
          if (method.startsWith("x-")) continue;
          const parameters = entry[method].parameters ?? [];
          for (const i in parameters) {
            parameters[i].name = kebabCase(parameters[i].name);
          }
          entry[method].parameters = parameters;
        }
        newPaths[newPath] = entry;
      }

      content.paths = newPaths;

      const json = JSON.stringify(content, null, 2);
      const output = prettier.format(json, { parser: "json" });
      await fs.writeFile(specPath, output, "utf-8");
    }
  }),
);
