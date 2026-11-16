import { v } from "convex/values";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { paidManager } from "./paidCorrections.ts";
import { operationIdentity, stableRequest } from "./access.ts";
import { requestFingerprint as hash } from "./requestFingerprint.ts";
import { competitionInputs } from "./competitionInputs.ts";
import { rankCompetition } from "./competitionPolicy.ts";
import { bonusLedger } from "./bonusLedger.ts";
import { sumCents } from "./fundraisingPolicy.ts";
import { recordTrustedFinalizedFundraising } from "./fundraisingCorrections.ts";
import { prizeCoverage, prizeNow } from "./prizeFunds.ts";
import { nextPrizeBatch } from "./finalizationPolicy.ts";
import { recordTrustedIncident, safeText } from "./operatorIncidents.ts";
import { unnamedCreator } from "./publicViewer.ts";

const scope = { campaignId: v.string(), snapshotId: v.id("competitionFinals") };
export async function currentBonusCorrection(
  ctx: QueryCtx,
  snapshotId: Doc<"competitionFinals">["_id"],
) {
  return await ctx.db
    .query("bonusCorrections")
    .withIndex("by_snapshot", (q) => q.eq("snapshotId", snapshotId))
    .order("desc")
    .first();
}
async function previewFor(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  snapshotId: Doc<"competitionFinals">["_id"],
  actor: string,
) {
  const original = await ctx.db.get(snapshotId);
  if (
    !original ||
    original.campaignSlug !== c.slug ||
    original.nonprofitId !== c.nonprofitId
  )
    throw Error("FORBIDDEN: Finalized performance bonus unavailable");
  const current = await currentBonusCorrection(ctx, snapshotId),
    input = await competitionInputs(
      ctx,
      c,
      original.kind,
      original.period,
      true,
    ),
    ledger = await bonusLedger(ctx, c),
    funding = await prizeCoverage(ctx, c);
  if (input.settings._id !== original.settingsId)
    throw Error("BONUS_CORRECTION_RULES_CHANGED");
  const emptyCoverage = (
    await ctx.db
      .query("competitionEmptyCoverage")
      .withIndex("by_period", (q) =>
        q
          .eq("campaignSlug", c.slug)
          .eq("kind", original.kind)
          .eq("period", original.period),
      )
      .collect()
  ).at(-1);
  const authority = await ctx.db.get(original.authorityId);
  const complete =
    input.complete ||
    (input.evidence.length === 0 &&
      !!emptyCoverage &&
      emptyCoverage.nonprofitId === c.nonprofitId &&
      emptyCoverage.authorityId === original.authorityId &&
      emptyCoverage.settingsId === original.settingsId &&
      emptyCoverage.inputFingerprint === input.inputFingerprint &&
      emptyCoverage.sourceRevision === authority?.sourceRevision &&
      input.period.prizeEligible);
  const allZero = input.rows.every(
    (r) =>
      r.impressions === 0 && r.linkClicks === 0 && r.fundraisingCents === 0,
  );
  const corrected: Doc<"competitionFinals">["rows"] = [];
  for (const r of rankCompetition(
    input.rows,
    original.kind === "daily"
      ? original.rules.dailyTargets
      : original.rules.weeklyTargets,
    allZero ? 0 : original.fixedPrizeCents,
  )) {
    const entry = await ctx.db.get(r.entryId as Doc<"photoEntries">["_id"]);
    if (
      !entry ||
      entry.campaignSlug !== c.slug ||
      entry.nonprofitId !== c.nonprofitId
    )
      throw Error("BONUS_CORRECTION_ENTRY_SCOPE");
    const approved = (
      await ctx.db
        .query("photoEvents")
        .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
        .collect()
    )
      .filter((e) => e.action === "approved")
      .sort((a, b) => b.version - a.version)[0];
    const copy =
      approved &&
      (await ctx.db
        .query("photoVersions")
        .withIndex("by_entry_version", (q) =>
          q.eq("entryId", entry._id).eq("version", approved.version),
        )
        .unique());
    if (!copy) throw Error("BONUS_CORRECTION_CREATIVE_MISSING");
    const { proposedPrizeCents, ...row } = r;
    corrected.push({
      ...row,
      entryId: entry._id,
      creativeVersion: copy.version,
      creator: entry.subject,
      title: copy.title,
      publicCreator:
        copy.publicCreatorName || unnamedCreator(c._id, entry.subject),
      winner: !allZero && r.rank === 1,
      awardCents: proposedPrizeCents,
    });
  }
  const liabilities = await ctx.db
    .query("prizeLiabilities")
    .withIndex("by_snapshot", (q) => q.eq("snapshotId", snapshotId))
    .collect();
  const active = liabilities.filter((l) => !ledger.retired.has(l._id));
  const retained = (l: Doc<"prizeLiabilities">) =>
    corrected.some(
      (r) =>
        r.entryId === l.entryId &&
        r.creator === l.creator &&
        r.awardCents === l.amountCents &&
        r.awardCents > 0,
    );
  const retiring = active.filter((l) => !retained(l));
  const created = corrected.filter(
    (r) =>
      r.awardCents > 0 &&
      !active.some(
        (l) =>
          l.entryId === r.entryId &&
          l.creator === r.creator &&
          l.amountCents === r.awardCents,
      ),
  );
  const recipients = (
    await ctx.db.query("creatorBatchRecipients").collect()
  ).filter((r) => r.campaignSlug === c.slug && r.nonprofitId === c.nonprofitId);
  const memberships = await Promise.all(
    [...new Set([actor, ...corrected.map((r) => r.creator)])].map((subject) =>
      ctx.db
        .query("memberships")
        .withIndex("by_subject_nonprofit", (q) =>
          q.eq("subject", subject).eq("nonprofitId", c.nonprofitId),
        )
        .unique(),
    ),
  );
  const projectedFunding = await prizeCoverage(ctx, c, {
    retiring: retiring.map((l) => l._id),
    additionalUnpaidCents: sumCents(created.map((r) => r.awardCents)),
  });
  const effects = {
    retired: retiring.map((l) => ({
      liability: l._id,
      creator: l.creator,
      amountCents: l.amountCents,
      paid: ledger.payments.find((p) => p.liability === l._id) ?? null,
      reservation: ledger.reserved.get(l._id) ?? null,
    })),
    created: created.map((r) => ({
      entryId: r.entryId,
      creator: r.creator,
      amountCents: r.awardCents,
    })),
    funding: {
      revision: funding.revision,
      evidence: funding.evidence,
      balances: funding.balances,
      requiredCents: funding.requiredCents,
      projectedRequiredCents: projectedFunding.requiredCents,
      covered: projectedFunding.covered,
      reason: projectedFunding.coverageReason ?? null,
    },
    recipientHolds: created
      .filter((r) => {
        const recipient = recipients.find(
            (p) => p.creator === r.creator && p.nonprofitId === c.nonprofitId,
          ),
          member = memberships.find((m) => m?.subject === r.creator);
        return (
          !recipient ||
          recipient.restriction !== "reviewable" ||
          !recipient.destinationBinding ||
          !member?.active ||
          member.role !== "creator"
        );
      })
      .map((r) => r.creator),
  };
  const fingerprint = hash({
    actor,
    original,
    current,
    corrected,
    inputFingerprint: input.inputFingerprint,
    sourceSnapshot: input.paidSourceSnapshot,
    correctionSnapshot: input.paidCorrectionSnapshot,
    // Elapsed display age is not new source authority. Freeze the full delay
    // when confirming, while binding the exact successful-import/data times.
    freshness: {
      lastSuccessfulImport: input.freshness.lastSuccessfulImport,
      dataAsOf: input.freshness.dataAsOf,
    },
    liabilities,
    allocations: ledger.allocations,
    payments: ledger.payments,
    retirements: ledger.retirements,
    recipients,
    memberships,
    effects,
    complete,
    emptyCoverage,
    authority,
  });
  return {
    original,
    current,
    corrected,
    allZero,
    input,
    active,
    retiring,
    created,
    effects,
    fingerprint,
    complete,
    missing: input.missing,
    changed:
      stableRequest(current?.rows ?? original.rows) !==
      stableRequest(corrected),
  };
}
async function previewView(
  ctx: QueryCtx,
  args: { campaignId: string; snapshotId: Doc<"competitionFinals">["_id"] },
) {
  const { campaign, subject } = await paidManager(ctx, args.campaignId);
  const p = await previewFor(ctx, campaign, args.snapshotId, subject);
  return {
    snapshotId: args.snapshotId,
    original: p.original.rows,
    current: p.current?.rows ?? p.original.rows,
    corrected: p.corrected,
    version: p.current?.version ?? 0,
    fingerprint: p.fingerprint,
    complete: p.complete,
    missing: p.missing,
    changed: p.changed,
    effects: p.effects,
    production: "held-66-89" as const,
  };
}
export const preview = query({ args: scope, handler: previewView });
export type BonusCorrectionPreview = Awaited<ReturnType<typeof previewView>>;

