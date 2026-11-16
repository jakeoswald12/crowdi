import { bonusLedger } from "./bonusLedger.ts";
import { currentBonusCorrection } from "./bonusCorrections.ts";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  internalMutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { competitionInputs, settingsFor } from "./competitionInputs.ts";
import { competitionPeriods, rankCompetition } from "./competitionPolicy.ts";
import {
  finalizationDelay,
  nextPrizeBatch,
  recoveryCadence,
} from "./finalizationPolicy.ts";
import { prizeCoverage, prizeNow } from "./prizeFunds.ts";
import { paidManager } from "./paidCorrections.ts";
import { recordTrustedFinalizedFundraising } from "./fundraisingCorrections.ts";
import { recordTrustedIncident, safeText } from "./operatorIncidents.ts";
import { projection, unnamedCreator } from "./publicViewer.ts";
import { sumCents } from "./fundraisingPolicy.ts";

// An empty eligible inventory requires an affirmative exact-period source read.
// Its fingerprint expires on changed rules, entry inventory or metric authority.
export async function recordTrustedEmptyCompetitionPeriod(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  input: {
    kind: "daily" | "weekly";
    period: string;
    inputFingerprint: string;
    evidence: string;
  },
  provenance: { actor: string; synthetic: boolean },
) {
  const authority = await authorityFor(ctx, c);
  const current = await competitionInputs(
    ctx,
    c,
    input.kind,
    input.period,
    true,
  );
  if (
    !authority ||
    authority.nonprofitId !== c.nonprofitId ||
    authority.settingsId !== current.settings._id ||
    provenance.synthetic !== authority.synthetic ||
    (provenance.synthetic &&
      c.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID) ||
    (await prizeNow(ctx, c)) < current.period.end ||
    current.evidence.length !== 0 ||
    current.inputFingerprint !== input.inputFingerprint ||
    !current.period.prizeEligible
  )
    throw new Error("COMPETITION_EMPTY_SCOPE_OR_REVISION");
  safeText(input.evidence, 200);
  safeText(provenance.actor, 128);
  return ctx.db.insert("competitionEmptyCoverage", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    settingsId: current.settings._id,
    authorityId: authority._id,
    sourceRevision: authority.sourceRevision,
    ...input,
    ...provenance,
    at: Date.now(),
  });
}

const wakeRef = makeFunctionReference<
  "mutation",
  { workId: string; generation: number }
