import { ZuploContext } from "@zuplo/runtime";
import { randomUUID } from "crypto";

export const context: ZuploContext = {
  requestId: randomUUID(),
  log: {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    log: console.log,
  },
  route: {
    operationId: "my-mock-operation",
    raw: <T>() => ({} as T),
    path: "/my/path",
    methods: ["GET"],
    handler: {
      module: "@zuplo/runtime",
      export: "default",
    },
    version: "none",
  },
  custom: {},
  incomingRequestProperties: {
    asn: 12345,
    asOrganization: "Example, Inc.",
    city: "Seattle",
    colo: "SEA",
    continent: "NA",
    country: "US",
    latitude: "123",
    longitude: "456",
    metroCode: "12355",
    postalCode: "12345",
    region: "Washington",
    regionCode: "WA",
    timezone: "EST",
  },
  invokeInboundPolicy: async (policyName, request) => {
    return new Response("OK");
  },
  waitUntil: (promise: Promise<any>) => {},
  addResponseSendingFinalHook: (hook) => {},
  addEventListener: (type, handler, options) => {},
  removeEventListener: (type, handler, options) => {},
  dispatchEvent: (event) => true,
};

export class ContextData<T = any> {
  static #storage: WeakMap<ZuploContext, Map<string, any>> | undefined;

  #name: string;

  constructor(name: string) {
    this.#name = name;
  }

  set(context: ZuploContext, data: T) {
    ContextData.set(context, this.#name, data);
  }

  get(context: ZuploContext): T | undefined {
    return ContextData.get(context, this.#name);
  }

  static set<T = any>(context: ZuploContext, name: string, data: T) {
    if (!ContextData.#storage) {
      ContextData.#storage = new WeakMap();
    }
    let map = ContextData.#storage.get(context);
    if (!map) {
      map = new Map<string, any>();
    }
    map.set(name, data);
    ContextData.#storage.set(context, map);
  }

  static get<T = any>(context: ZuploContext, name: string): T | undefined {
    if (!ContextData.#storage) {
      ContextData.#storage = new WeakMap();
    }
    return ContextData.#storage.get(context)?.get(name) as T | undefined;
  }
}
