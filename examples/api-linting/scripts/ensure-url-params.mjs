import fs from "fs/promises";
import path from "path";
import prettier from "prettier";

// Ensures that every parameter in a path is defined in the parameters section

const PATH_PARAM_REGEX = /{(\S+?)}/gm;

const files = await fs.readdir(path.join(process.cwd(), "config"));
await Promise.all(
  files.map(async (file) => {
    if (file.endsWith(".oas.json")) {
      const specPath = path.join(process.cwd(), "config", file);
      const content = await fs.readFile(specPath, "utf-8").then(JSON.parse);
      const newPaths = {};
      for (const [path, entry] of Object.entries(content.paths)) {
        const params = [];
        let m;
        do {
          // Convert OpenAPI style routes to path to regex
          // escapes RegEx characters and the : character
          m = PATH_PARAM_REGEX.exec(path);
          if (m) {
            params.push(m[1]);
          }
        } while (m);
        if (params.length > 0) {
          for (const method of Object.keys(entry)) {
            if (method.startsWith("x-")) continue;
            const parameters = entry[method].parameters ?? [];
            for (const param of params) {
              if (!parameters.find((p) => p.name === param)) {
                parameters.push({
                  name: param,
                  in: "path",
                  description: `The ${param} parameter`,
                  required: true,
                  schema: {
                    type: "string",
                  },
                });
              }
            }
            entry[method].parameters = parameters;
          }
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
