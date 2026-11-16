import { bonusLedger } from "./bonusLedger.ts";
import { prizeCoverage } from "./prizeFunds.ts";
import type { Doc, QueryCtx, MutationCtx } from "./functions.ts";
import {
  currentCommission,
  commissionBalances,
  commissionRefundState,
} from "./fundraisingCorrections.ts";
import { sumCents } from "./fundraisingPolicy.ts";
import { unpaidPrizeLiabilities } from "./prizeFinalization.ts";
import { requestFingerprint } from "./requestFingerprint.ts";
import { stableRequest } from "./access.ts";
import { batchWeek } from "./batchPolicy.ts";
import { safeText } from "./operatorIncidents.ts";
import type { Infer } from "convex/values";
import { batchItem } from "./batchSchema.ts";
import { participationState, earningsHeld } from "./participationPolicy.ts";

type Item = Infer<typeof batchItem>;
// Recipient evidence is supplied by a trusted owner, never by a browser approval.
// The only available ready binding is controlled; O-02 must establish production semantics.
export async function recordControlledBatchRecipient(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  input: {
    creator: string;
    restriction: Doc<"creatorBatchRecipients">["restriction"];
    guidance: string;
    destinationBinding: string | null;
    revision: number;
  },
) {
  if (
    !c.fixtureRunId ||
    c.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
  )
    throw Error("BATCH_PROVIDER_HELD");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_subject_nonprofit", (q) =>
      q.eq("subject", input.creator).eq("nonprofitId", c.nonprofitId),
    )
    .unique();
  if (!membership || membership.role !== "creator")
    throw Error("BATCH_RECIPIENT_SCOPE");
  safeText(input.guidance, 240);
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    (input.restriction === "reviewable" && !input.destinationBinding)
  )
    throw Error("BATCH_RECIPIENT_EVIDENCE");
  if (input.destinationBinding) safeText(input.destinationBinding, 128);
  const old = await ctx.db
    .query("creatorBatchRecipients")
    .withIndex("by_creator", (q) =>
      q.eq("campaignSlug", c.slug).eq("creator", input.creator),
    )
    .unique();
  if (old && input.revision <= old.revision) {
    if (
      input.revision === old.revision &&
      Object.entries(input).every(
        ([k, value]) => old[k as keyof typeof old] === value,
      )
    )
      return old._id;
    throw Error("BATCH_RECIPIENT_REVISION");
  }
  const value = {
    ...input,
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    actor: "owned-recipient-producer",
    source: "controlled-recipient-v1",
    evidence: "Controlled recipient evidence; actual O-02 remains held",
    at: Date.now(),
    synthetic: true,
  };
  await ctx.db.insert("creatorBatchRecipientEvents", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    creator: input.creator,
    revision: input.revision,
    snapshot: stableRequest(value),
    actor: value.actor,
    source: value.source,
    at: value.at,
  });
  if (old) {
    await ctx.db.patch(old._id, value);
    return old._id;
  }
  return ctx.db.insert("creatorBatchRecipients", value);
}

