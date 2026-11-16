import { defineTable } from "convex/server";
import { v } from "convex/values";

export const disqualificationTables = {
  disqualifications: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    entryIds: v.array(v.id("photoEntries")),
    start: v.number(),
    end: v.number(),
    reason: v.string(),
    actor: v.string(),
    at: v.number(),
    source: v.literal("manager-disqualification"),
    version: v.literal(1),
    revision: v.number(),
    operationId: v.string(),
    fingerprint: v.string(),
    recomputations: v.array(
      v.object({
        kind: v.union(v.literal("daily"), v.literal("weekly")),
        period: v.string(),
        outcome: v.string(),
      }),
    ),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_operation", ["campaignSlug", "actor", "operationId"]),
};
