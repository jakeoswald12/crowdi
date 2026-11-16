import { defineTable } from "convex/server";
import { v } from "convex/values";
import { fundraisingScope } from "./fundraisingSchema.ts";

export const advertisingContributionTables = {
  advertisingContributionCheckouts: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    operationId: v.string(),
    fingerprint: v.string(),
    tokenHash: v.string(),
    amountCents: v.number(),
    applicationOrigin: v.string(),
    scope: fundraisingScope,
    state: v.string(),
    holdReason: v.optional(v.string()),
    providerKey: v.string(),
    createdAt: v.number(),
    retryBefore: v.number(),
    sessionId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    actor: v.literal("account-free-contributor"),
    source: v.string(),
    version: v.literal(1),
  })
    .index("by_operation", ["operationId"])
    .index("by_session", ["sessionId"])
    .index("by_campaign", ["campaignSlug"]),
  advertisingContributions: defineTable({
    checkoutId: v.id("advertisingContributionCheckouts"),
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    account: v.string(),
    paymentId: v.string(),
    chargeId: v.string(),
    grossCents: v.number(),
    confirmedAt: v.number(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  })
    .index("by_checkout", ["checkoutId"])
    .index("by_payment", ["account", "paymentId"]),
  advertisingContributionAmounts: defineTable({
    contributionId: v.id("advertisingContributions"),
    feeCents: v.union(v.number(), v.null()),
    netCents: v.union(v.number(), v.null()),
    balanceTransactionId: v.union(v.string(), v.null()),
    balanceStatus: v.union(
      v.literal("available"),
      v.literal("pending"),
      v.null(),
    ),
    eventId: v.string(),
    digest: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_contribution", ["contributionId"]),
  advertisingContributionEvents: defineTable({
    account: v.string(),
    eventId: v.string(),
    checkoutId: v.id("advertisingContributionCheckouts"),
    digest: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_event", ["account", "eventId"]),
  advertisingContributionAudit: defineTable({
    checkoutId: v.id("advertisingContributionCheckouts"),
    action: v.string(),
    digest: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_checkout", ["checkoutId"]),
};