export async function batchContents(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  cutoff: number,
) {
  const week = batchWeek(cutoff);
  const donations = (
    await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter(
    (d) =>
      d.nonprofitId === c.nonprofitId &&
      d.eligible &&
      d.creator &&
      d.completedAt < week.end,
  );
  const obligations = (
    await ctx.db
      .query("fundraisingCommissionObligations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((o) => o.nonprofitId === c.nonprofitId);
  const payments = (
    await ctx.db
      .query("fundraisingCommissionPayments")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((p) => p.nonprofitId === c.nonprofitId);
  const items: Item[] = [];
  const commissionExecutions = await ctx.db
    .query("commissionExecutions")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .collect();
  for (const group of await commissionBalances(ctx, donations)) {
    const rows = donations.filter(
      (d) =>
        d.creator === group.creator &&
        d.account === group.account &&
        d.route === group.route,
    );
    const outstanding = obligations.filter(
      (o) =>
        o.creator === group.creator &&
        o.account === group.account &&
        o.route === group.route &&
        !payments.some((p) => p.obligation === o._id),
    );
    const reservedCents = sumCents(outstanding.map((o) => o.amountCents));
    const { refunds, refundHeld } = await commissionRefundState(ctx, rows);
    const details = await Promise.all(
      rows.map(async (d) => {
        const current = await currentCommission(ctx, d);
        return {
          reference: d._id,
          entryId: d.originEntryId!,
          period: d.earningWeek,
          originalCents: d.commissionCents,
          adjustmentCents:
            current.recognizedCommissionCents - d.commissionCents,
          amountCents: current.recognizedCommissionCents,
        };
      }),
    );
    const heldDetails: typeof details = [];
    for (const detail of details)
      if ((await participationState(ctx, detail.entryId)).fraudHeld)
        heldDetails.push(detail);
    // Recognition is unchanged. Reserve only the suspect entry's unpaid share.
    const heldEntries = new Set<string>(heldDetails.map((d) => d.entryId));
    // A single-source execution proves its reserved/paid share. Mixed historical
    // aggregates do not establish which entry was settled and remain conservative.
    const provenHeldExecutions = commissionExecutions.filter(
      (e) =>
        e.nonprofitId === c.nonprofitId &&
        e.item.details.length > 0 &&
        e.item.details.every((d) => heldEntries.has(d.entryId)),
    );
    const provenHeldCommitted = sumCents([
      ...new Map(
        provenHeldExecutions
          .filter(
            (e) =>
              outstanding.some((o) => o._id === e.obligation) ||
              payments.some((p) => p.obligation === e.obligation),
          )
          .map((e) => [e.obligation, e.binding.amountCents]),
      ).values(),
    ]);
    const heldCents = Math.min(
      Math.max(0, sumCents([group.payableCents, -reservedCents])),
      Math.max(
        0,
        sumCents([
          sumCents(heldDetails.map((d) => d.amountCents)),
          -provenHeldCommitted,
        ]),
      ),
    );
    const availableCents = Math.max(
      0,
      sumCents([group.payableCents, -reservedCents, -heldCents]),
    );
    items.push({
      key: requestFingerprint([group.creator, group.account, group.route]),
      creator: group.creator,
      kind: "commission",
      sourcePurpose: "fundraising",
      amountCents: availableCents,
      carryforwardCents: group.carryforwardCents,
      reservedCents,
      paidCents: group.paidCents,
      details: details.filter((d) => !heldDetails.includes(d)),
      state: "reserved",
      guidance: refundHeld
        ? "Commission remains reserved while pending or uncertain refund evidence is reconciled."
        : "",
      recipientRevision: 0,
      destinationBinding: null,
      sourceBinding: requestFingerprint({
        account: group.account,
        route: group.route,
        details,
        outstanding,
        refunds,
        ...(heldDetails.length ? { heldDetails } : {}),
        payments: payments.filter(
          (p) =>
            p.creator === group.creator &&
            p.account === group.account &&
            p.route === group.route,
        ),
      }),
    });
    if (heldCents > 0)
      items.push({
        ...items.at(-1)!,
        key: requestFingerprint([
          group.creator,
          group.account,
          group.route,
          "fraud-held",
        ]),
        amountCents: heldCents,
        reservedCents: 0,
        paidCents: 0,
        details: heldDetails,
        guidance:
          "Temporary fraud review holds this unpaid estimate from recognized entry earnings. Historical aggregate payments can lack entry settlement proof. Earnings remain owed; explicit manager resolution is required.",
        state: "reserved",
      });
  }
  const bonus = await bonusLedger(ctx, c),
    funding = await prizeCoverage(ctx, c);
  for (const liability of await unpaidPrizeLiabilities(ctx, c, cutoff)) {
    const allocation = bonus.reserved.get(liability._id);
    if (liability.batchEligibleAt > cutoff) continue;
    items.push({
      key: liability._id,
      creator: liability.creator,
      kind: "prize",
      sourcePurpose: "prize",
      amountCents: liability.amountCents,
      carryforwardCents: 0,
      reservedCents: allocation ? liability.amountCents : 0,
      paidCents: 0,
      details: [
        {
          reference: liability._id,
          entryId: liability.entryId,
          period: liability.period,
          originalCents: liability.amountCents,
          adjustmentCents: 0,
          amountCents: liability.amountCents,
        },
      ],
      state: "reserved",
      guidance: (await earningsHeld(ctx, [liability.entryId]))
        ? "Temporary fraud review holds this unpaid bonus. Its finalized result and liability remain unchanged."
        : allocation?.generation
          ? "Bonus remains reserved pending original-outcome reconciliation; no replacement payment."
          : (funding.coverageReason ?? ""),
      recipientRevision: 0,
      destinationBinding: null,
      sourceBinding: requestFingerprint({
        liability,
        fundingEvidenceId: funding.evidence?._id ?? null,
      }),
    });
  }
  for (const item of items) {
    const recipient = await ctx.db
      .query("creatorBatchRecipients")
      .withIndex("by_creator", (q) =>
        q.eq("campaignSlug", c.slug).eq("creator", item.creator),
      )
      .unique();
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", item.creator).eq("nonprofitId", c.nonprofitId),
      )
      .unique();
    const controlled =
      !!c.fixtureRunId &&
      c.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID;
    const usable = recipient?.nonprofitId === c.nonprofitId && controlled;
    item.recipientRevision = usable ? recipient.revision : 0;
    item.destinationBinding = usable ? recipient.destinationBinding : null;
    const reviewable =
      !item.guidance &&
      usable &&
      recipient.restriction === "reviewable" &&
      membership?.active &&
      membership.role === "creator";
    item.state = reviewable ? "owed" : "reserved";
    item.guidance =
      item.guidance ||
      (!membership?.active
        ? "Earnings remain reserved. Contact the campaign manager about your access."
        : usable
          ? recipient.guidance
          : "Earnings remain reserved. Payment setup and provider eligibility require review; contact the campaign manager.");
  }
  items.sort((a, b) => a.key.localeCompare(b.key));
  return {
    items,
    fingerprint: requestFingerprint({
      cutoff,
      items,
      currency: "USD",
      execution: "provider-held",
    }),
    week: week.label,
  };
}
