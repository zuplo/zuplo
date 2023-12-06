import fs from "fs/promises";
import path from "path";
import prettier from "prettier";

// Moves all common parameters to the components section

const files = await fs.readdir(path.join(process.cwd(), "config"));
await Promise.all(
  files.map(async (file) => {
    if (file.endsWith(".oas.json")) {
      const specPath = path.join(process.cwd(), "config", file);
      const content = await fs.readFile(specPath, "utf-8").then(JSON.parse);
      const commonParams = Object.keys(content?.components?.parameters ?? {});
      for (const [path, entry] of Object.entries(content.paths)) {
        for (const method of Object.keys(entry)) {
          if (method.startsWith("x-")) continue;
          const parameters = entry[method].parameters ?? [];
          for (const i in parameters) {
            if (commonParams.includes(parameters[i].name)) {
              parameters[i] = {
                $ref: `#/components/parameters/${parameters[i].name}`,
              };
            }
          }

          entry[method].parameters = parameters;
          if (parameters.length === 0) {
            delete entry[method].parameters;
          }
        }
      }

      const json = JSON.stringify(content, null, 2);
      const output = prettier.format(json, { parser: "json" });
      await fs.writeFile(specPath, output, "utf-8");
    }
  }),
);