// One immutable loss per original payment, including confirmation arriving after
// correction. The original payment never satisfies any replacement obligation.
export async function appendBonusLoss(
  ctx: MutationCtx,
  payment: Doc<"bonusPayments">,
) {
  const retirement = await ctx.db
    .query("bonusRetirements")
    .withIndex("by_liability", (q) => q.eq("liability", payment.liability))
    .unique();
  if (
    !retirement ||
    (await ctx.db
      .query("bonusLosses")
      .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
      .unique())
  )
    return;
  await ctx.db.insert("bonusLosses", {
    campaignSlug: payment.campaignSlug,
    nonprofitId: payment.nonprofitId,
    correctionId: retirement.correctionId,
    liability: payment.liability,
    paymentId: payment._id,
    executionId: payment.executionId,
    amountCents: payment.amountCents,
    currency: "USD",
    creator: payment.binding.creator,
    providerId: payment.providerId,
    confirmationReference: payment.confirmationReference,
    actor: "bonus-correction-reconciler",
    source: "finalized-bonus-correction-v1",
    at: Date.now(),
    version: 1,
    synthetic: payment.synthetic,
  });
  await correctionNotice(ctx, retirement.correctionId);
}
async function correctionNotice(
  ctx: MutationCtx,
  id: Doc<"bonusCorrections">["_id"],
) {
  const correction = (await ctx.db.get(id))!,
    key = `bonus-correction:${id}`;
  const head = await ctx.db
    .query("incidentHeads")
    .withIndex("by_stream", (q) =>
      q.eq("campaignSlug", correction.campaignSlug).eq("key", key),
    )
    .unique();
  const losses = (
    await ctx.db
      .query("bonusLosses")
      .withIndex("by_campaign", (q) =>
        q.eq("campaignSlug", correction.campaignSlug),
      )
      .collect()
  ).filter((l) => l.correctionId === id);
  if (!losses.length) return;
  const c = (await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", correction.campaignSlug))
    .unique())!;
  const ledger = await bonusLedger(ctx, c),
    obligations = (
      await ctx.db
        .query("prizeLiabilities")
        .withIndex("by_snapshot", (q) =>
          q.eq("snapshotId", correction.snapshotId),
        )
        .collect()
    ).filter((l) => l.correctionId === id);
  const reason = `Paid bonus loss retained separately. Corrected performance bonus: ${obligations.length === 0 ? "no corrected award owed" : obligations.every((l) => ledger.paid.has(l._id)) ? "confirmed in the controlled ledger" : "owed/unpaid; review funding, recipient and a fresh exact batch approval"}. No creator debit or commission offset.`;
  if (head?.incidentId) {
    const incident = await ctx.db.get(head.incidentId);
    // Acknowledgement/resolution cannot turn a status update into a second loss.
    // Current payment status remains available through the private history view.
    if (incident?.status === "resolved" || incident?.reason === reason) return;
  }
  await recordTrustedIncident(
    ctx,
    {
      campaignId: correction.campaignSlug,
      key,
      kind: "prize-loss",
      sequence: (head?.sequence ?? 0) + 1,
      observedAt: Date.now(),
      active: true,
      reason,
      evidence: `Correction ${id}; original payment references retained in private bonus history`,
      resolutionRole: "manager",
    },
    {
      producer: "finalized-bonus-correction-v1",
      actor: "bonus-correction-reconciler",
      synthetic: correction.synthetic,
    },
  );
}
export async function updateBonusCorrectionStatus(
  ctx: MutationCtx,
  payment: Doc<"bonusPayments">,
) {
  await appendBonusLoss(ctx, payment);
  const liability = await ctx.db.get(payment.liability);
  if (liability?.correctionId)
    await correctionNotice(ctx, liability.correctionId);
}
export const confirm = mutation({
  args: {
    ...scope,
    fingerprint: v.string(),
    operationId: v.string(),
    confirmed: v.boolean(),
    reason: v.string(),
    evidence: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign: c, subject } = await paidManager(ctx, args.campaignId);
    operationIdentity(args.operationId);
    safeText(args.reason, 500);
    safeText(args.evidence, 200);
    if (!args.confirmed) throw Error("BONUS_CORRECTION_CONFIRMATION_REQUIRED");
    const requestFingerprint = hash({ ...args, actor: subject });
    const prior = await ctx.db
      .query("bonusCorrections")
      .withIndex("by_operation", (q) =>
        q.eq("campaignSlug", c.slug).eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (
        prior.requestFingerprint !== requestFingerprint ||
        prior.actor !== subject
      )
        throw Error("OPERATION_CONFLICT");
      return prior._id;
    }
    const p = await previewFor(ctx, c, args.snapshotId, subject);
    if (p.fingerprint !== args.fingerprint)
      throw Error(
        "BONUS_CORRECTION_PREVIEW_CHANGED: Review current results, payments and holds again",
      );
    if (!p.complete)
      throw Error(
        "BONUS_CORRECTION_EVIDENCE_HELD: Complete exact historical input coverage required",
      );
    if (!p.changed)
      throw Error(
        "BONUS_CORRECTION_NO_CHANGE: Current result already matches trusted inputs",
      );
    const at = Date.now(),
      id = await ctx.db.insert("bonusCorrections", {
        campaignSlug: c.slug,
        nonprofitId: c.nonprofitId,
        snapshotId: args.snapshotId,
        operationId: args.operationId,
        requestFingerprint,
        previewFingerprint: p.fingerprint,
        previousId: p.current?._id ?? null,
        version: (p.current?.version ?? 0) + 1,
        actor: subject,
        source: "finalized-bonus-correction-v1",
        at,
        reason: args.reason,
        evidence: args.evidence,
        inputFingerprint: p.input.inputFingerprint,
        inputSnapshot: stableRequest({
          evidence: p.input.evidence,
          paidSources: p.input.paidSourceSnapshot,
          paidCorrections: p.input.paidCorrectionSnapshot,
          freshness: p.input.freshness,
        }),
        financialSnapshot: stableRequest(p.effects),
        synthetic: p.original.synthetic,
        allZero: p.allZero,
        freshness: p.input.freshness,
        rows: p.corrected,
      });
    for (const l of p.retiring)
      await ctx.db.insert("bonusRetirements", {
        campaignSlug: c.slug,
        nonprofitId: c.nonprofitId,
        liability: l._id,
        correctionId: id,
        at,
      });
    const now = await prizeNow(ctx, c);
    const currentObligations = new Map(
      p.active
        .filter((l) => !p.retiring.some((r) => r._id === l._id))
        .map((l) => [l.entryId, l._id]),
    );
    for (const r of p.created) {
      const obligationId = await ctx.db.insert("prizeLiabilities", {
        campaignSlug: c.slug,
        nonprofitId: c.nonprofitId,
        snapshotId: args.snapshotId,
        entryId: r.entryId,
        creator: r.creator,
        kind: p.original.kind,
        period: p.original.period,
        amountCents: r.awardCents,
        currency: "USD",
        finalizedAt: now,
        batchEligibleAt: nextPrizeBatch(now),
        eligibility: "finalized",
        state: "unpaid",
        source: "finalized-bonus-correction-v1",
        version: 1,
        correctionId: id,
      });
      currentObligations.set(r.entryId, obligationId);
    }
    for (const r of p.corrected.filter((r) => r.awardCents > 0)) {
      const obligationId = currentObligations.get(r.entryId);
      if (!obligationId) throw Error("BONUS_CORRECTION_OBLIGATION_MISSING");
      await recordTrustedFinalizedFundraising(
        ctx,
        {
          entryId: r.entryId,
          periodKind: p.original.kind,
          period: p.original.period,
          resultId: `${id}:${r.entryId}`,
          originalGrossCents: r.fundraisingCents,
          winner: r.creator,
          prizeObligationId: obligationId,
          fixedPrizeCents: r.awardCents,
          currency: "usd",
        },
        {
          actor: subject,
          source: "finalized-bonus-correction-v1",
          evidence: `Correction ${id}; trusted source ${p.input.inputFingerprint}`,
          synthetic: p.original.synthetic,
        },
      );
    }
    const ledger = await bonusLedger(ctx, c);
    for (const payment of ledger.payments) await appendBonusLoss(ctx, payment);
    return id;
  },
});
export const history = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign: c } = await paidManager(ctx, campaignId);
    const ledger = await bonusLedger(ctx, c),
      funding = await prizeCoverage(ctx, c);
    const obligations = (
      await ctx.db
        .query("prizeLiabilities")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
        .collect()
    ).filter((l) => l.nonprofitId === c.nonprofitId);
    return {
      obligations: obligations.map((l) => ({
        id: l._id,
        snapshotId: l.snapshotId,
        correctionId: l.correctionId ?? null,
        creator: l.creator,
        amountCents: l.amountCents,
        state: ledger.paid.has(l._id)
          ? "confirmed"
          : ledger.retired.has(l._id)
            ? ledger.reserved.has(l._id)
              ? "superseded-original-reserved"
              : "superseded"
            : "owed/unpaid",
        reserved: ledger.reserved.has(l._id),
        payment: ledger.payments.find((p) => p.liability === l._id) ?? null,
      })),
      funding: {
        covered: funding.covered,
        reason: funding.coverageReason ?? null,
      },
      corrections: (
        await ctx.db
          .query("bonusCorrections")
          .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
          .collect()
      ).filter((r) => r.nonprofitId === c.nonprofitId),
      losses: (
        await ctx.db
          .query("bonusLosses")
          .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
          .collect()
      ).filter((r) => r.nonprofitId === c.nonprofitId),
    };
  },
});