>("prizeFinalization:wake");
const readinessRef = makeFunctionReference<"mutation", { campaignId: string }>(
  "readiness:refreshPrize",
);
async function authorityFor(ctx: QueryCtx, c: Doc<"campaigns">) {
  return ctx.db
    .query("competitionAuthorities")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .unique();
}
// Nonregistered owner boundary. Activation/source validation is distinct from
// manager publication and financial evidence. Actual #12/#20/#21 remain held.
export async function recordTrustedCompetitionAuthority(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  input: {
    settingsId: Doc<"campaignSettings">["_id"];
    sourceRevision: string;
    evidence: string;
  },
  provenance: { actor: string; synthetic: boolean },
) {
  const settings = await ctx.db.get(input.settingsId);
  if (
    !settings ||
    settings.campaignSlug !== c.slug ||
    settings.nonprofitId !== c.nonprofitId ||
    provenance.synthetic !== !!c.fixtureRunId ||
    (c.fixtureRunId &&
      c.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
  )
    throw new Error("COMPETITION_AUTHORITY_SCOPE");
  safeText(input.sourceRevision, 120);
  safeText(input.evidence, 200);
  safeText(provenance.actor, 128);
  const previous = await authorityFor(ctx, c);
  if (previous) {
    if (
      previous.settingsId !== input.settingsId ||
      previous.sourceRevision !== input.sourceRevision ||
      previous.synthetic !== provenance.synthetic
    )
      throw new Error("COMPETITION_AUTHORITY_CONFLICT");
    return previous._id;
  }
  const id = await ctx.db.insert("competitionAuthorities", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    ...input,
    ...provenance,
    at: Date.now(),
  });
  await ensureCompetitionSchedule(ctx, c);
  return id;
}
export async function ensureCompetitionSchedule(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
) {
  const settings = await settingsFor(ctx, c.slug);
  if (!settings) return;
  if (c.fixtureRunId && !(await authorityFor(ctx, c))) return;
  const head = await ctx.db
    .query("competitionScheduleHeads")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .unique();
  if (head) {
    if (head.settingsId !== settings._id || head.nonprofitId !== c.nonprofitId)
      throw new Error("COMPETITION_SCHEDULE_SCOPE");
    return;
  }
  let periodCount = 0;
  for (const kind of ["daily", "weekly"] as const)
    for (const p of competitionPeriods(settings.rules, kind).filter(
      (p) => p.prizeEligible,
    )) {
      periodCount++;
      const existing = await ctx.db
        .query("competitionWork")
        .withIndex("by_period", (q) =>
          q.eq("campaignSlug", c.slug).eq("kind", kind).eq("period", p.label),
        )
        .unique();
      if (existing) continue;
      const deadline = p.end + finalizationDelay;
      const workId = await ctx.db.insert("competitionWork", {
        campaignSlug: c.slug,
        nonprofitId: c.nonprofitId,
        settingsId: settings._id,
        kind,
        period: p.label,
        start: p.start,
        end: p.end,
        deadline,
        active: true,
        nextAt: deadline,
        generation: 0,
        attempts: 0,
        state: "pending",
        missing: [],
      });
      if (!c.fixtureRunId)
        await ctx.scheduler.runAt(Math.max(Date.now(), deadline), wakeRef, {
          workId,
          generation: 0,
        });
    }
  await ctx.db.insert("competitionScheduleHeads", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    settingsId: settings._id,
    periodCount,
    initializedAt: Date.now(),
  });
}
async function notice(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  w: Doc<"competitionWork">,
  active: boolean,
  reason: string,
) {
  const key = `finalization:${w._id}`;
  const head = await ctx.db
    .query("incidentHeads")
    .withIndex("by_stream", (q) => q.eq("campaignSlug", c.slug).eq("key", key))
    .unique();
  if (!active && !head) return;
  const text = reason.slice(0, 500);
  // The work record already counts every recovery check. An unchanged hold is
  // one open incident, not another evidence row each cadence for every period.
  if (active && head?.incidentId) {
    const open = await ctx.db.get(head.incidentId);
    if (open?.status === "open" && open.reason === text) return;
  }
  await recordTrustedIncident(
    ctx,
    {
      campaignId: c.slug,
      key,
      kind: "prize-finalization",
      sequence: (head?.sequence ?? 0) + 1,
      observedAt: Date.now(),
      active,
      reason: text,
      evidence: `${w.kind} ${w.period}; deadline ${w.deadline}; current source/rules revision retained privately`,
      resolutionRole: "manager",
    },
    {
      producer: "competition-finalization-v1",
      actor: "competition-finalizer",
      synthetic: !!c.fixtureRunId,
    },
  );
}
// All reads, coverage checks, snapshot, promise conversion and liabilities commit
// in ONE OCC transaction. No external lease can strand a half-created award.
export async function advanceCompetitionPeriod(
  ctx: MutationCtx,
  workId: Doc<"competitionWork">["_id"],
  generation?: number,
) {
  const w = await ctx.db.get(workId);
  if (
    !w ||
    !w.active ||
    (generation !== undefined && generation !== w.generation)
  )
    return;
  const c = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", w.campaignSlug))
    .unique();
  if (!c || c.nonprofitId !== w.nonprofitId) return;
  const now = await prizeNow(ctx, c);
  if (now < w.deadline) return;
  const authority = await authorityFor(ctx, c),
    missing: string[] = [];
  const controlled =
    !!c.fixtureRunId &&
    c.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID;
  if (
    !authority ||
    authority.settingsId !== w.settingsId ||
    authority.nonprofitId !== c.nonprofitId ||
    authority.synthetic !== controlled
  )
    missing.push(
      "Trusted competition activation and required-source authority unavailable",
    );
  if (!controlled)
    missing.push(
      "Actual paid competition activation and provider coverage authority #12/#20/#21 remain held",
    );
  const input = await competitionInputs(ctx, c, w.kind, w.period, true);
  const emptyCoverage = (
    await ctx.db
      .query("competitionEmptyCoverage")
      .withIndex("by_period", (q) =>
        q.eq("campaignSlug", c.slug).eq("kind", w.kind).eq("period", w.period),
      )
      .collect()
  ).at(-1);
  const complete =
    input.complete ||
    (input.evidence.length === 0 &&
      !!emptyCoverage &&
      emptyCoverage.authorityId === authority?._id &&
      emptyCoverage.settingsId === w.settingsId &&
      emptyCoverage.inputFingerprint === input.inputFingerprint &&
      emptyCoverage.sourceRevision === authority?.sourceRevision);
  if (!complete)
    missing.push(
      ...(input.missing.length
        ? input.missing
        : ["Affirmative complete eligible-entry/source inventory unavailable"]),
    );
  const allZero =
    complete &&
    input.rows.every(
      (r) =>
        r.impressions === 0 && r.linkClicks === 0 && r.fundraisingCents === 0,
    );
  const rules = input.settings.rules,
    fixedPrizeCents =
      w.kind === "daily" ? rules.dailyPrizeCents : rules.weeklyPrizeCents;
  // A no-award period releases its promise without requiring cash or moving it.
  const coverage =
    !allZero && fixedPrizeCents > 0 ? await prizeCoverage(ctx, c) : null;
  if (coverage && !coverage.covered)
    missing.push(
      coverage.coverageReason ?? "Protected prize promise is not funded",
    );
  const ranked = rankCompetition(
      input.rows,
      w.kind === "daily" ? rules.dailyTargets : rules.weeklyTargets,
      allZero ? 0 : fixedPrizeCents,
    ),
    rows = [];
  for (const r of ranked) {
    const entry = await ctx.db.get(r.entryId as Doc<"photoEntries">["_id"]);
    if (!entry) throw new Error("COMPETITION_ENTRY_MISSING");
    const approvals = (
      await ctx.db
        .query("photoEvents")
        .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
        .collect()
    )
      .filter((e) => e.action === "approved")
      .sort((a, b) => b.version - a.version);
    const approved = approvals[0];
    const copy =
      approved &&
      (await ctx.db
        .query("photoVersions")
        .withIndex("by_entry_version", (q) =>
          q.eq("entryId", entry._id).eq("version", approved.version),
        )
        .unique());
    if (!copy) {
      missing.push(
        `${entry._id}: approved historical creative version missing`,
      );
      continue;
    }
    rows.push({
      ...r,
      entryId: entry._id,
      creativeVersion: copy.version,
      creator: entry.subject,
      title: copy.title,
      publicCreator:
        copy.publicCreatorName || unnamedCreator(c._id, entry.subject),
      winner: !allZero && r.rank === 1,
      awardCents: r.proposedPrizeCents,
    });
  }
  if (missing.length) {
    await ctx.db.patch(w._id, {
      state: "held",
      missing,
      checkedAt: now,
      attempts: w.attempts + 1,
      nextAt: now + recoveryCadence,
    });
    await notice(ctx, c, w, true, missing.join("; "));
    return;
  }
  const existing = await ctx.db
    .query("competitionFinals")
    .withIndex("by_period", (q) =>
      q.eq("campaignSlug", c.slug).eq("kind", w.kind).eq("period", w.period),
    )
    .unique();
  if (existing) throw new Error("COMPETITION_INCONSISTENT_WORK");
  const immutableRows = rows.map(({ proposedPrizeCents, ...r }) => r);
  const snapshotId = await ctx.db.insert("competitionFinals", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    workId: w._id,
    settingsId: w.settingsId,
    kind: w.kind,
    period: w.period,
    start: w.start,
    end: w.end,
    deadline: w.deadline,
    finalizedAt: now,
    actor: "competition-finalizer",
    source: "competition-finalization-v1",
    version: 1,
    synthetic: controlled,
    authorityId: authority!._id,
    inputFingerprint: input.inputFingerprint,
    inputSnapshot: JSON.stringify({
      entries: input.evidence,
      paidSources: input.paidSourceSnapshot,
      paidCorrections: input.paidCorrectionSnapshot,
      emptyCoverage: emptyCoverage ?? null,
      authority,
    }),
    fundingRevision: coverage?.revision ?? null,
    fundingSnapshot: coverage
      ? JSON.stringify({
          revision: coverage.revision,
          evidence: coverage.evidence,
          balances: coverage.balances,
          remainingPromiseCents: coverage.remainingPromiseCents,
          unpaidPrizeCents: coverage.unpaidPrizeCents,
          requiredCents: coverage.requiredCents,
        })
      : null,
    rules,
    fixedPrizeCents,
    awardedCents: sumCents(rows.map((r) => r.awardCents)),
    allZero,
    rows: immutableRows,
    freshness: input.freshness,
  });
  for (const r of rows.filter((r) => r.awardCents > 0)) {
    const obligationId = await ctx.db.insert("prizeLiabilities", {
      campaignSlug: c.slug,
      nonprofitId: c.nonprofitId,
      snapshotId,
      entryId: r.entryId,
      creator: r.creator,
      kind: w.kind,
      period: w.period,
      amountCents: r.awardCents,
      currency: "USD",
      finalizedAt: now,
      batchEligibleAt: nextPrizeBatch(now),
      eligibility: "finalized",
      state: "unpaid",
      source: "competition-finalization-v1",
      version: 1,
    });
    await recordTrustedFinalizedFundraising(
      ctx,
      {
        entryId: r.entryId,
        periodKind: w.kind,
        period: w.period,
        resultId: `${snapshotId}:${r.entryId}`,
        originalGrossCents: r.fundraisingCents,
        winner: r.creator,
        prizeObligationId: obligationId,
        fixedPrizeCents: r.awardCents,
        currency: "usd",
      },
      {
        actor: "competition-finalizer",
        source: "competition-finalization-v1",
        evidence: `Immutable result ${snapshotId}; source ${input.inputFingerprint}`,
        synthetic: controlled,
      },
    );
  }
  await ctx.db.patch(w._id, {
    active: false,
    state: "finalized",
    missing: [],
    checkedAt: now,
    attempts: w.attempts + 1,
    snapshotId,
  });
  await ctx.scheduler.runAfter(0, readinessRef, { campaignId: c.slug });
  await notice(
    ctx,
    c,
    w,
    false,
    "Complete period finalized once; unpaid prize liabilities reserved for the next preparation cutoff",
  );
}
export const wake = internalMutation({
  args: { workId: v.id("competitionWork"), generation: v.number() },
  handler: (ctx, { workId, generation }) =>
    advanceCompetitionPeriod(ctx, workId, generation),
});

