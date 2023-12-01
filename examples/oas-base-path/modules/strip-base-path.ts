import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { servers as servers1 } from "../config/routes1.oas.json";
import { servers as servers2 } from "../config/routes2.oas.json";

const servers = [...servers1, ...servers2];

/**
 * This policy reads the servers property from the imported OpenAPI files and
 * uses the data to remove the base path from a url and set the configured URL
 * to the context.custom.serverUrl
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const url = new URL(request.url);
  const basePath = `/${url.pathname.split("/")[1]}`;

  const server = servers.find((s) => s["x-base-path"] === basePath);
  if (!server) {
    throw new Error("Could not locate server on OpenAPI file");
  }
  context.custom.serverUrl = server.url;

  const newUrl = new URL(url);
  newUrl.pathname = url.pathname.replace(basePath, "");
  context.log.info(newUrl);
  return new ZuploRequest(newUrl.toString(), request);
}
