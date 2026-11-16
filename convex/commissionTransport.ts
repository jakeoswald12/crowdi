import type { Infer } from "convex/values";
import { commissionBinding } from "./commissionSchema.ts";
import { prizeSignature } from "./prizeTransport.ts";
import { stableRequest } from "./access.ts";
export { prizeSignature as commissionSignature } from "./prizeTransport.ts";
export type CommissionBinding = Infer<typeof commissionBinding>;
// Owned loopback protocol only. "confirmed" means an owned ledger fact, never bank settlement.
export async function controlledCommission(work: {
  origin: string;
  secret: string;
  reconcile: boolean;
  binding: CommissionBinding;
}) {
  const request = {
    method: work.reconcile ? "GET" : "POST",
    binding: work.binding,
  };
  try {
    const response = await fetch(
      `${work.origin}/owned/commission-payments/${work.binding.key}`,
      {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          "X-Owned-Binding": JSON.stringify(work.binding),
          "X-Owned-Signature": prizeSignature(work.secret, request),
        },
        ...(work.reconcile ? {} : { body: JSON.stringify(work.binding) }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw Error("COMMISSION_HTTP");
    const raw = await response.text();
    if (raw.length > 16000) throw Error("COMMISSION_SIZE");
    const body = JSON.parse(raw);
    if (
      response.headers.get("X-Owned-Signature") !==
        prizeSignature(work.secret, body) ||
      stableRequest(body.binding) !== stableRequest(work.binding) ||
      !["pending", "failed", "confirmed"].includes(body.state) ||
      typeof body.providerId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(body.providerId) ||
      !Number.isSafeInteger(body.sequence) ||
      body.sequence < 1 ||
      (body.state === "confirmed" &&
        (typeof body.confirmationReference !== "string" ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(body.confirmationReference)))
    )
      throw Error("COMMISSION_BINDING");
    return { body, signature: prizeSignature(work.secret, body) };
  } catch {
    return null;
  }
}
