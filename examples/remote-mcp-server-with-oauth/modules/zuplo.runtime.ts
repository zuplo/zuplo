import { RuntimeExtensions, OAuthProtectedResourcePlugin } from "@zuplo/runtime";

// For more information on runtime extensions see:
// https://zuplo.com/docs/articles/runtime-extensions

export function runtimeInit(runtime: RuntimeExtensions) {
  runtime.addPlugin(new OAuthProtectedResourcePlugin({
    authorizationServers: ["dev-tc20cgixnv0klo8o.us.auth0.com"],
    resourceName: "OAuth MCP Demo"
  }));
}
