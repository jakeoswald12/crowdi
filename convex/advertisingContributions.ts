import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
  type Doc,
} from "./functions.ts";
import { cents, sumCents } from "./fundraisingPolicy.ts";
import { fundraisingScope } from "./fundraisingSchema.ts";
import { publicCampaign } from "./publicViewer.ts";

function signature(value: any, supplied: string) {
  const secret = process.env.ADVERTISING_CONTRIBUTION_RECEIPT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("FORBIDDEN: Contribution service unavailable");
  const expected = bytesToHex(
    hmac(
      sha256,
      new TextEncoder().encode(secret),
      new TextEncoder().encode(stableRequest(value)),
    ),
  );
  let difference = expected.length ^ supplied.length;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
  if (
    difference ||
    !Number.isSafeInteger(value.at) ||
    Math.abs(Date.now() - value.at) > 30000
  )
    throw new Error("FORBIDDEN: Invalid contribution receipt");
}
async function gate(ctx: MutationCtx, scope: any) {
  const campaign = await publicCampaign(ctx);
  // This producer is restricted to an owned localhost transport. Issues20/21
  // must establish actual account/program/route authority before real intake.
  if (
    !campaign?.fixtureRunId ||
    campaign.fixtureRunId !== scope.fixtureRunId ||
    scope.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID ||
    scope.account !== `acct_owned_${scope.fixtureRunId}` ||
    scope.route !== "owned-advertising-contribution-v1" ||
    scope.apiVersion !== "2026-10-28.endive" ||
    !/^[a-f0-9]{64}$/.test(scope.transportBinding)
  )
    throw new Error(
      "CONTRIBUTION_HELD: Actual program/account and collection route approval required (issues20/21)",
    );
  return campaign;
}
async function audit(
  ctx: MutationCtx,
  checkoutId: Doc<"advertisingContributionCheckouts">["_id"],
  action: string,
  digest: string,
) {
  await ctx.db.insert("advertisingContributionAudit", {
    checkoutId,
    action,
    digest,
    actor: "advertising-contribution-service",
    source: "advertisingContributions:stripe-adapter",
    at: Date.now(),
    version: 1,
  });
}
export const purposes = query({
  args: {},
  handler: async (ctx) => {
    const campaign = await publicCampaign(ctx);
    if (!campaign) return [];
    return [
      {
        campaignId: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        label: "adoption.is campaign advertising",
        purpose: "campaign-advertising",
      },
    ];
  },
});
export const begin = mutation({
  args: {
    value: v.object({
      operationId: v.string(),
      campaignId: v.string(),
      nonprofitId: v.string(),
      purpose: v.literal("campaign-advertising"),
      amountCents: v.number(),
      applicationOrigin: v.string(),
      tokenHash: v.string(),
      scope: fundraisingScope,
      at: v.number(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    signature(args.value, args.signature);
    const { at: _at, ...input } = args.value,
      campaign = await gate(ctx, input.scope);
    operationIdentity(input.operationId);
    cents(input.amountCents, true);
    if (input.amountCents < 50 || input.amountCents > 99999999)
      throw new Error("CONTRIBUTION_AMOUNT: Use 50 through 99999999 USD cents");
    if (
      campaign.slug !== input.campaignId ||
      campaign.nonprofitId !== input.nonprofitId
    )
      throw new Error(
        "CONTRIBUTION_SCOPE: Selected nonprofit campaign is unavailable",
      );
    if (
      !/^[a-f0-9]{64}$/.test(input.tokenHash) ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(input.applicationOrigin)
    )
      throw new Error(
        "CONTRIBUTION_SCOPE: Invalid checkout capability or owned origin",
      );
    const fingerprint = stableRequest(input),
      existing = await ctx.db
        .query("advertisingContributionCheckouts")
        .withIndex("by_operation", (q) =>
          q.eq("operationId", input.operationId),
        )
        .unique();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error(
          "OPERATION_CONFLICT: Contribution checkout contents changed",
        );
      return existing;
    }
    const now = Date.now(),
      id = await ctx.db.insert("advertisingContributionCheckouts", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        operationId: input.operationId,
        fingerprint,
        tokenHash: input.tokenHash,
        amountCents: input.amountCents,
        applicationOrigin: input.applicationOrigin,
        scope: input.scope,
        state: "journaled",
        providerKey: `advertising-contribution-${campaign._id}-${input.operationId}`,
        createdAt: now,
        retryBefore: now + 23 * 3600000,
        actor: "account-free-contributor",
        source: "advertisingContributions:begin",
        version: 1,
      });
    await audit(ctx, id, "journaled-before-provider-write", fingerprint);
    return await ctx.db.get(id);
  },
});
export const dispatch = mutation({
  args: {
    value: v.object({
      checkoutId: v.id("advertisingContributionCheckouts"),
      scope: fundraisingScope,
      at: v.number(),
      sessionId: v.optional(v.string()),
      checkoutUrl: v.optional(v.string()),
      state: v.union(v.literal("dispatched"), v.literal("uncertain")),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db.get(value.checkoutId);
    if (
      !row ||
      stableRequest(row.scope) !== stableRequest(value.scope) ||
      (row.sessionId && value.sessionId && row.sessionId !== value.sessionId)
    )
      throw new Error("CONTRIBUTION_CONFLICT: Checkout identity changed");
    if (row.state !== "confirmed")
      await ctx.db.patch(row._id, {
        state: value.state,
        ...(value.sessionId
          ? { sessionId: value.sessionId, checkoutUrl: value.checkoutUrl }
          : {}),
      });
    await audit(ctx, row._id, value.state, stableRequest(value));
    return { retained: true };
  },
});
export const resolve = mutation({
  args: {
    value: v.object({
      sessionId: v.string(),
      scope: fundraisingScope,
      at: v.number(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db
      .query("advertisingContributionCheckouts")
      .withIndex("by_session", (q) => q.eq("sessionId", value.sessionId))
      .unique();
    if (!row || stableRequest(row.scope) !== stableRequest(value.scope))
      throw new Error("CONTRIBUTION_SCOPE: Unknown contribution checkout");
    return row;
  },
});
export const observe = mutation({
  args: {
    value: v.object({
      checkoutId: v.id("advertisingContributionCheckouts"),
      scope: fundraisingScope,
      at: v.number(),
      eventId: v.string(),
      digest: v.string(),
      outcome: v.union(
        v.literal("pending"),
        v.literal("failed"),
        v.literal("confirmed"),
      ),
      paymentId: v.optional(v.string()),
      chargeId: v.optional(v.string()),
      grossCents: v.optional(v.number()),
      feeCents: v.union(v.number(), v.null()),
      netCents: v.union(v.number(), v.null()),
      balanceTransactionId: v.union(v.string(), v.null()),
      balanceStatus: v.union(
        v.literal("available"),
        v.literal("pending"),
        v.null(),
      ),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value: f, signature: supplied }) => {
    signature(f, supplied);
    await gate(ctx, f.scope);
    const row = await ctx.db.get(f.checkoutId);
    if (!row || stableRequest(row.scope) !== stableRequest(f.scope))
      throw new Error("CONTRIBUTION_SCOPE: Unknown contribution checkout");
    const event = await ctx.db
      .query("advertisingContributionEvents")
      .withIndex("by_event", (q) =>
        q.eq("account", f.scope.account).eq("eventId", f.eventId),
      )
      .unique();
    if (event && (event.checkoutId !== row._id || event.digest !== f.digest))
      throw new Error("CONTRIBUTION_CONFLICT: Event identity changed");
    if (!event)
      await ctx.db.insert("advertisingContributionEvents", {
        account: f.scope.account,
        eventId: f.eventId,
        checkoutId: row._id,
        digest: f.digest,
        actor: "stripe-owned-transport",
        source: "stripe:verified-canonical-event",
        at: Date.now(),
        version: 1,
      });
    if (f.outcome !== "confirmed") {
      if (row.state !== "confirmed")
        await ctx.db.patch(row._id, { state: f.outcome });
      await audit(ctx, row._id, `${f.outcome}-not-available`, f.digest);
      return { confirmed: row.state === "confirmed", duplicate: !!event };
    }
    if (
      !f.paymentId ||
      !/^pi_[A-Za-z0-9_-]+$/.test(f.paymentId) ||
      !f.chargeId ||
      !/^ch_[A-Za-z0-9_-]+$/.test(f.chargeId) ||
      f.grossCents !== row.amountCents
    )
      throw new Error(
        "CONTRIBUTION_FACTS: Payment identity does not match journal",
      );
    if (f.feeCents !== null) {
      cents(f.feeCents);
      if (
        f.netCents === null ||
        !Number.isSafeInteger(f.netCents) ||
        f.netCents !== sumCents([row.amountCents, -f.feeCents]) ||
        !/^txn_[A-Za-z0-9_-]+$/.test(f.balanceTransactionId ?? "") ||
        !f.balanceStatus
      )
        throw new Error("CONTRIBUTION_FACTS: Actual fee/net evidence required");
    } else if (
      f.netCents !== null ||
      f.balanceTransactionId !== null ||
      f.balanceStatus !== null
    )
      throw new Error(
        "CONTRIBUTION_FACTS: Unknown fees cannot create net collection",
      );
    let contribution = await ctx.db
      .query("advertisingContributions")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", row._id))
      .unique();
    const payment = await ctx.db
      .query("advertisingContributions")
      .withIndex("by_payment", (q) =>
        q.eq("account", f.scope.account).eq("paymentId", f.paymentId!),
      )
      .unique();
    if (
      (payment && payment.checkoutId !== row._id) ||
      (contribution &&
        (contribution.paymentId !== f.paymentId ||
          contribution.chargeId !== f.chargeId))
    )
      throw new Error("CONTRIBUTION_CONFLICT: Payment reused or changed");
    if (!contribution) {
      const id = await ctx.db.insert("advertisingContributions", {
        checkoutId: row._id,
        campaignSlug: row.campaignSlug,
        nonprofitId: row.nonprofitId,
        account: f.scope.account,
        paymentId: f.paymentId,
        chargeId: f.chargeId,
        grossCents: row.amountCents,
        confirmedAt: Date.now(),
        actor: "stripe-owned-transport",
        source: "advertisingContributions:verified-confirmation",
        at: Date.now(),
        version: 1,
      });
      contribution = (await ctx.db.get(id))!;
    }
    const amounts = await ctx.db
        .query("advertisingContributionAmounts")
        .withIndex("by_contribution", (q) =>
          q.eq("contributionId", contribution!._id),
        )
        .collect(),
      known = amounts.filter((a) => a.feeCents !== null).at(-1);
    if (
      known &&
      f.feeCents !== null &&
      (known.feeCents !== f.feeCents ||
        known.netCents !== f.netCents ||
        known.balanceTransactionId !== f.balanceTransactionId)
    )
      throw new Error("CONTRIBUTION_CONFLICT: Actual fee identity changed");
    // Late evidence can fill unknown fees or advance pending settlement. A stale
    // callback cannot erase known fees or regress available settlement.
    const latest = amounts.at(-1),
      changed =
        !latest ||
        (f.feeCents !== null &&
          (!known ||
            (known.balanceStatus === "pending" &&
              f.balanceStatus === "available")));
    if (changed)
      await ctx.db.insert("advertisingContributionAmounts", {
        contributionId: contribution._id,
        feeCents: f.feeCents,
        netCents: f.netCents,
        balanceTransactionId: f.balanceTransactionId,
        balanceStatus: f.balanceStatus,
        eventId: f.eventId,
        digest: f.digest,
        actor: "stripe-owned-transport",
        source: "stripe:canonical-balance-transaction",
        at: Date.now(),
        version: 1,
      });
    await ctx.db.patch(row._id, { state: "confirmed" });
    await audit(
      ctx,
      row._id,
      changed
        ? "confirmed-collection-evidence"
        : "duplicate-confirmation-retained",
      f.digest,
    );
    return { confirmed: true, duplicate: !!event };
  },
});
export const hold = mutation({
  args: {
    value: v.object({
      checkoutId: v.id("advertisingContributionCheckouts"),
      scope: fundraisingScope,
      at: v.number(),
      reason: v.union(
        v.literal("refund-dispute-reconciliation-required"),
        v.literal("canonical-evidence-unreconciled"),
      ),
      digest: v.string(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db.get(value.checkoutId);
    if (!row || stableRequest(row.scope) !== stableRequest(value.scope))
      throw new Error("CONTRIBUTION_SCOPE: Unknown contribution checkout");
    // T23 has no hold-release producer. Later or stale receipts cannot clear a
    // newer hold; the dedicated reconciliation owner must approve any release.
    if (row.holdReason !== "refund-dispute-reconciliation-required")
      await ctx.db.patch(row._id, { holdReason: value.reason });
    await audit(ctx, row._id, value.reason, value.digest);
    return { held: true };
  },
});
async function collection(
  ctx: QueryCtx,
  row: Doc<"advertisingContributionCheckouts">,
) {
  const contribution = await ctx.db
    .query("advertisingContributions")
    .withIndex("by_checkout", (q) => q.eq("checkoutId", row._id))
    .unique();
  const amounts = contribution
    ? await ctx.db
        .query("advertisingContributionAmounts")
        .withIndex("by_contribution", (q) =>
          q.eq("contributionId", contribution._id),
        )
        .collect()
    : [];
  const amount = amounts.at(-1);
  return {
    status: row.state,
    grossCents: contribution?.grossCents ?? null,
    actualFeeCents: amount?.feeCents ?? null,
    netCollectionCents: amount?.netCents ?? null,
    availableCollectionCents:
      (amount?.netCents ?? 0) < 0
        ? amount!.netCents!
        : row.holdReason
          ? 0
          : amount?.balanceStatus === "available"
            ? amount.netCents!
            : 0,
    holdReason: row.holdReason ?? null,
    feeStatus:
      (amount?.netCents ?? 0) < 0
        ? "deficit-held"
        : row.holdReason
          ? "reconciliation-held"
          : !contribution
            ? "unconfirmed"
            : amount?.feeCents === null
              ? "unknown-fees-held"
              : amount?.balanceStatus === "pending"
                ? "settlement-pending"
                : "recorded",
    issuingAuthorityCents: 0,
    synthetic: true,
    validatedForProduction: false,
  };
}
export const status = query({
  args: { operationId: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("advertisingContributionCheckouts")
      .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
      .unique();
    if (!row || row.tokenHash !== args.tokenHash)
      throw new Error("FORBIDDEN: Contribution status unavailable");
    return await collection(ctx, row);
  },
});
export const ledger = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId),
      rows = await ctx.db
        .query("advertisingContributionCheckouts")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect();
    return await Promise.all(
      rows
        .filter((r) => r.nonprofitId === campaign.nonprofitId)
        .map(async (r) => ({
          id: r._id,
          campaignId: r.campaignSlug,
          nonprofitId: r.nonprofitId,
          purpose: "campaign-advertising",
          requestedCents: r.amountCents,
          createdAt: r.createdAt,
          actor: r.actor,
          source: r.source,
          version: r.version,
          ...(await collection(ctx, r)),
        })),
    );
  },
});
export const history = query({
  args: {
    campaignId: v.string(),
    checkoutId: v.id("advertisingContributionCheckouts"),
  },
  handler: async (ctx, { campaignId, checkoutId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId),
      row = await ctx.db.get(checkoutId);
    if (
      !row ||
      row.campaignSlug !== campaignId ||
      row.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Contribution history unavailable");
    const contribution = await ctx.db
      .query("advertisingContributions")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId))
      .unique();
    return {
      audit: await ctx.db
        .query("advertisingContributionAudit")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId))
        .collect(),
      contribution,
      amounts: contribution
        ? await ctx.db
            .query("advertisingContributionAmounts")
            .withIndex("by_contribution", (q) =>
              q.eq("contributionId", contribution._id),
            )
            .collect()
        : [],
    };
  },
});
