import { environment } from "@zuplo/runtime";

/**
 * ShipEngine integration.
 *
 * Used by the e-commerce kit's `pick_carrier_for_destination` orchestrator
 * to rate-shop across carriers, and by `create_shipment` to purchase a
 * real label. ShipEngine returns a label PDF/PNG URL plus a tracking
 * number — both of which we stash on the Shipment row so customer SMS
 * messages can include a tracking link.
 *
 * Docs: https://www.shipengine.com/docs/
 */

const SHIPENGINE_API = "https://api.shipengine.com/v1";

function authHeaders(): Record<string, string> {
  const apiKey = environment.SHIPENGINE_API_KEY;
  if (!apiKey) throw new Error("SHIPENGINE_API_KEY is not set");
  return {
    "api-key": apiKey,
    "content-type": "application/json",
  };
}

export interface Address {
  name: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  cityLocality: string;
  stateProvince: string;
  postalCode: string;
  countryCode: string;
}

export interface Parcel {
  weightOz: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
}

export interface ShipEngineRateRequest {
  shipFrom: Address;
  shipTo: Address;
  parcel: Parcel;
  carrierIds?: string[];
}

export interface ShipEngineRate {
  rate_id: string;
  carrier_id: string;
  carrier_friendly_name: string;
  service_type: string;
  service_code: string;
  shipping_amount: { amount: number; currency: string };
  estimated_delivery_date: string | null;
  delivery_days: number | null;
  trackable: boolean;
}

export interface ShipEngineRateResponse {
  rate_response: {
    rates: ShipEngineRate[];
    invalid_rates: Array<{ error_messages?: string[]; service_type?: string }>;
    rate_request_id: string;
    shipment_id: string;
    created_at: string;
    status: string;
  };
}

/**
 * Rate-shop a shipment across configured carriers.
 */
export async function getShipEngineRates(
  req: ShipEngineRateRequest,
): Promise<ShipEngineRate[]> {
  const body = {
    rate_options: {
      carrier_ids: req.carrierIds ?? [],
    },
    shipment: {
      ship_to: addressToShipEngine(req.shipTo),
      ship_from: addressToShipEngine(req.shipFrom),
      packages: [parcelToShipEngine(req.parcel)],
    },
  };

  const res = await fetch(`${SHIPENGINE_API}/rates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `ShipEngine rate shop failed: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as ShipEngineRateResponse;
  return data.rate_response.rates ?? [];
}

export interface ShipEngineLabelRequest {
  rateId?: string;
  shipFrom?: Address;
  shipTo?: Address;
  parcel?: Parcel;
  serviceCode?: string;
  carrierId?: string;
  /** Set to true to buy a test label that won't be charged. */
  testLabel?: boolean;
}

export interface ShipEngineLabelResponse {
  label_id: string;
  status: string;
  shipment_id: string;
  ship_date: string;
  created_at: string;
  shipment_cost: { amount: number; currency: string };
  insurance_cost: { amount: number; currency: string };
  tracking_number: string;
  tracking_status: string;
  carrier_code: string;
  service_code: string;
  label_download: { href: string; pdf?: string; png?: string; zpl?: string };
  trackingUrl?: string;
}

/**
 * Purchase a shipping label.
 */
export async function purchaseShipEngineLabel(
  req: ShipEngineLabelRequest,
): Promise<ShipEngineLabelResponse> {
  if (req.rateId) {
    const res = await fetch(
      `${SHIPENGINE_API}/labels/rates/${encodeURIComponent(req.rateId)}`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          test_label: req.testLabel ?? false,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `ShipEngine label purchase failed: ${res.status} ${await res.text()}`,
      );
    }
    return (await res.json()) as ShipEngineLabelResponse;
  }

  if (!req.shipFrom || !req.shipTo || !req.parcel || !req.serviceCode) {
    throw new Error(
      "Either rateId or { shipFrom, shipTo, parcel, serviceCode } must be provided",
    );
  }

  const body = {
    shipment: {
      service_code: req.serviceCode,
      ship_to: addressToShipEngine(req.shipTo),
      ship_from: addressToShipEngine(req.shipFrom),
      packages: [parcelToShipEngine(req.parcel)],
    },
    test_label: req.testLabel ?? false,
  };

  const res = await fetch(`${SHIPENGINE_API}/labels`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `ShipEngine label purchase failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as ShipEngineLabelResponse;
}

/**
 * Retrieve tracking events for a tracking number (used by /webhooks/shipengine).
 */
export async function getShipEngineTracking(
  carrierCode: string,
  trackingNumber: string,
): Promise<{
  tracking_number: string;
  status_code: string;
  status_description: string;
  carrier_status_description?: string;
  events: Array<{
    occurred_at: string;
    description: string;
    status_code: string;
    city_locality?: string;
  }>;
}> {
  const url = new URL(`${SHIPENGINE_API}/tracking`);
  url.searchParams.set("carrier_code", carrierCode);
  url.searchParams.set("tracking_number", trackingNumber);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(
      `ShipEngine tracking failed: ${res.status} ${await res.text()}`,
    );
  }
  return await res.json();
}

function addressToShipEngine(a: Address) {
  return {
    name: a.name,
    phone: a.phone,
    address_line1: a.addressLine1,
    address_line2: a.addressLine2,
    city_locality: a.cityLocality,
    state_province: a.stateProvince,
    postal_code: a.postalCode,
    country_code: a.countryCode,
  };
}

function parcelToShipEngine(p: Parcel) {
  return {
    weight: { value: p.weightOz, unit: "ounce" },
    dimensions:
      p.lengthIn && p.widthIn && p.heightIn
        ? {
            length: p.lengthIn,
            width: p.widthIn,
            height: p.heightIn,
            unit: "inch",
          }
        : undefined,
  };
}
