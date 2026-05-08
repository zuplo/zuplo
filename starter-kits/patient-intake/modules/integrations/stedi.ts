import { environment } from "@zuplo/runtime";

/**
 * Stedi Healthcare Eligibility (270/271) integration.
 *
 * Hits the Stedi v3 eligibility check endpoint which submits an X12 270 to
 * the payer and returns the parsed 271 response. Used by the
 * `verify_insurance_pre_visit` orchestrator to confirm a patient's
 * coverage is active before their appointment so the front desk can
 * resolve gaps without paper-shuffling at the window.
 *
 * Docs: https://www.stedi.com/docs/healthcare/eligibility-check
 */

const STEDI_API_BASE = "https://healthcare.us.stedi.com";

export interface StediEligibilityRequest {
  /** Trading partner / payer service id, e.g. "BCBSF" or "AETNA". */
  tradingPartnerServiceId: string;
  /** Provider initiating the request. */
  provider: {
    organizationName?: string;
    firstName?: string;
    lastName?: string;
    npi: string;
  };
  /** The subscriber (patient) to check eligibility for. */
  subscriber: {
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD
  };
  /** Optional encounter / service type (e.g. "30" for health benefit plan coverage). */
  encounter?: {
    serviceTypeCodes?: string[];
    dateOfService?: string;
  };
}

export interface StediEligibilityResponse {
  meta?: {
    senderId?: string;
    submitterId?: string;
    applicationMode?: string;
    traceId?: string;
  };
  /** Top-level coverage result. "active" means the plan is in force. */
  benefitsInformation?: Array<{
    code: string;
    name?: string;
    serviceTypeCodes?: string[];
    coverageLevelCode?: string;
    coverageLevel?: string;
    insuranceTypeCode?: string;
    insuranceType?: string;
    eligibilityOrBenefit?: string;
    benefitAmount?: string;
    benefitPercent?: string;
    timeQualifier?: string;
    additionalInformation?: Array<{ description?: string }>;
  }>;
  errors?: Array<{ code: string; description: string; followupAction?: string }>;
}

export interface StediEligibilitySummary {
  /** True when at least one "active coverage" segment was returned. */
  active: boolean;
  /** True when the payer responded with at least one "inactive" segment. */
  inactive: boolean;
  /** Plan or benefit description when reported. */
  planDescription: string | null;
  /** Trace id from the payer response, useful for support tickets. */
  traceId: string | null;
  /** Raw 271 response, persisted for audit. */
  raw: StediEligibilityResponse;
}

/**
 * Submit a 270 eligibility check and return a structured summary.
 */
export async function checkStediEligibility(
  req: StediEligibilityRequest,
): Promise<StediEligibilitySummary> {
  const apiKey = environment.STEDI_API_KEY;
  if (!apiKey) throw new Error("STEDI_API_KEY is not set");

  const res = await fetch(`${STEDI_API_BASE}/v3/eligibility`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      controlNumber: Date.now().toString().slice(-9),
      tradingPartnerServiceId: req.tradingPartnerServiceId,
      provider: req.provider,
      subscriber: req.subscriber,
      encounter: req.encounter,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Stedi eligibility check failed: ${res.status} ${await res.text()}`,
    );
  }

  const body = (await res.json()) as StediEligibilityResponse;

  // Code "1" = active coverage, code "6" = inactive (per X12 EB01 codes).
  const benefits = body.benefitsInformation ?? [];
  const active = benefits.some((b) => b.code === "1");
  const inactive = benefits.some((b) => b.code === "6");
  const planDescription =
    benefits.find((b) => b.code === "1" || b.code === "6")?.name ?? null;

  return {
    active,
    inactive,
    planDescription,
    traceId: body.meta?.traceId ?? null,
    raw: body,
  };
}
