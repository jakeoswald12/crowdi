import { v } from "convex/values";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { operationIdentity } from "./access.ts";
import { requestFingerprint } from "./requestFingerprint.ts";
import { paidManager } from "./paidCorrections.ts";
import { competitionInputs, settingsFor } from "./competitionInputs.ts";
import { publicCampaign, projection } from "./publicViewer.ts";
import {
  competitionPeriods,
  rankCompetition,
  type PeriodKind,
} from "./competitionPolicy.ts";
import { publicFinal } from "./prizeFinalization.ts";
import { periodKind } from "./standingsSchema.ts";
import { participationState } from "./participationPolicy.ts";

const selectedArgs = { kind: periodKind, period: v.string() };
async function snapshots(
  ctx: QueryCtx,
  campaignSlug: string,
  kind: PeriodKind,
  period: string,
) {
  return ctx.db
    .query("standingsSnapshots")
    .withIndex("by_period", (q) =>
      q.eq("campaignSlug", campaignSlug).eq("kind", kind).eq("period", period),
    )
    .collect();
}
export const refresh = mutation({
  args: { campaignId: v.string(), ...selectedArgs, operationId: v.string() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId);
    if (campaign.slug !== "adoption")
      throw new Error("FORBIDDEN: Public campaign unavailable");
    operationIdentity(args.operationId);
    const fingerprint = requestFingerprint(args),
      retry = await ctx.db
        .query("standingsRefreshes")
        .withIndex("by_operation", (q) =>
          q
            .eq("campaignSlug", campaign.slug)
            .eq("actor", subject)
            .eq("operationId", args.operationId),
        )
        .unique();
    if (retry) {
      if (retry.requestFingerprint !== fingerprint)
        throw new Error("STANDINGS_RETRY_CONFLICT");
      return retry;
    }
    const { input, snapshotId, outcome } = await recomputeStandings(
      ctx,
      campaign,
      args.kind,
      args.period,
      subject,
    );
    const id = await ctx.db.insert("standingsRefreshes", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      kind: args.kind,
      period: args.period,
      operationId: args.operationId,
      requestFingerprint: fingerprint,
      inputFingerprint: input.inputFingerprint,
      snapshotId,
      outcome,
      actor: subject,
      source: "standings-v1",
      at: Date.now(),
      version: 1,
    });
    return ctx.db.get(id);
  },
});
export async function recomputeStandings(
  ctx: MutationCtx,
  campaign: Doc<"campaigns">,
  kind: PeriodKind,
  period: string,
  actor: string,
) {
  const input = await competitionInputs(ctx, campaign, kind, period),
    previous = (await snapshots(ctx, campaign.slug, kind, period)).at(-1);
  let snapshotId = previous?._id ?? null;
  const outcome: "held" | "stored" | "unchanged" = !input.complete
    ? "held"
    : previous?.inputFingerprint === input.inputFingerprint
      ? "unchanged"
      : "stored";
  if (outcome === "stored") {
    const rules = input.settings.rules,
      targets = kind === "daily" ? rules.dailyTargets : rules.weeklyTargets,
      fixedPrizeCents = input.period.prizeEligible
        ? kind === "daily"
          ? rules.dailyPrizeCents
          : rules.weeklyPrizeCents
        : 0;
    snapshotId = await ctx.db.insert("standingsSnapshots", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      kind: kind,
      period: period,
      inputFingerprint: input.inputFingerprint,
      settingsId: input.settings._id,
      actor,
      source: "standings-v1",
      at: Date.now(),
      version: 1,
      prizeEligible: input.period.prizeEligible,
      fixedPrizeCents,
      rows: rankCompetition(input.rows, targets, fixedPrizeCents).map((r) => ({
        ...r,
        entryId: r.entryId as Doc<"photoEntries">["_id"],
        creativeVersion: input.rows.find((v) => v.entryId === r.entryId)!
          .creativeVersion,
      })),
    });
  }
  return { input, snapshotId, outcome };
}
export const periods = query({
  args: { kind: periodKind },
  handler: async (ctx, { kind }) => {
    const campaign = await publicCampaign(ctx),
      settings = campaign && (await settingsFor(ctx, campaign.slug));
    return settings ? competitionPeriods(settings.rules, kind) : [];
  },
});
export const read = query({
  args: selectedArgs,
  handler: readStandings,
});
export async function readStandings(
  ctx: QueryCtx,
  { kind, period }: { kind: PeriodKind; period: string },
) {
  const campaign = await publicCampaign(ctx);
  if (!campaign) return null;
  const final = await publicFinal(ctx, campaign, kind, period);
  if (final) return final;
  const input = await competitionInputs(ctx, campaign, kind, period),
    snapshot = (await snapshots(ctx, campaign.slug, kind, period)).at(-1);
  let delayed =
    !input.complete ||
    !snapshot ||
    snapshot.inputFingerprint !== input.inputFingerprint;
  // An exclusion invalidates the whole ranking, including surviving ranks and shares.
  // Retain the old snapshot privately, but never publish its excluded counts.
  const eligibilityPending =
    (input.eligibility.length > 0 || input.cutoffAffected) &&
    snapshot?.inputFingerprint !== input.inputFingerprint;
  const rows = [];
  for (const row of eligibilityPending || input.participationHeld
    ? []
    : (snapshot?.rows ?? [])) {
    const entry = await projection(ctx, row.entryId);
    const participation = await participationState(ctx, row.entryId);
    if (
      (!entry && participation.cutoff === null && !participation.fraudHeld) ||
      (entry && entry.version !== row.creativeVersion)
    ) {
      delayed = true;
      continue;
    }
    rows.push({
      entryId: entry ? row.entryId : null,
      title: entry?.title ?? "Previously participating ad",
      creator: entry?.creator ?? "Campaign creator",
      score: row.score,
      rank: row.rank,
      impressions: row.impressions,
      linkClicks: row.linkClicks,
      fundraisingCents: row.fundraisingCents,
      proposedPrizeCents: row.proposedPrizeCents,
    });
  }
  const eligibility = await Promise.all(
    input.eligibility.map(async (notice) => {
      const entry = await projection(ctx, notice.entryId);
      return {
        start: notice.start,
        end: notice.end,
        status: notice.status,
        title: entry?.title ?? "Previously eligible ad",
        entryId: entry ? notice.entryId : null,
      };
    }),
  );
  return {
    kind,
    period: input.period,
    noEligibleActivity: input.complete && input.rows.length === 0,
    allZero:
      !!snapshot &&
      !delayed &&
      snapshot.rows.every(
        (r) =>
          r.impressions === 0 && r.linkClicks === 0 && r.fundraisingCents === 0,
      ),
    eligibility,
    eligibilityPending,
    status: "provisional" as const,
    delayed,
    updatedAt: snapshot?.at ?? null,
    rows,
    targets:
      kind === "daily"
        ? input.settings.rules.dailyTargets
        : input.settings.rules.weeklyTargets,
    fixedPrizeCents: snapshot?.fixedPrizeCents ?? null,
    freshness: input.freshness,
    evidence:
      "Controlled or manager-certified inputs; actual provider validation remains required. Prize proposals await funding and finalization.",
  };
}
export type StandingsResult = Awaited<ReturnType<typeof readStandings>>;
export const history = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign } = await paidManager(ctx, args.campaignId);
    return ctx.db
      .query("standingsRefreshes")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
  },
});
