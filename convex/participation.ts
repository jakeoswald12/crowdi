import { v } from "convex/values";
import { mutation, query } from "./functions.ts";
import { paidManager } from "./paidCorrections.ts";
import { acceptedCreator } from "./creatorAccess.ts";
import { operationIdentity, authorizedCampaign } from "./access.ts";
import { safeText, recordTrustedIncident } from "./operatorIncidents.ts";
import { requestFingerprint } from "./requestFingerprint.ts";
import { participationAction } from "./participationSchema.ts";
import { participationState } from "./participationPolicy.ts";
import { sumCents } from "./fundraisingPolicy.ts";

const scope = { campaignId: v.string(), entryId: v.id("photoEntries") };
export const capability = query({
  args: scope,
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    const entry = await ctx.db.get(args.entryId);
    if (
      !entry ||
      entry.campaignSlug !== campaign.slug ||
      entry.nonprofitId !== campaign.nonprofitId
    )
      throw Error("FORBIDDEN: Participation access denied");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", subject).eq("nonprofitId", campaign.nonprofitId),
      )
      .unique();
    return { canManage: !!membership?.active && membership.role === "manager" };
  },
});
async function access(
  ctx: Parameters<typeof paidManager>[0],
  campaignId: string,
  entryId: import("./functions.ts").Doc<"photoEntries">["_id"],
  creator: boolean,
) {
  const viewer = creator
    ? await acceptedCreator(ctx, campaignId)
    : await paidManager(ctx, campaignId);
  const entry = await ctx.db.get(entryId);
  if (
    !entry ||
    entry.campaignSlug !== viewer.campaign.slug ||
    entry.nonprofitId !== viewer.campaign.nonprofitId ||
    (creator && entry.subject !== viewer.subject)
  )
    throw Error("FORBIDDEN: Participation access denied");
  return { ...viewer, entry };
}
export const inspect = query({
  args: {
    ...scope,
    audience: v.union(v.literal("manager"), v.literal("creator")),
  },
  handler: async (ctx, args) => {
    await access(
      ctx,
      args.campaignId,
      args.entryId,
      args.audience === "creator",
    );
    return participationState(ctx, args.entryId);
  },
});
export const save = mutation({
  args: {
    ...scope,
    action: participationAction,
    reason: v.string(),
    expectedRevision: v.number(),
    expectedVersion: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject, entry } = await access(
      ctx,
      args.campaignId,
      args.entryId,
      args.action === "withdrawal",
    );
    operationIdentity(args.operationId);
    if (args.action !== "withdrawal") safeText(args.reason, 500);
    else if (args.reason.length > 500)
      throw Error("PARTICIPATION_REASON: Use at most 500 characters");
    const state = await participationState(ctx, entry._id),
      fingerprint = requestFingerprint(args);
    const retry = state.events.find(
      (e) => e.actor === subject && e.operationId === args.operationId,
    );
    if (retry) {
      if (retry.fingerprint !== fingerprint)
        throw Error("PARTICIPATION_RETRY_CONFLICT");
      return retry;
    }
    if (
      state.revision !== args.expectedRevision ||
      entry.version !== args.expectedVersion
    )
      throw Error(
        "PARTICIPATION_REVISION: Review current participation and creative history",
      );
    if (
      args.action.startsWith("fraud-") &&
      args.action !== "fraud-suspend" &&
      !state.fraudHeld
    )
      throw Error("PARTICIPATION_RESOLUTION: No active fraud hold");
    if (args.action === "fraud-suspend" && state.fraudHeld)
      throw Error(
        "PARTICIPATION_RESOLUTION: Resolve the existing hold explicitly",
      );
    if (
      (args.action === "withdrawal" || args.action === "ordinary-removal") &&
      state.cutoff !== null &&
      state.cutoff <= Date.now()
    )
      throw Error(
        "PARTICIPATION_ENDED: The existing earning cutoff is permanent",
      );
    const at = Date.now();
    const id = await ctx.db.insert("participationEvents", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      entryId: entry._id,
      action: args.action,
      reason: args.reason.trim(),
      actor: subject,
      source: "participation:scoped-decision-v1",
      at,
      effectiveAt: at,
      creativeVersion: entry.version,
      revision: state.revision + 1,
      version: 1,
      operationId: args.operationId,
      fingerprint,
    });
    if (args.action === "withdrawal" || args.action === "ordinary-removal")
      await ctx.db.insert("fundraisingCutoffs", {
        entryId: entry._id,
        effectiveAt: at,
        reason: args.action,
        actor: subject,
        source: "participation:scoped-decision-v1",
        at,
        version: 1,
      });
    const stopping = [
      "withdrawal",
      "ordinary-removal",
      "fraud-suspend",
    ].includes(args.action);
    if (stopping) {
      const reservations = await ctx.db
        .query("reservations")
        .withIndex("by_entry", (q) =>
          q.eq("campaignSlug", campaign.slug).eq("entryId", entry._id),
        )
        .collect();
      await ctx.db.insert("participationStopIntents", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        entryId: entry._id,
        eventId: id,
        protocol: args.action === "fraud-suspend" ? "temporary-pause" : "stop",
        status: "pending-provider-confirmation",
        reservedSlots: reservations.length,
        reservedCents: sumCents(reservations.map((r) => r.amountCents)),
        actor: subject,
        source: "participation:stop-intent-v1",
        at,
        version: 1,
      });
    }
    // Resolution never asserts provider stopping or releases existing commitments.
    await recordTrustedIncident(
      ctx,
      {
        campaignId: campaign.slug,
        key: `participation:${entry._id}`,
        kind: "stopping-uncertain",
        sequence: state.revision + 1,
        observedAt: at,
        active: true,
        reason:
          "Participation decision recorded. New advertising allocations remain blocked pending provider confirmation; slots and financial obligations remain reserved.",
        evidence: `Participation event ${id}; T33 provider stop bridge outstanding`,
        resolutionRole: "manager",
      },
      {
        producer: "participation-v1",
        actor: subject,
        synthetic: !!campaign.fixtureRunId,
      },
    );
    return ctx.db.get(id);
  },
});
