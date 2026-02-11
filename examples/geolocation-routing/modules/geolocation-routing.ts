import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

// Map countries to region names
const ROUTING_CONFIG: Record<string, string> = {
  // North America
  US: "americas",
  CA: "americas",
  MX: "americas",

  // Europe
  GB: "europe",
  FR: "europe",
  DE: "europe",
  IT: "europe",
  ES: "europe",
  NL: "europe",
  BE: "europe",
  AT: "europe",
  CH: "europe",
  PL: "europe",
  SE: "europe",
  NO: "europe",
  DK: "europe",
  FI: "europe",
  IE: "europe",
  PT: "europe",
  CZ: "europe",
  SK: "europe",
  HU: "europe",
  RO: "europe",
  BG: "europe",
  GR: "europe",
  HR: "europe",
  SI: "europe",
  LT: "europe",
  LV: "europe",
  EE: "europe",

  // Asia Pacific
  JP: "apac",
  KR: "apac",
  AU: "apac",
  NZ: "apac",
  SG: "apac",
  IN: "apac",
  HK: "apac",
  TW: "apac",
  TH: "apac",
  MY: "apac",
  ID: "apac",
  PH: "apac",
  VN: "apac",

  // Default fallback
  DEFAULT: "global",
};

// Map region names to environment variables (with fallback to echo for demo)
function getBackendUrl(region: string): string {
  switch (region) {
    case "americas":
      return environment.API_URL_AMERICAS ?? "https://echo.zuplo.io";
    case "europe":
      return environment.API_URL_EUROPE ?? "https://echo.zuplo.io";
    case "apac":
      return environment.API_URL_APAC ?? "https://echo.zuplo.io";
    default:
      return environment.API_URL_DEFAULT ?? "https://echo.zuplo.io";
  }
}

export default async function policy(
  request: ZuploRequest,
  context: ZuploContext,
) {
  // Check for test header to simulate different locations
  // In production, you may want to disable this or use a query parameter
  const testCountry = request.headers.get("X-Test-Country");
  let country: string;
  let isTestMode = false;

  if (testCountry) {
    country = testCountry.toUpperCase();
    isTestMode = true;
  } else {
    country = context.incomingRequestProperties.country ?? "DEFAULT";
  }

  // Look up region and backend URL
  const region = ROUTING_CONFIG[country] ?? ROUTING_CONFIG.DEFAULT;
  const backendUrl = getBackendUrl(region);

  // Set the backend URL for the handler
  context.custom.backendUrl = backendUrl;

  // Log the routing decision
  context.log.info("Geolocation routing decision", {
    country,
    region,
    backend: backendUrl,
    testMode: isTestMode,
  });

  // Create a new request with the routing headers added
  // (original request headers are immutable)
  const newRequest = new ZuploRequest(request);
  newRequest.headers.set("X-Routed-Region", region);
  newRequest.headers.set("X-Detected-Country", country);

  return newRequest;
}