import { stableRequest } from "./access.ts";
import { requestFingerprint } from "./requestFingerprint.ts";
import type { QueryCtx, Doc } from "./functions.ts";
import { correctionState } from "./paidMetricAuthority.ts";
import { paidWindowProjection } from "./paidMetrics.ts";
import { metricScope } from "./paidCorrections.ts";
import { currentCommission } from "./fundraisingCorrections.ts";
import { sumCents } from "./fundraisingPolicy.ts";
import { approvedEntry } from "./publicViewer.ts";
import { participationState } from "./participationPolicy.ts";
import { competitionPeriods, type PeriodKind } from "./competitionPolicy.ts";
import {
  disqualificationState,
  eligibleRanges,
} from "./disqualificationPolicy.ts";
export async function settingsFor(ctx: QueryCtx, campaignSlug: string) {
  return ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .unique();
}
export async function competitionInputs(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  kind: PeriodKind,
  label: string,
  historical = false,
) {
  const settings = await settingsFor(ctx, campaign.slug);
  if (!settings || settings.nonprofitId !== campaign.nonprofitId)
    throw new Error("STANDINGS_HELD: Campaign rules unavailable");
  const period = competitionPeriods(settings.rules, kind).find(
    (p) => p.label === label,
  );
  if (!period)
    throw new Error("STANDINGS_PERIOD: Select an available Chicago period");
  const disqualifications = await disqualificationState(ctx, campaign.slug);
  const eligibility: {
    entryId: Doc<"photoEntries">["_id"];
    start: number;
    end: number;
    status: string;
  }[] = [];
  const paid = await paidWindowProjection(
      ctx,
      campaign.slug,
      period.inputStart,
      period.inputEnd,
    ),
    corrections = await correctionState(ctx, campaign.slug),
    entries = (
      await ctx.db
        .query("photoEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect()
    ).filter(
      (e) =>
        e.nonprofitId === campaign.nonprofitId &&
        e.firstApprovedAt !== undefined &&
        e.firstApprovedAt < period.inputEnd,
    ),
    donations = (
      await ctx.db
        .query("fundraisingDonations")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect()
    ).filter(
      (d) =>
        d.nonprofitId === campaign.nonprofitId &&
        d.eligible &&
        d.completedAt >= period.inputStart &&
        d.completedAt < period.inputEnd,
    ),
    rows = [],
    evidence = [],
    missing: string[] = [];
  let complete = true;
  let participationHeld = false;
  let cutoffAffected = false;
  let eligibleEntryCount = 0;
  for (const entry of entries) {
    // Historical snapshots never confer present public visibility.
    const cutoffs = await ctx.db
      .query("fundraisingCutoffs")
      .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
      .collect();
    const cutoff = Math.min(Infinity, ...cutoffs.map((c) => c.effectiveAt));
    cutoffAffected ||= cutoff < period.inputEnd;
    if (cutoff <= period.inputStart) {
      // Historical finalization/correction retains its independent affirmative
      // empty-inventory authority gate. Provisional hiding cannot replace it.
      if (!historical)
        evidence.push({ entryId: entry._id, cutoffs, excluded: true });
      continue;
    }
    const beforeCutoff = cutoff < period.inputEnd;
    const eligibleEnd = beforeCutoff ? cutoff : period.inputEnd;
    const participation = await participationState(ctx, entry._id);
    if (participation.events.length)
      evidence.push({ entryId: entry._id, participation });
    const selectedDecisions = disqualifications.decisions.filter(
      (d) =>
        d.nonprofitId === campaign.nonprofitId &&
        d.entryIds.includes(entry._id) &&
        d.start < eligibleEnd &&
        d.end > period.inputStart,
    );
    const eligibilityScope = eligibleRanges(
      selectedDecisions,
      entry._id,
      period.inputStart,
      eligibleEnd,
    );
    if (eligibilityScope.affected)
      eligibility.push(
        ...selectedDecisions.map((d) => ({
          entryId: entry._id,
          start: Math.max(d.start, period.inputStart),
          end: Math.min(d.end, eligibleEnd),
          status: "Selected activity ineligible",
        })),
      );
    if (eligibilityScope.affected && eligibilityScope.ranges.length === 0) {
      evidence.push({
        entryId: entry._id,
        disqualifications: selectedDecisions.map(
          ({ recomputations, ...decision }) => decision,
        ),
        excluded: true,
      });
      continue;
    }
    eligibleEntryCount++;
    if (participation.fraudHeld) {
      complete = false;
      participationHeld = true;
      missing.push(
        `${entry._id}: temporary fraud review holds this unfinalized period`,
      );
    }
    const visible = await approvedEntry(ctx, entry._id);
    if (
      !historical &&
      !visible &&
      !Number.isFinite(cutoff) &&
      !participation.fraudHeld
    ) {
      complete = false;
      evidence.push({ entryId: entry._id, hidden: true });
      missing.push(`${entry._id}: currently approved creative unavailable`);
      continue;
    }
    // A whole-day count cannot establish a partial-day count. Reuse the exact
    // scope resolver so affirmative pre-withdrawal coverage can clear the hold.
    const cutoffMetrics = beforeCutoff
      ? {
          impressions: await metricScope(
            ctx,
            campaign.slug,
            entry._id,
            "impressions",
            period.inputStart,
            eligibleEnd,
          ),
          linkClicks: await metricScope(
            ctx,
            campaign.slug,
            entry._id,
            "linkClicks",
            period.inputStart,
            eligibleEnd,
          ),
        }
      : null;
    const retainedMetrics = eligibilityScope.affected
      ? await Promise.all(
          eligibilityScope.ranges.map(async (range) => ({
            range,
            impressions: await metricScope(
              ctx,
              campaign.slug,
              entry._id,
              "impressions",
              range.start,
              range.end,
            ),
            linkClicks: await metricScope(
              ctx,
              campaign.slug,
              entry._id,
              "linkClicks",
              range.start,
              range.end,
            ),
          })),
        )
      : null;
    const periodMetric = paid.entries.find((e) => e.entryId === entry._id);
    const metric = retainedMetrics
        ? {
            impressions: retainedMetrics.every(
              (p) => p.impressions.complete && p.impressions.value !== null,
            )
              ? sumCents(retainedMetrics.map((p) => p.impressions.value!))
              : null,
            linkClicks: retainedMetrics.every(
              (p) => p.linkClicks.complete && p.linkClicks.value !== null,
            )
              ? sumCents(retainedMetrics.map((p) => p.linkClicks.value!))
              : null,
            complete: retainedMetrics.every(
              (p) => p.impressions.complete && p.linkClicks.complete,
            ),
            coverage: periodMetric?.coverage ?? [],
          }
        : cutoffMetrics
          ? {
              impressions: cutoffMetrics.impressions.value,
              linkClicks: cutoffMetrics.linkClicks.value,
              complete:
                cutoffMetrics.impressions.complete &&
                cutoffMetrics.linkClicks.complete,
              coverage:
                periodMetric?.coverage.filter(
                  (c) => c.day.start < eligibleEnd,
                ) ?? [],
            }
          : periodMetric,
      selected = donations.filter((d) => d.originEntryId === entry._id),
      current = await Promise.all(
        selected.map((d) => currentCommission(ctx, d)),
      ),
      ledgerFundraisingCents = sumCents(
        current.map((d) => d.eligibleGrossCents),
      ),
      fundraisingCents = sumCents(
        current
          .filter((_, index) =>
            eligibilityScope.ranges.some(
              (r) =>
                selected[index].completedAt >= r.start &&
                selected[index].completedAt < r.end,
            ),
          )
          .map((d) => d.eligibleGrossCents),
      ),
      periods = await ctx.db
        .query("fundraisingPeriodResults")
        .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
        .collect(),
      fundraising = periods
        .filter(
          (p) =>
            p.nonprofitId === campaign.nonprofitId &&
            p.campaignSlug === campaign.slug &&
            p.periodKind === kind &&
            p.period === label,
        )
        .at(-1);
    // A trusted period record is affirmative evidence, including an explicit zero.
    // Neither a manager refresh nor absence of donations establishes that zero.
    let fundraisingComplete =
      !!fundraising &&
      fundraising.eligibleGrossCents === ledgerFundraisingCents &&
      stableRequest([...fundraising.donationIds].sort()) ===
        stableRequest(selected.map((d) => d._id).sort());
    const refundReads = [];
    for (const donation of selected) {
      const reads = await ctx.db
        .query("fundraisingRefundReads")
        .withIndex("by_checkout", (q) =>
          q.eq("checkoutId", donation.checkoutId),
        )
        .collect();
      const latest = reads.sort((a, b) => b.generation - a.generation)[0];
      if (latest && latest.applied !== true) fundraisingComplete = false;
      refundReads.push({
        donationId: donation._id,
        latest: latest ?? null,
        current: current[selected.indexOf(donation)],
      });
    }
    if (
      !metric?.complete ||
      metric.impressions === null ||
      metric.linkClicks === null
    ) {
      if (eligibilityScope.affected)
        missing.push(
          `${entry._id}: exact retained metric eligibility coverage required after disqualification`,
        );
      if (beforeCutoff)
        missing.push(
          `${entry._id}: exact before-cutoff metric eligibility coverage required`,
        );
      missing.push(
        `${entry._id}: impressions/linkClicks required source/metric coverage incomplete`,
      );
      for (const c of metric?.coverage ?? [])
        if (!c.complete) {
          for (const source of c.input?.coverage ?? [])
            if (!source.complete)
              missing.push(
                `${entry._id}: ${c.day.label} source ${source.sourceId} metric ${source.metric}: ${source.reason}`,
              );
        }
    }
    if (!fundraisingComplete)
      missing.push(
        `${entry._id}: FUNDRAISING confirmed principal/complete ledger or canonical refund coverage missing`,
      );
    complete &&=
      !!metric?.complete &&
      metric.impressions !== null &&
      metric.linkClicks !== null &&
      fundraisingComplete;
    evidence.push({
      entryId: entry._id,
      eligibility:
        historical || cutoffs.length
          ? { start: period.inputStart, end: eligibleEnd, cutoffs }
          : null,
      cutoffMetrics,
      disqualifications: selectedDecisions.map(
        ({ recomputations, ...decision }) => decision,
      ),
      retainedMetrics,
      creativeVersion: entry.version,
      createdAt: entry.createdAt,
      metric: metric
        ? {
            impressions: metric.impressions,
            linkClicks: metric.linkClicks,
            complete: metric.complete,
            coverage: metric.coverage.map((c) => ({
              day: c.day,
              inputs:
                c.input?.coverage.map((v) => ({
                  sourceId: v.sourceId,
                  mappingId: v.mappingId,
                  metric: v.metric,
                  coverageId: v.coverageId,
                  operationId: v.operationId,
                  inputRevision: v.inputRevision,
                  generation: v.generation,
                  value: v.value,
                  complete: v.complete,
                  dataAsOf: v.dataAsOf,
                })) ?? null,
            })),
          }
        : null,
      fundraising: fundraising ?? null,
      refundReads,
    });
    if (
      metric?.complete &&
      metric.impressions !== null &&
      metric.linkClicks !== null &&
      fundraisingComplete
    )
      rows.push({
        entryId: entry._id,
        creativeVersion: entry.version,
        createdAt: entry.createdAt,
        impressions: metric.impressions,
        linkClicks: metric.linkClicks,
        fundraisingCents,
      });
  }
  complete &&= evidence.length > 0 && rows.length === eligibleEntryCount;
  const inputFingerprint = requestFingerprint({
    settings,
    period,
    evidence,
    paidCorrectionRevision: corrections.revision,
  });
  const coverages = paid.entries.flatMap((e) =>
      e.coverage.flatMap((c) => c.input?.coverage ?? []),
    ),
    sourceIds = [...new Set(coverages.map((c) => c.sourceId))],
    sources = await Promise.all(sourceIds.map((id) => ctx.db.get(id))),
    lastSuccesses = sources.map((s) => s?.lastSuccess ?? null),
    dataTimes = coverages.map((c) => c.latestDataAsOf),
    now =
      campaign.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
        ? (campaign.fixturePaidNow ?? Date.now())
        : Date.now();
  const scopedCorrections = corrections.corrections.filter(
    (c) =>
      c.start < period.inputEnd &&
      c.end > period.inputStart &&
      entries.some((e) => e._id === c.entryId),
  );
  const scopedCorrectionIds = new Set(scopedCorrections.map((c) => c._id));
  return {
    settings,
    period,
    eligibility,
    participationHeld,
    cutoffAffected,
    rows,
    complete,
    missing,
    evidence,
    paidSourceSnapshot: sources,
    paidCorrectionSnapshot: {
      corrections: scopedCorrections,
      events: corrections.events.filter((e) =>
        scopedCorrectionIds.has(e.correctionId),
      ),
    },
    inputFingerprint,
    freshness: {
      lastSuccessfulImport:
        lastSuccesses.length && lastSuccesses.every((v) => v !== null)
          ? Math.min(...(lastSuccesses as number[]))
          : null,
      dataAsOf:
        dataTimes.length && dataTimes.every((v) => v !== null)
          ? Math.min(...(dataTimes as number[]))
          : null,
      reportingDelayMs:
        dataTimes.length && dataTimes.every((v) => v !== null)
          ? Math.max(0, now - Math.min(...(dataTimes as number[])))
          : null,
    },
  };
}
