import {
  ApiCheck,
  ApiCheckProps,
  Assertion,
  AssertionBuilder,
  HttpRequestMethod,
} from "checkly/constructs";

export interface ApiCheckRequest extends Omit<RequestInit, "body"> {
  /**
   * The relative URL to make the request to.
   */
  url: string;

  /**
   * The body of the request.
   */
  body?: string;
}

export interface ApiCheckOptions extends Omit<ApiCheckProps, "request"> {
  /**
   *  Determines the request that the check is going to run.
   */
  request: ApiCheckRequest;
  /**
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions?: Assertion[];
}

export function check(options: ApiCheckOptions) {
  const { request, assertions, ...opts } = options;

  if (!request.url.startsWith("/")) {
    throw new Error("URL must be relative and start with a '/' character.");
  }

  const headers: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    headers.push({ key, value });
  }

  const parsedUrl = new URL(request.url, "https://example.com");
  // The {{ENVIRONMENT_URL}} value is is a magic checkly string that is replaced
  // by the environment variable when the CLI runs the tests.
  const url = `{{ENVIRONMENT_URL}}${parsedUrl.pathname}`;
  const queryParameters: { key: string; value: string }[] = Array.from(
    parsedUrl.searchParams.entries(),
  ).map(([key, value]) => ({ key, value }));

  return new ApiCheck(opts.name.toLowerCase().replaceAll(" ", "-"), {
    ...opts,
    request: {
      url: url,
      queryParameters,
      method: (request.method ?? "GET") as HttpRequestMethod,
      headers,
      body: request.body,
      assertions,
    },
  });
}

export const asserts = () => AssertionBuilder;
