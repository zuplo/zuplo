import { RuntimeExtensions, OAuthProtectedResourcePlugin } from "@zuplo/runtime";

// For more information on runtime extensions see:
// https://zuplo.com/docs/articles/runtime-extensions

export function runtimeInit(runtime: RuntimeExtensions) {
  runtime.addPlugin(new OAuthProtectedResourcePlugin({
    authorizationServers: ["https://<YOUR_AUTH0_DOMAIN>"],
    resourceName: "OAuth MCP Demo"
  }));
}
