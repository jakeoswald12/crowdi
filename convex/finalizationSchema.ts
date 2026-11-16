import { defineTable } from "convex/server";
import { v } from "convex/values";
import { periodKind } from "./standingsSchema.ts";
import { rulesValidator } from "./campaignRules.ts";

const scope = { campaignSlug: v.string(), nonprofitId: v.string() };
export const finalFreshness = v.object({
  lastSuccessfulImport: v.union(v.number(), v.null()),
  dataAsOf: v.union(v.number(), v.null()),
  reportingDelayMs: v.union(v.number(), v.null()),
});
export const finalRow = v.object({
  entryId: v.id("photoEntries"),
  creativeVersion: v.number(),
  creator: v.string(),
  title: v.string(),
  publicCreator: v.string(),
  createdAt: v.number(),
  impressions: v.number(),
  linkClicks: v.number(),
  fundraisingCents: v.number(),
  score: v.number(),
  rank: v.number(),
  winner: v.boolean(),
  awardCents: v.number(),
});
export const finalizationTables = {
  competitionScheduleHeads: defineTable({
    ...scope,
    settingsId: v.id("campaignSettings"),
    periodCount: v.number(),
    initializedAt: v.number(),
  }).index("by_campaign", ["campaignSlug"]),
  competitionEmptyCoverage: defineTable({
    ...scope,
    settingsId: v.id("campaignSettings"),
    authorityId: v.id("competitionAuthorities"),
    kind: periodKind,
    period: v.string(),
    inputFingerprint: v.string(),
    sourceRevision: v.string(),
    actor: v.string(),
    evidence: v.string(),
    synthetic: v.boolean(),
    at: v.number(),
  }).index("by_period", ["campaignSlug", "kind", "period"]),
  competitionAuthorities: defineTable({
    ...scope,
    settingsId: v.id("campaignSettings"),
    synthetic: v.boolean(),
    sourceRevision: v.string(),
    evidence: v.string(),
    actor: v.string(),
    at: v.number(),
  }).index("by_campaign", ["campaignSlug"]),
  competitionWork: defineTable({
    ...scope,
    settingsId: v.id("campaignSettings"),
    kind: periodKind,
    period: v.string(),
    start: v.number(),
    end: v.number(),
    deadline: v.number(),
    active: v.boolean(),
    nextAt: v.number(),
    generation: v.number(),
    attempts: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("held"),
      v.literal("finalized"),
    ),
    missing: v.array(v.string()),
    checkedAt: v.optional(v.number()),
    snapshotId: v.optional(v.id("competitionFinals")),
  })
    .index("by_period", ["campaignSlug", "kind", "period"])
    .index("by_due", ["campaignSlug", "active", "nextAt"])
    .index("by_campaign", ["campaignSlug"]),
  competitionFinals: defineTable({
    ...scope,
    workId: v.id("competitionWork"),
    settingsId: v.id("campaignSettings"),
    kind: periodKind,
    period: v.string(),
    start: v.number(),
    end: v.number(),
    deadline: v.number(),
    finalizedAt: v.number(),
    actor: v.literal("competition-finalizer"),
    source: v.literal("competition-finalization-v1"),
    version: v.literal(1),
    synthetic: v.boolean(),
    authorityId: v.id("competitionAuthorities"),
    inputFingerprint: v.string(),
    inputSnapshot: v.string(),
    fundingRevision: v.union(v.string(), v.null()),
    fundingSnapshot: v.union(v.string(), v.null()),
    rules: rulesValidator,
    fixedPrizeCents: v.number(),
    awardedCents: v.number(),
    allZero: v.boolean(),
    freshness: finalFreshness,
    rows: v.array(finalRow),
  })
    .index("by_period", ["campaignSlug", "kind", "period"])
    .index("by_campaign", ["campaignSlug"]),
  prizeLiabilities: defineTable({
    ...scope,
    snapshotId: v.id("competitionFinals"),
    entryId: v.id("photoEntries"),
    creator: v.string(),
    kind: periodKind,
    period: v.string(),
    amountCents: v.number(),
    currency: v.literal("USD"),
    finalizedAt: v.number(),
    batchEligibleAt: v.number(),
    eligibility: v.literal("finalized"),
    state: v.literal("unpaid"),
    source: v.union(
      v.literal("competition-finalization-v1"),
      v.literal("finalized-bonus-correction-v1"),
    ),
    correctionId: v.optional(v.id("bonusCorrections")),
    version: v.literal(1),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_snapshot", ["snapshotId"]),
  competitionDiscrepancies: defineTable({
    ...scope,
    snapshotId: v.id("competitionFinals"),
    entryId: v.id("photoEntries"),
    source: v.string(),
    start: v.number(),
    end: v.number(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_snapshot", ["snapshotId"]),
};
