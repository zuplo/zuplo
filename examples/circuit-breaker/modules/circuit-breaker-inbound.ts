import {
  ZuploContext,
  ZuploRequest,
  ZoneCache,
  HttpProblems,
} from "@zuplo/runtime";

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

export default async function circuitBreakerInbound(
  request: ZuploRequest,
  context: ZuploContext,
  options: CircuitBreakerOptions,
  policyName: string,
) {
  const cache = new ZoneCache<CircuitState>("circuit-breaker", context);
  const cacheKey = `cb:${options.backendId}`;

  const state = (await cache.get(cacheKey)) ?? { ...DEFAULT_STATE };

  if (state.state === "open") {
    const elapsed = Date.now() - state.lastFailure;

    if (elapsed < options.cooldownSeconds * 1000) {
      // Circuit is still open, reject the request
      context.log.warn(
        `Circuit open for backend '${options.backendId}'. ` +
          `${Math.ceil((options.cooldownSeconds * 1000 - elapsed) / 1000)}s until half-open.`,
      );

      return HttpProblems.serviceUnavailable(request, context, {
        detail: `Service temporarily unavailable. Retry after ${options.cooldownSeconds} seconds.`,
      });
    }

    // Cooldown expired, transition to half-open
    context.log.info(
      `Circuit transitioning to half-open for backend '${options.backendId}'.`,
    );
    state.state = "half-open";
    await cache.put(cacheKey, state, options.stateTtlSeconds ?? 300);
  }

  // Closed or half-open: allow the request through
  return request;
}