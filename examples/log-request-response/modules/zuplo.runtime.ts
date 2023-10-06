import { RuntimeExtensions } from "@zuplo/runtime";

export function runtimeInit(runtime: RuntimeExtensions) {
  // Register your logging plugin
  // https://zuplo.com/docs/articles/log-plugins

  runtime.addResponseSendingFinalHook(async (response, request, context) => {
    // Get the request headers
    const requestHeaders: Record<string, string> = {};
    for (const [name, value] of request.headers) {
      // Filter out any headers you shouldn't log
      if (name !== "authorization") {
        requestHeaders[name] = value;
      }
    }

    // Get the request body
    let requestBody: string | undefined | null;
    try {
      requestBody = request.body ? await request.clone().text() : null;
    } catch (err) {
      // Ignore
    }

    // Get the response headers
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of response.headers) {
      requestHeaders[name] = value;
    }

    // Get the response body
    let responseBody: string | undefined | null;
    try {
      responseBody = response.body ? await response.clone().text() : null;
    } catch (err) {
      // Ignore
    }

    const entry = {
      // Request Info
      requestHeaders,
      requestUrl: request.url,
      route: context.route.pathPattern,
      requestBody,

      // Response Info
      responseStatus: response.status,
      responseHeaders,
      responseBody,
    };

    context.log.info(entry);
  });
}
