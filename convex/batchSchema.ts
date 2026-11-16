import { defineTable } from "convex/server";
import { v } from "convex/values";

export const recipientRestriction = v.union(
  v.literal("setup-required"),
  v.literal("restricted"),
  v.literal("reviewable"),
);
export const batchItem = v.object({
  key: v.string(),
  creator: v.string(),
  kind: v.union(v.literal("commission"), v.literal("prize")),
  sourcePurpose: v.union(v.literal("fundraising"), v.literal("prize")),
  amountCents: v.number(),
  carryforwardCents: v.number(),
  reservedCents: v.number(),
  paidCents: v.number(),
  details: v.array(
    v.object({
      reference: v.string(),
      entryId: v.string(),
      period: v.string(),
      originalCents: v.number(),
      adjustmentCents: v.number(),
      amountCents: v.number(),
    }),
  ),
  state: v.union(v.literal("owed"), v.literal("reserved")),
  guidance: v.string(),
  recipientRevision: v.number(),
  destinationBinding: v.union(v.string(), v.null()),
  sourceBinding: v.string(),
});
const scope = { campaignSlug: v.string(), nonprofitId: v.string() };
export const batchTables = {
  creatorBatchClocks: defineTable({
    campaignSlug: v.string(),
    now: v.number(),
  }).index("by_campaign", ["campaignSlug"]),
  creatorBatchRecipientEvents: defineTable({
    ...scope,
    creator: v.string(),
    revision: v.number(),
    snapshot: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
  }).index("by_creator", ["campaignSlug", "creator"]),
  creatorBatchRecipients: defineTable({
    ...scope,
    creator: v.string(),
    restriction: recipientRestriction,
    guidance: v.string(),
    destinationBinding: v.union(v.string(), v.null()),
    revision: v.number(),
    actor: v.string(),
    source: v.string(),
    evidence: v.string(),
    at: v.number(),
    synthetic: v.boolean(),
  }).index("by_creator", ["campaignSlug", "creator"]),
  creatorBatches: defineTable({
    ...scope,
    cutoff: v.number(),
    week: v.string(),
    preparedAt: v.number(),
    revision: v.number(),
    fingerprint: v.string(),
    items: v.array(batchItem),
    superseded: v.boolean(),
    actor: v.string(),
    source: v.string(),
    version: v.literal(1),
  }).index("by_campaign", ["campaignSlug"]),
  creatorBatchApprovals: defineTable({
    ...scope,
    batchId: v.id("creatorBatches"),
    revision: v.number(),
    fingerprint: v.string(),
    items: v.array(batchItem),
    operationId: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  })
    .index("by_batch", ["batchId"])
    .index("by_operation", ["campaignSlug", "operationId"]),
  creatorBatchAudit: defineTable({
    ...scope,
    batchId: v.id("creatorBatches"),
    revision: v.number(),
    fingerprint: v.string(),
    items: v.array(batchItem),
    action: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_campaign", ["campaignSlug"]),
};
