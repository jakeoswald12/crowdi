import { defineTable } from "convex/server";
import { v } from "convex/values";
import { finalRow, finalFreshness } from "./finalizationSchema.ts";

const scope = { campaignSlug: v.string(), nonprofitId: v.string() };
export const bonusCorrectionTables = {
  bonusCorrections: defineTable({
    ...scope,
    snapshotId: v.id("competitionFinals"),
    operationId: v.string(),
    requestFingerprint: v.string(),
    previewFingerprint: v.string(),
    previousId: v.union(v.id("bonusCorrections"), v.null()),
    version: v.number(),
    actor: v.string(),
    source: v.literal("finalized-bonus-correction-v1"),
    at: v.number(),
    reason: v.string(),
    evidence: v.string(),
    inputFingerprint: v.string(),
    inputSnapshot: v.string(),
    financialSnapshot: v.string(),
    synthetic: v.boolean(),
    allZero: v.boolean(),
    freshness: finalFreshness,
    rows: v.array(finalRow),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_snapshot", ["snapshotId", "version"])
    .index("by_operation", ["campaignSlug", "operationId"]),
  bonusRetirements: defineTable({
    ...scope,
    liability: v.id("prizeLiabilities"),
    correctionId: v.id("bonusCorrections"),
    at: v.number(),
  })
    .index("by_liability", ["liability"])
    .index("by_campaign", ["campaignSlug"]),
  bonusLosses: defineTable({
    ...scope,
    correctionId: v.id("bonusCorrections"),
    liability: v.id("prizeLiabilities"),
    paymentId: v.id("bonusPayments"),
    executionId: v.id("bonusExecutions"),
    amountCents: v.number(),
    currency: v.literal("USD"),
    creator: v.string(),
    providerId: v.string(),
    confirmationReference: v.string(),
    actor: v.string(),
    source: v.literal("finalized-bonus-correction-v1"),
    at: v.number(),
    version: v.literal(1),
    synthetic: v.boolean(),
  })
    .index("by_payment", ["paymentId"])
    .index("by_campaign", ["campaignSlug"]),
};
