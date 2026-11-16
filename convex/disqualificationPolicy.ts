import type { Doc, QueryCtx } from "./functions.ts";

export async function disqualificationState(
  ctx: QueryCtx,
  campaignSlug: string,
) {
  const decisions = await ctx.db
    .query("disqualifications")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .collect();
  return { decisions, revision: decisions.length };
}

// Ranges are half-open. Overlapping decisions exclude each instant only once.
export function eligibleRanges(
  decisions: Doc<"disqualifications">[],
  entryId: string,
  start: number,
  end: number,
) {
  const excluded = decisions
    .filter(
      (d) =>
        d.entryIds.includes(entryId as Doc<"photoEntries">["_id"]) &&
        d.start < end &&
        d.end > start,
    )
    .map((d) => ({
      start: Math.max(start, d.start),
      end: Math.min(end, d.end),
    }))
    .sort((a, b) => a.start - b.start);
  const ranges = [];
  let cursor = start;
  for (const range of excluded) {
    if (range.start > cursor) ranges.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < end) ranges.push({ start: cursor, end });
  return { ranges, affected: excluded.length > 0 };
}

export function publicEligibility(
  decisions: Doc<"disqualifications">[],
  entryId: string,
) {
  return decisions
    .filter((d) => d.entryIds.includes(entryId as Doc<"photoEntries">["_id"]))
    .map((d) => ({
      start: d.start,
      end: d.end,
      status: "Selected activity ineligible" as const,
    }));
}
