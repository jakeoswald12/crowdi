import { defineTable } from "convex/server";
import { v } from "convex/values";

export const participationAction = v.union(
  v.literal("withdrawal"),
  v.literal("ordinary-removal"),
  v.literal("fraud-suspend"),
  v.literal("fraud-release"),
  v.literal("fraud-continue"),
);
export const participationTables = {
  participationEvents: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    entryId: v.id("photoEntries"),
    action: participationAction,
    reason: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    effectiveAt: v.number(),
    creativeVersion: v.number(),
    revision: v.number(),
    version: v.literal(1),
    operationId: v.string(),
    fingerprint: v.string(),
  }).index("by_entry", ["entryId"]),
  participationStopIntents: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    entryId: v.id("photoEntries"),
    eventId: v.id("participationEvents"),
    protocol: v.union(v.literal("stop"), v.literal("temporary-pause")),
    status: v.literal("pending-provider-confirmation"),
    reservedSlots: v.number(),
    reservedCents: v.number(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_entry", ["entryId"]),
};