// One global recovery clock; completed periods never enqueue another job.
export async function recoverCompetition(ctx: MutationCtx) {
  const campaigns = await ctx.db.query("campaigns").collect();
  let scheduled = 0;
  for (const c of campaigns) {
    if (c.fixtureRunId && !(await authorityFor(ctx, c))) continue;
    await ensureCompetitionSchedule(ctx, c);
    const now = await prizeNow(ctx, c);
    const due = await ctx.db
      .query("competitionWork")
      .withIndex("by_due", (q) =>
        q.eq("campaignSlug", c.slug).eq("active", true).lte("nextAt", now),
      )
      .collect();
    for (const w of due) {
      const generation = w.generation + 1;
      await ctx.db.patch(w._id, { generation, nextAt: now + recoveryCadence });
      await ctx.scheduler.runAfter(0, wakeRef, { workId: w._id, generation });
      scheduled++;
    }
  }
  return { scheduled, cadenceMs: recoveryCadence };
}
export const recover = internalMutation({
  args: {},
  handler: recoverCompetition,
});

export async function unpaidPrizeLiabilities(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  cutoff: number,
) {
  const ledger = await bonusLedger(ctx, c);
  return (
    await ctx.db
      .query("prizeLiabilities")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter(
    (l) =>
      l.nonprofitId === c.nonprofitId &&
      !ledger.paid.has(l._id) &&
      !ledger.retired.has(l._id) &&
      l.state === "unpaid" &&
      l.batchEligibleAt <= cutoff,
  );
}
export const inspect = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await paidManager(ctx, campaignId);
    return {
      schedule: await ctx.db
        .query("competitionScheduleHeads")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .unique(),
      cadenceMs: recoveryCadence,
      productionAuthority: "held",
      work: await ctx.db
        .query("competitionWork")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
      snapshots: await ctx.db
        .query("competitionFinals")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
      liabilities: await unpaidPrizeLiabilities(
        ctx,
        campaign,
        Number.MAX_SAFE_INTEGER,
      ),
      discrepancies: await ctx.db
        .query("competitionDiscrepancies")
        .filter((q) =>
          q.and(
            q.eq(q.field("campaignSlug"), campaign.slug),
            q.eq(q.field("nonprofitId"), campaign.nonprofitId),
          ),
        )
        .collect(),
    };
  },
});

