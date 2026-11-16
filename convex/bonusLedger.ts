import type { QueryCtx, Doc } from "./functions.ts";

export const retainsOriginalReservation = (
  e: Doc<"bonusExecutions"> | undefined,
) => !!e && e.generation > 0 && e.state !== "failed";

// T18 owns payment facts. T16 liabilities stay immutable; T20 must append its
// corrections/losses and consult both paid facts and reservations before acting.
export async function bonusLedger(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  retiring: readonly Doc<"prizeLiabilities">["_id"][] = [],
) {
  const payments = (
    await ctx.db
      .query("bonusPayments")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((p) => p.nonprofitId === c.nonprofitId);
  const allocations = (
    await ctx.db
      .query("bonusExecutions")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((e) => e.nonprofitId === c.nonprofitId);
  const retirements = (
    await ctx.db
      .query("bonusRetirements")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((r) => r.nonprofitId === c.nonprofitId);
  const retired = new Set([
    ...retirements.map((r) => r.liability),
    ...retiring,
  ]);
  const paid = new Set(payments.map((p) => p.liability));
  // A retired obligation stops being payable. An original uncertain send still
  // protects its own money until authenticated terminal evidence reconciles it.
  const reservations = allocations.filter(
    (e) =>
      !paid.has(e.liability) &&
      (!retired.has(e.liability) || retainsOriginalReservation(e)),
  );
  return {
    payments,
    allocations,
    reservations,
    paid,
    retired,
    retirements,
    reserved: new Map(reservations.map((e) => [e.liability, e])),
  };
}
export type BonusLedger = Awaited<ReturnType<typeof bonusLedger>>;
