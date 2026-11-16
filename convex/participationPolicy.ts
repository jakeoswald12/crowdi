import type { QueryCtx, Doc } from "./functions.ts";

export async function participationState(
  ctx: QueryCtx,
  entryId: Doc<"photoEntries">["_id"],
) {
  const events = await ctx.db
    .query("participationEvents")
    .withIndex("by_entry", (q) => q.eq("entryId", entryId))
    .collect();
  const cutoffs = await ctx.db
    .query("fundraisingCutoffs")
    .withIndex("by_entry", (q) => q.eq("entryId", entryId))
    .collect();
  const stopIntents = await ctx.db
    .query("participationStopIntents")
    .withIndex("by_entry", (q) => q.eq("entryId", entryId))
    .collect();
  const latest = events.filter((e) => e.action.startsWith("fraud-")).at(-1);
  const fraudHeld = !!latest && latest.action !== "fraud-release";
  const cutoff = cutoffs.length
    ? Math.min(...cutoffs.map((c) => c.effectiveAt))
    : null;
  const ended = cutoff !== null && cutoff <= Date.now();
  return {
    events,
    cutoffs,
    stopIntents,
    revision: events.at(-1)?.revision ?? 0,
    cutoff,
    fraudHeld,
    ended,
    hidden: ended || fraudHeld,
    noNewAllocation: ended || fraudHeld || stopIntents.length > 0,
    advertising: stopIntents.some((i) => i.reservedSlots > 0)
      ? "Stopping advertising"
      : stopIntents.length
        ? "No new advertising; provider confirmation pending"
        : "No participation stop requested",
  };
}
export async function earningsHeld(ctx: QueryCtx, entryIds: string[]) {
  for (const raw of new Set(entryIds)) {
    const id = ctx.db.normalizeId("photoEntries", raw);
    if (!id) throw Error("PARTICIPATION_SCOPE: Invalid earning entry");
    if ((await participationState(ctx, id)).fraudHeld) return true;
  }
  return false;
}