export async function publicFinal(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  kind: "daily" | "weekly",
  period: string,
) {
  const snapshot = await ctx.db
    .query("competitionFinals")
    .withIndex("by_period", (q) =>
      q.eq("campaignSlug", c.slug).eq("kind", kind).eq("period", period),
    )
    .unique();
  if (!snapshot || snapshot.nonprofitId !== c.nonprofitId) return null;
  const correction = await currentBonusCorrection(ctx, snapshot._id);
  const correctionHistory = correction
    ? await ctx.db
        .query("bonusCorrections")
        .withIndex("by_snapshot", (q) => q.eq("snapshotId", snapshot._id))
        .collect()
    : [];
  const publicHistory = [];
  for (const version of [
    {
      version: 0,
      at: snapshot.finalizedAt,
      rows: snapshot.rows,
      freshness: snapshot.freshness,
    },
    ...correctionHistory,
  ]) {
    const winners = [];
    for (const row of version.rows.filter((r) => r.winner)) {
      const current = await projection(ctx, row.entryId),
        visible = !!current && current.version === row.creativeVersion;
      winners.push({
        entryId: visible ? row.entryId : null,
        title: visible
          ? row.title
          : "Previously eligible ad · creative unavailable",
        creator: visible ? row.publicCreator : "Campaign participant",
        amountCents: row.awardCents,
      });
    }
    publicHistory.push({
      version: version.version,
      at: version.at,
      managerLabel: version.version
        ? "Campaign manager"
        : "Automatic finalization",
      winners,
      freshness: version.freshness,
    });
  }
  const rows = [];
  for (const row of correction?.rows ?? snapshot.rows) {
    const current = await projection(ctx, row.entryId),
      visible = !!current && current.version === row.creativeVersion;
    rows.push({
      entryId: visible ? row.entryId : null,
      title: visible
        ? row.title
        : "Previously eligible ad · creative unavailable",
      creator: visible ? row.publicCreator : "Campaign participant",
      score: row.score,
      rank: row.rank,
      impressions: row.impressions,
      linkClicks: row.linkClicks,
      fundraisingCents: row.fundraisingCents,
      proposedPrizeCents: row.awardCents,
      winner: row.winner,
    });
  }
  const p = competitionPeriods(snapshot.rules, kind).find(
    (p) => p.label === period,
  )!;
  return {
    kind,
    period: p,
    status: "final" as const,
    noEligibleActivity: rows.length === 0,
    delayed: false,
    updatedAt: correction?.at ?? snapshot.finalizedAt,
    rows,
    correctionHistory: correction ? publicHistory : [],
    targets:
      kind === "daily"
        ? snapshot.rules.dailyTargets
        : snapshot.rules.weeklyTargets,
    fixedPrizeCents: snapshot.fixedPrizeCents,
    freshness: correction?.freshness ?? snapshot.freshness,
    evidence: correction
      ? `${correction.synthetic ? "Controlled corrected result; actual provider validation remains held" : "Corrected finalized performance-bonus result"} · correction ${correction.version}. Payment is handled separately.`
      : snapshot.synthetic
        ? "Controlled finalized result; actual provider validation remains held. Payment is handled separately."
        : "Finalized result. Payment is handled separately.",
    allZero: correction?.allZero ?? snapshot.allZero,
  };
}

