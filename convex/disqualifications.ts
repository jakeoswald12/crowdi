import { v } from "convex/values";
import { mutation, query } from "./functions.ts";
import { paidManager } from "./paidCorrections.ts";
import { operationIdentity } from "./access.ts";
import { safeText } from "./operatorIncidents.ts";
import { requestFingerprint } from "./requestFingerprint.ts";
import { disqualificationState } from "./disqualificationPolicy.ts";
import { settingsFor } from "./competitionInputs.ts";
import { competitionPeriods } from "./competitionPolicy.ts";
import { recomputeStandings } from "./standings.ts";

export const inspect = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign } = await paidManager(ctx, args.campaignId);
    const state = await disqualificationState(ctx, campaign.slug);
    const entries = await ctx.db
      .query("photoEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
    const selectable = [];
    for (const entry of entries.filter(
      (e) =>
        e.nonprofitId === campaign.nonprofitId &&
        e.firstApprovedAt !== undefined,
    )) {
      const version = await ctx.db
        .query("photoVersions")
        .withIndex("by_entry_version", (q) =>
          q.eq("entryId", entry._id).eq("version", entry.version),
        )
        .unique();
      selectable.push({
        entryId: entry._id,
        title: version?.title ?? "Previously approved entry",
      });
    }
    return { ...state, entries: selectable };
  },
});

export const save = mutation({
  args: {
    campaignId: v.string(),
    entryIds: v.array(v.id("photoEntries")),
    start: v.number(),
    end: v.number(),
    reason: v.string(),
    expectedRevision: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId);
    operationIdentity(args.operationId);
    safeText(args.reason, 500);
    const settings = await settingsFor(ctx, campaign.slug);
    if (
      !settings ||
      !Number.isSafeInteger(args.start) ||
      !Number.isSafeInteger(args.end) ||
      args.start >= args.end ||
      args.start < Date.parse(settings.rules.campaignStart) ||
      args.end > Date.parse(settings.rules.campaignEnd)
    )
      throw new Error(
        "DISQUALIFICATION_SCOPE: Select an exact bounded campaign range",
      );
    if (
      !args.entryIds.length ||
      new Set(args.entryIds).size !== args.entryIds.length
    )
      throw new Error(
        "DISQUALIFICATION_ENTRIES: Select distinct approved competition entries",
      );
    for (const id of args.entryIds) {
      const entry = await ctx.db.get(id);
      if (
        !entry ||
        entry.campaignSlug !== campaign.slug ||
        entry.nonprofitId !== campaign.nonprofitId ||
        entry.firstApprovedAt === undefined
      )
        throw new Error("FORBIDDEN: Entry access denied");
    }
    const state = await disqualificationState(ctx, campaign.slug),
      fingerprint = requestFingerprint(args);
    const retry = state.decisions.find(
      (d) => d.actor === subject && d.operationId === args.operationId,
    );
    if (retry) {
      if (retry.fingerprint !== fingerprint)
        throw new Error("DISQUALIFICATION_RETRY_CONFLICT");
      return retry;
    }
    if (state.revision !== args.expectedRevision)
      throw new Error(
        "DISQUALIFICATION_REVISION: History changed; review the current decisions",
      );
    const id = await ctx.db.insert("disqualifications", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      entryIds: args.entryIds,
      start: args.start,
      end: args.end,
      reason: args.reason,
      actor: subject,
      at: Date.now(),
      source: "manager-disqualification",
      version: 1,
      revision: state.revision + 1,
      operationId: args.operationId,
      fingerprint,
      recomputations: [],
    });
    const recomputations = [];
    for (const kind of ["daily", "weekly"] as const) {
      for (const period of competitionPeriods(settings.rules, kind).filter(
        (p) => p.inputStart < args.end && p.inputEnd > args.start,
      )) {
        const final = await ctx.db
          .query("competitionFinals")
          .withIndex("by_period", (q) =>
            q
              .eq("campaignSlug", campaign.slug)
              .eq("kind", kind)
              .eq("period", period.label),
          )
          .unique();
        const result = final
          ? null
          : await recomputeStandings(
              ctx,
              campaign,
              kind,
              period.label,
              subject,
            );
        recomputations.push({
          kind,
          period: period.label,
          outcome: result?.outcome ?? "finalized-preserved",
        });
      }
    }
    await ctx.db.patch(id, { recomputations });
    return ctx.db.get(id);
  },
});
