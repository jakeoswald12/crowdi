import { defineTable } from "convex/server";
import { v } from "convex/values";
import { batchItem } from "./batchSchema.ts";
export const commissionState = v.union(
  ...(
    [
      "proposed",
      "held",
      "sending",
      "pending",
      "unknown",
      "failed",
      "confirmed",
      "conflict",
    ] as const
  ).map((s) => v.literal(s)),
);
export const commissionBinding = v.object({
  key: v.string(),
  nonprofitId: v.string(),
  campaignId: v.string(),
  creator: v.string(),
  amountCents: v.number(),
  currency: v.literal("USD"),
  account: v.string(),
  route: v.string(),
  sourcePurpose: v.literal("fundraising"),
  destination: v.string(),
  sourceBinding: v.string(),
  transportBinding: v.string(),
});
export const commissionTables = {
  commissionExecutions: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    approvalId: v.id("creatorBatchApprovals"),
    obligation: v.id("fundraisingCommissionObligations"),
    operationId: v.string(),
    actor: v.string(),
    item: batchItem,
    binding: commissionBinding,
    externalBinding: v.string(),
    state: commissionState,
    reason: v.string(),
    generation: v.number(),
    claimedAt: v.number(),
    providerId: v.optional(v.string()),
    confirmationReference: v.optional(v.string()),
    at: v.number(),
    updatedAt: v.number(),
    version: v.literal(1),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_operation", ["campaignSlug", "operationId"])
    .index("by_approval", ["approvalId"]),
  commissionExecutionAudit: defineTable({
    executionId: v.id("commissionExecutions"),
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    actor: v.string(),
    source: v.string(),
    action: v.string(),
    state: commissionState,
    digest: v.string(),
    providerId: v.optional(v.string()),
    confirmationReference: v.optional(v.string()),
    sequence: v.optional(v.number()),
    generation: v.optional(v.number()),
    outcome: v.optional(v.string()),
    at: v.number(),
    version: v.literal(1),
  }).index("by_execution", ["executionId"]),
};
