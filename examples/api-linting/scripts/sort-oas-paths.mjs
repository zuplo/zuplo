import fs from "fs/promises";
import path from "path";

// Sorts the paths in an open api file

const PATH_PARAM_REGEX = /{(\S+?)}/gm;

const files = await fs.readdir(path.join(process.cwd(), "config"));
await Promise.all(
  files.map(async (file) => {
    if (file.endsWith(".oas.json")) {
      const specPath = path.join(process.cwd(), "config", file);
      const spec = await fs.readFile(specPath, "utf-8").then(JSON.parse);

      let map = new Map();

      for (const [key, value] of Object.entries(spec.paths)) {
        map.set(key, value);
      }

      map = new Map([...map.entries()].sort());

      spec.paths = {};
      map.forEach((value, key) => {
        spec.paths[key] = value;
      });

      await fs.writeFile(specPath, JSON.stringify(spec, null, 2), "utf-8");
    }
  }),
);