// Ordinary later imports/certifications are observations, never rescore authority.
export async function noteFinalizedMetricChange(
  ctx: MutationCtx,
  campaignSlug: string,
  entryId: Doc<"photoEntries">["_id"],
  start: number,
  end: number,
  source: string,
) {
  const snapshots = await ctx.db
    .query("competitionFinals")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .collect();
  for (const s of snapshots.filter((s) => s.start < end && s.end > start)) {
    const corrected = await currentBonusCorrection(ctx, s._id);
    if (
      !s.rows.some((r) => r.entryId === entryId) &&
      !corrected?.rows.some((r) => r.entryId === entryId)
    )
      continue;
    await ctx.db.insert("competitionDiscrepancies", {
      campaignSlug,
      nonprofitId: s.nonprofitId,
      snapshotId: s._id,
      entryId,
      source,
      start,
      end,
      at: Date.now(),
      version: 1,
    });
    const head = await ctx.db
      .query("incidentHeads")
      .withIndex("by_stream", (q) =>
        q.eq("campaignSlug", campaignSlug).eq("key", `metric-final:${s._id}`),
      )
      .unique();
    await recordTrustedIncident(
      ctx,
      {
        campaignId: campaignSlug,
        key: `metric-final:${s._id}`,
        kind: "prize-finalization",
        sequence: (head?.sequence ?? 0) + 1,
        observedAt: Date.now(),
        active: true,
        reason:
          "Later metric evidence overlaps a finalized period. Original winners and unpaid prizes remain unchanged; explicit correction owner review required.",
        evidence: `${source}; immutable snapshot ${s._id}`,
        resolutionRole: "manager",
      },
      {
        producer: "competition-finalization-v1",
        actor: "competition-finalizer",
        synthetic: s.synthetic,
      },
    );
  }
}
