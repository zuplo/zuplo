#!/usr/bin/env -S node --no-warnings
import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

/**
 * This is the content of the `x-zuplo-route` extension for the OpenAPI document
 * that will be added to each operation in the document.
 */
const zuploRouteConfig = {
  corsPolicy: "none",
  handler: {
    export: "urlForwardHandler",
    module: "$import(@zuplo/runtime)",
    options: {
      baseUrl: "https://echo.zuplo.io",
    },
  },
  policies: {
    inbound: ["rate-limit-inbound", "my-custom-policy"],
  },
};

/**
 * List of OpenAPI files that need to be updated.
 */
const openApiFiles = ["routes.oas.json"];

function updateOpenApiDocument(filePath) {
  const openApiData = JSON.parse(readFileSync(filePath, "utf8"));

  if (!openApiData.paths) {
    console.error("Invalid OpenAPI document: Missing paths");
    return;
  }

  for (const [path, methods] of Object.entries(openApiData.paths)) {
    for (const [method, methodData] of Object.entries(methods)) {
      if (typeof methodData === "object") {
        methodData["x-zuplo-route"] = zuploRouteConfig;
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(openApiData, null, 2), "utf8");
  console.log("Updated OpenAPI document successfully!");
}

openApiFiles.forEach((openApiFile) => {
  const filePath = resolve(join(process.cwd(), "config", openApiFile));
  updateOpenApiDocument(filePath);
});
