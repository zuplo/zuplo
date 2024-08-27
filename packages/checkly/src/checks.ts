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
   * Constructs the API Check instance. If not provided, an id will be
   * generated from the group and check name.
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs/#apicheck Read more in the docs}
   */
  logicalId?: string;
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
  // If we have a group, use the group base url. The group needs to deal with
  // the environment variable replacement.
  const url = options.group
    ? `{{GROUP_BASE_URL}}${parsedUrl.pathname}`
    : `{{ENVIRONMENT_URL}}${parsedUrl.pathname}`;
  const queryParameters: { key: string; value: string }[] = Array.from(
    parsedUrl.searchParams.entries(),
  ).map(([key, value]) => ({ key, value }));

  const id = opts.name
    .toLocaleLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^a-zA-Z0-9-]/g, "");
  const logicalId = options.group ? `${opts.group.logicalId}-${id}` : id;

  return new ApiCheck(logicalId, {
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
