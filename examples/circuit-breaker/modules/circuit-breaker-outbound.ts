import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
}

interface CircuitBreakerOptions {
  /** Number of failures before the circuit opens */
  failureThreshold: number;
  /** Seconds to wait before allowing test requests through */
  cooldownSeconds: number;
  /** Identifier for the backend being protected */
  backendId: string;
  /** Time-to-live for circuit state in cache (seconds) */
  stateTtlSeconds?: number;
}

const DEFAULT_STATE: CircuitState = {
  failures: 0,
  lastFailure: 0,
  state: "closed",
};

export default async function circuitBreakerOutbound(
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
  options: CircuitBreakerOptions,
  policyName: string,
) {
  const cache = new ZoneCache<CircuitState>("circuit-breaker", context);
  const cacheKey = `cb:${options.backendId}`;

  const state = (await cache.get(cacheKey)) ?? { ...DEFAULT_STATE };

  if (response.ok) {
    // Success: reset the circuit if it was half-open
    if (state.state === "half-open") {
      context.log.info(
        `Circuit closing for backend '${options.backendId}'. Test request succeeded.`,
      );
      state.state = "closed";
      state.failures = 0;
      state.lastFailure = 0;
      await cache.put(cacheKey, state, options.stateTtlSeconds ?? 300);
    }

    return response;
  }

  // Failure: increment the counter
  state.failures += 1;
  state.lastFailure = Date.now();

  context.log.warn(
    `Backend '${options.backendId}' returned ${response.status}. ` +
      `Failure count: ${state.failures}/${options.failureThreshold}.`,
  );

  // Check if we should trip the circuit
  if (state.failures >= options.failureThreshold) {
    context.log.error(
      `Circuit opening for backend '${options.backendId}'. ` +
        `Threshold of ${options.failureThreshold} failures reached.`,
    );
    state.state = "open";
  }

  await cache.put(cacheKey, state, options.stateTtlSeconds ?? 300);

  return response;
}