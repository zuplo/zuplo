import { environment } from "@zuplo/runtime";

/**
 * Mindee receipt OCR integration.
 *
 * Hits the Mindee Expense Receipts v5 prediction endpoint with a
 * publicly-reachable URL or a base64-encoded image. Returns a normalized
 * payload with the fields you actually want on an expense:
 *
 *   merchant, amountCents, currency, date, category
 *
 * Auth: `Authorization: Token <MINDEE_API_KEY>`.
 */

const MINDEE_API =
  "https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict";

interface MindeeFieldString {
  value: string | null;
  confidence: number;
}
interface MindeeFieldNumber {
  value: number | null;
  confidence: number;
}

interface MindeeReceiptDocument {
  inference: {
    prediction: {
      total_amount: MindeeFieldNumber;
      total_net?: MindeeFieldNumber;
      total_tax?: MindeeFieldNumber;
      currency: MindeeFieldString;
      date: MindeeFieldString;
      time?: MindeeFieldString;
      supplier_name: MindeeFieldString;
      category?: MindeeFieldString;
      subcategory?: MindeeFieldString;
      receipt_number?: MindeeFieldString;
    };
  };
}

export interface ParsedReceipt {
  merchant: string | null;
  amountCents: number | null;
  currency: string | null;
  date: string | null;
  category: string | null;
  receiptNumber: string | null;
  confidence: number;
  raw: MindeeReceiptDocument;
}

async function callMindee(form: FormData): Promise<MindeeReceiptDocument> {
  const apiKey = environment.MINDEE_API_KEY;
  if (!apiKey) throw new Error("MINDEE_API_KEY is not set");

  const res = await fetch(MINDEE_API, {
    method: "POST",
    headers: { authorization: `Token ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Mindee predict failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { document: MindeeReceiptDocument };
  return json.document;
}

/** Parse a receipt by URL (Mindee fetches the image). */
export async function parseReceiptFromUrl(url: string): Promise<ParsedReceipt> {
  const form = new FormData();
  form.append("document", url);
  return normalize(await callMindee(form));
}

/** Parse a receipt from raw bytes (e.g. an upload buffer). */
export async function parseReceiptFromBytes(args: {
  bytes: Uint8Array | Blob;
  filename: string;
  contentType?: string;
}): Promise<ParsedReceipt> {
  const blob =
    args.bytes instanceof Blob
      ? args.bytes
      : new Blob([args.bytes], { type: args.contentType ?? "application/octet-stream" });
  const form = new FormData();
  form.append("document", blob, args.filename);
  return normalize(await callMindee(form));
}

function normalize(doc: MindeeReceiptDocument): ParsedReceipt {
  const p = doc.inference.prediction;
  const amount = p.total_amount.value;
  const conf = Math.min(
    p.total_amount.confidence ?? 0,
    p.supplier_name.confidence ?? 0,
    p.date.confidence ?? 0,
  );
  return {
    merchant: p.supplier_name.value,
    amountCents: amount != null ? Math.round(amount * 100) : null,
    currency: p.currency.value,
    date: p.date.value,
    category: p.category?.value ?? p.subcategory?.value ?? null,
    receiptNumber: p.receipt_number?.value ?? null,
    confidence: conf,
    raw: doc,
  };
}
