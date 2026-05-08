import { environment } from "@zuplo/runtime";

/**
 * Mindee invoice/receipt OCR.
 *
 * We use the Expense Receipts v5 model since Mindee's general invoice model
 * costs more credits and the receipt model handles vendor bills well enough
 * for the prefill use case. Switch to /invoices/v4/predict if you want
 * line-item parsing.
 *
 * Docs: https://developers.mindee.com/docs/expense-receipts-ocr
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
      supplier_name: MindeeFieldString;
      receipt_number?: MindeeFieldString;
      category?: MindeeFieldString;
    };
  };
}

export interface ParsedBill {
  vendor: string | null;
  amountCents: number | null;
  currency: string | null;
  date: string | null;
  receiptNumber: string | null;
  category: string | null;
  confidence: number;
}

export async function parseBillFromUrl(url: string): Promise<ParsedBill> {
  const apiKey = environment.MINDEE_API_KEY;
  if (!apiKey) throw new Error("MINDEE_API_KEY is not set");

  const form = new FormData();
  form.append("document", url);
  const res = await fetch(MINDEE_API, {
    method: "POST",
    headers: { authorization: `Token ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Mindee predict failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { document: MindeeReceiptDocument };
  const p = json.document.inference.prediction;
  return {
    vendor: p.supplier_name.value,
    amountCents: p.total_amount.value != null ? Math.round(p.total_amount.value * 100) : null,
    currency: p.currency.value,
    date: p.date.value,
    receiptNumber: p.receipt_number?.value ?? null,
    category: p.category?.value ?? null,
    confidence: Math.min(
      p.total_amount.confidence ?? 0,
      p.supplier_name.confidence ?? 0,
      p.date.confidence ?? 0,
    ),
  };
}
