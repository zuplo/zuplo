import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runKitSmokeSuite,
  runKitFunctionalSuite,
} from "../modules/_shared/testing/index.ts";

const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runKitSmokeSuite(kitDir);
runKitFunctionalSuite(kitDir);
