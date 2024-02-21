import esbuild from "esbuild";
import path from "path";
import packageJson from "./package.json" assert { type: "json" };

for (const dep of Object.keys(packageJson.dependencies)) {
  const entry = import.meta.resolve(dep);
  const url = new URL(entry);
  await esbuild.build({
    entryPoints: [url.pathname],
    bundle: true,
    platform: "neutral",
    target: "es2022",
    legalComments: "linked",
    keepNames: true,
    treeShaking: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    minifyWhitespace: false,
    platform: "browser",
    target: "es2022",
    format: "cjs",
    outfile: path.resolve("../modules/third-party", dep, "index.js"),
  });
}
