import { defineTable } from "convex/server";
import { v } from "convex/values";
import { paidProvider } from "./paidMetricSchema.ts";

export const advertisingGoal = v.union(
  v.literal("awareness"),
  v.literal("tracked-visits"),
);
export const advertisingAction = v.union(
  v.literal("discover"),
  v.literal("authorize"),
  v.literal("validate"),
);
const observation = {
  applicationId: v.string(),
  applicationOwner: v.literal("slander"),
  nonprofitId: v.string(),
  apiVersion: v.string(),
  observedAt: v.number(),
  expiresAt: v.number(),
};
export const advertisingResult = v.union(
  v.object({
    ...observation,
    kind: v.literal("discovery"),
    supported: v.boolean(),
    accounts: v.array(
      v.object({ accountId: v.string(), ownerNonprofitId: v.string() }),
    ),
  }),
  v.object({
    ...observation,
    kind: v.literal("grant"),
    accountId: v.string(),
    ownerNonprofitId: v.string(),
    grantId: v.string(),
    grantRevision: v.string(),
    status: v.union(
      v.literal("granted"),
      v.literal("missing"),
      v.literal("revoked"),
      v.literal("unsupported"),
    ),
    permissions: v.array(
      v.union(v.literal("manage_ads"), v.literal("read_reports")),
    ),
  }),
  v.object({
    ...observation,
    kind: v.literal("contract"),
    accountId: v.string(),
    grantRevision: v.string(),
    entryId: v.id("photoEntries"),
    creativeDigest: v.string(),
    goal: advertisingGoal,
    objective: v.string(),
    optimization: v.string(),
    placement: v.string(),
    identityId: v.string(),
    identityOwnerNonprofitId: v.string(),
    identityStatus: v.union(
      v.literal("authorized"),
      v.literal("missing"),
      v.literal("revoked"),
      v.literal("unsupported"),
    ),
    mediaStatus: v.union(
      v.literal("accepted"),
      v.literal("missing"),
      v.literal("rejected"),
      v.literal("unsupported"),
    ),
    destination: v.string(),
  }),
);
export const advertisingRequest = {
  campaignId: v.string(),
  provider: paidProvider,
  expectedVersion: v.number(),
  operationId: v.string(),
  action: advertisingAction,
  accountId: v.optional(v.string()),
  entryId: v.optional(v.id("photoEntries")),
};
const scoped = { campaignSlug: v.string(), nonprofitId: v.string() };
const provenance = {
  actor: v.string(),
  source: v.string(),
  at: v.number(),
  version: v.literal(1),
};
export const advertisingTables = {
  advertisingSetups: defineTable({
    ...scoped,
    provider: paidProvider,
    revision: v.number(),
    goal: advertisingGoal,
    actor: v.string(),
    source: v.string(),
    at: v.number(),
  }).index("by_campaign", ["campaignSlug"]),
  advertisingOperations: defineTable({
    ...scoped,
    ...provenance,
    operationId: v.string(),
    fingerprint: v.string(),
    provider: paidProvider,
    setupRevision: v.number(),
    action: advertisingAction,
    accountId: v.optional(v.string()),
    entryId: v.optional(v.id("photoEntries")),
    creativeDigest: v.optional(v.string()),
    grantRevision: v.optional(v.string()),
    state: v.union(
      v.literal("pending"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    reason: v.string(),
    expiresAt: v.number(),
    capabilityExpiredAt: v.optional(v.number()),
    result: v.optional(advertisingResult),
    resultFingerprint: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    synthetic: v.boolean(),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_operation", ["campaignSlug", "actor", "operationId"]),
  advertisingAudit: defineTable({
    ...scoped,
    ...provenance,
    operationId: v.string(),
    fingerprint: v.string(),
    provider: paidProvider,
    setupRevision: v.number(),
    action: v.string(),
    reason: v.string(),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_operation", ["campaignSlug", "actor", "operationId"]),
};
