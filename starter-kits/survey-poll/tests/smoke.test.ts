import path from "node:path";
import { fileURLToPath } from "node:url";
import { runKitSmokeSuite } from "@zuplo/starter-kit-shared/testing";

const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runKitSmokeSuite(kitDir);
