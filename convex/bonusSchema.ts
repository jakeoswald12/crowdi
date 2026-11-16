import { defineTable } from "convex/server";
import { v } from "convex/values";
import { batchItem } from "./batchSchema.ts";
import { commissionState } from "./commissionSchema.ts";
export const bonusBinding = v.object({
  key: v.string(),
  nonprofitId: v.string(),
  campaignId: v.string(),
  liability: v.id("prizeLiabilities"),
  creator: v.string(),
  amountCents: v.number(),
  currency: v.literal("USD"),
  account: v.string(),
  route: v.string(),
  sourcePurpose: v.literal("prize"),
  destination: v.string(),
  sourceBinding: v.string(),
  transportBinding: v.string(),
  approvalId: v.id("creatorBatchApprovals"),
  revision: v.number(),
});
const provenance = {
  actor: v.string(),
  source: v.literal("bonus-payments-owned-v1"),
  at: v.number(),
  version: v.literal(1),
  synthetic: v.literal(true),
};
export const bonusTables = {
  bonusExecutions: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    liability: v.id("prizeLiabilities"),
    approvalId: v.id("creatorBatchApprovals"),
    operationId: v.string(),
    actor: v.string(),
    item: batchItem,
    binding: bonusBinding,
    fundingEvidenceId: v.union(v.id("prizeEvidence"), v.null()),
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
    .index("by_liability", ["liability"])
    .index("by_operation", ["campaignSlug", "operationId"])
    .index("by_approval", ["approvalId"]),
  bonusAuthorizations: defineTable({
    executionId: v.id("bonusExecutions"),
    approvalId: v.id("creatorBatchApprovals"),
    operationId: v.string(),
    binding: bonusBinding,
    item: batchItem,
    ...provenance,
  })
    .index("by_operation", ["operationId"])
    .index("by_execution", ["executionId"]),
  bonusPayments: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    liability: v.id("prizeLiabilities"),
    executionId: v.id("bonusExecutions"),
    approvalId: v.id("creatorBatchApprovals"),
    binding: bonusBinding,
    amountCents: v.number(),
    currency: v.literal("USD"),
    providerId: v.string(),
    confirmationReference: v.string(),
    confirmationDigest: v.string(),
    confirmedAt: v.number(),
    ...provenance,
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_liability", ["liability"]),
  bonusExecutionAudit: defineTable({
    executionId: v.id("bonusExecutions"),
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
