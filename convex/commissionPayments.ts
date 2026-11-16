import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { paidManager } from "./paidCorrections.ts";
import { acceptedCreator } from "./creatorAccess.ts";
import { operationIdentity, stableRequest } from "./access.ts";
import { requestFingerprint as hash } from "./requestFingerprint.ts";
import { batchContents } from "./creatorBatchContents.ts";
import { batchNow } from "./creatorBatches.ts";
import { latestBatchCutoff, batchWeek } from "./batchPolicy.ts";
import {
  currentCommission,
  commissionRefundState,
  recordTrustedCommissionObligation,
  recordTrustedCommissionPayment,
} from "./fundraisingCorrections.ts";
import { commissionSignature } from "./commissionTransport.ts";
import { earningsHeld } from "./participationPolicy.ts";

const scope = { campaignId: v.string() };
const job = makeFunctionReference<
  "action",
  { executionId: Doc<"commissionExecutions">["_id"] }
>("commissionJobs:run");
const controlled = (c: Doc<"campaigns">) =>
  !!c.fixtureRunId &&
  c.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID;
function transport() {
  const origin = process.env.COMMISSION_FIXTURE_ORIGIN,
    secret = process.env.COMMISSION_FIXTURE_SECRET;
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || !secret)
    return null;
  return { origin, secret, binding: hash({ origin, credential: secret }) };
}
async function membership(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  subject: string,
  role: string,
) {
  const m = await ctx.db
    .query("memberships")
    .withIndex("by_subject_nonprofit", (q) =>
      q.eq("subject", subject).eq("nonprofitId", c.nonprofitId),
    )
    .unique();
  return !!m?.active && m.role === role;
}
// Independent external inputs exclude the reservation created by this journal.
// Approval snapshots remain immutable even when T17 prepares a new internal revision.
async function externalInputs(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  creator: string,
  account: string,
  route: string,
  cutoff: number,
  ownObligation?: Doc<"fundraisingCommissionObligations">["_id"],
) {
  const donations = (
    await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter(
    (d) =>
      d.nonprofitId === c.nonprofitId &&
      d.creator === creator &&
      d.account === account &&
      d.route === route &&
      d.eligible &&
      d.completedAt < batchWeek(cutoff).end,
  );
  const recipient = await ctx.db
    .query("creatorBatchRecipients")
    .withIndex("by_creator", (q) =>
      q.eq("campaignSlug", c.slug).eq("creator", creator),
    )
    .unique();
  const refunds = await commissionRefundState(ctx, donations);
  const obligations = (
    await ctx.db
      .query("fundraisingCommissionObligations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter(
    (o) =>
      o.nonprofitId === c.nonprofitId &&
      o.creator === creator &&
      o.account === account &&
      o.route === route &&
      o._id !== ownObligation,
  );
  const payments = (
    await ctx.db
      .query("fundraisingCommissionPayments")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter(
    (p) =>
      p.nonprofitId === c.nonprofitId &&
      p.creator === creator &&
      p.account === account &&
      p.route === route &&
      p.obligation !== ownObligation,
  );
  return {
    account,
    route,
    donations: await Promise.all(
      donations.map(async (d) => ({
        donation: d,
        commission: await currentCommission(ctx, d),
      })),
    ),
    refunds,
    obligations,
    payments,
    recipient,
    active: await membership(ctx, c, creator, "creator"),
  };
}
async function audit(
  ctx: MutationCtx,
  e: Doc<"commissionExecutions">,
  action: string,
  actor: string,
  digest = hash(e.binding),
) {
  await ctx.db.insert("commissionExecutionAudit", {
    executionId: e._id,
    campaignSlug: e.campaignSlug,
    nonprofitId: e.nonprofitId,
    actor,
    source: "commission-payments-owned-v1",
    action,
    state: e.state,
    digest,
    at: Date.now(),
    version: 1,
  });
}
async function update(
  ctx: MutationCtx,
  e: Doc<"commissionExecutions">,
  state: Doc<"commissionExecutions">["state"],
  reason: string,
  actor: string,
  extra: Partial<
    Pick<
      Doc<"commissionExecutions">,
      "providerId" | "confirmationReference" | "generation" | "claimedAt"
    >
  > = {},
  digest?: string,
) {
  await ctx.db.patch(e._id, { state, reason, updatedAt: Date.now(), ...extra });
  await audit(ctx, (await ctx.db.get(e._id))!, reason, actor, digest);
}
async function campaignFor(ctx: QueryCtx, e: Doc<"commissionExecutions">) {
  const c = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", e.campaignSlug))
    .unique();
  if (!c || c.nonprofitId !== e.nonprofitId) throw Error("COMMISSION_SCOPE");
  return c;
}
export const journal = mutation({
  args: {
    ...scope,
    approvalId: v.id("creatorBatchApprovals"),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign: c, subject } = await paidManager(ctx, args.campaignId);
    operationIdentity(args.operationId);
    const operation = await ctx.db
      .query("commissionExecutions")
      .withIndex("by_operation", (q) =>
        q.eq("campaignSlug", c.slug).eq("operationId", args.operationId),
      )
      .collect();
    if (
      operation.length &&
      operation.some(
        (e) => e.approvalId !== args.approvalId || e.actor !== subject,
      )
    )
      throw Error("OPERATION_CONFLICT");
    const a = await ctx.db.get(args.approvalId);
    if (!a || a.campaignSlug !== c.slug || a.nonprofitId !== c.nonprofitId)
      throw Error("FORBIDDEN: Approval unavailable");
    // Current authorization always precedes exact retry lookup.
    const prior = await ctx.db
      .query("commissionExecutions")
      .withIndex("by_approval", (q) => q.eq("approvalId", a._id))
      .collect();
    if (prior.length) return prior.map((e) => e._id);
    const b = await ctx.db.get(a.batchId);
    if (
      !b ||
      b.superseded ||
      b.revision !== a.revision ||
      b.fingerprint !== a.fingerprint ||
      b.cutoff !== latestBatchCutoff((await batchNow(ctx, c)) ?? Date.now()) ||
      (await batchContents(ctx, c, b.cutoff)).fingerprint !== a.fingerprint ||
      !(await membership(ctx, c, a.actor, "manager"))
    )
      throw Error("COMMISSION_APPROVAL_CHANGED");
    const ids: Doc<"commissionExecutions">["_id"][] = [];
    for (const item of a.items) {
      if (
        item.kind !== "commission" ||
        item.sourcePurpose !== "fundraising" ||
        item.state !== "owed" ||
        item.amountCents <= 0 ||
        !item.destinationBinding
      )
        continue;
      const d = await ctx.db.get(
        item.details[0]!.reference as Doc<"fundraisingDonations">["_id"],
      );
      if (
        !d ||
        d.creator !== item.creator ||
        d.nonprofitId !== c.nonprofitId ||
        d.campaignSlug !== c.slug
      )
        throw Error("COMMISSION_SOURCE");
      const key =
        "commission-" +
        hash([c.nonprofitId, c.slug, item.key, item.sourceBinding]);
      const inputs = await externalInputs(
        ctx,
        c,
        item.creator,
        d.account,
        d.route,
        b.cutoff,
      );
      const binding = {
        key,
        nonprofitId: c.nonprofitId,
        campaignId: c.slug,
        creator: item.creator,
        amountCents: item.amountCents,
        currency: "USD" as const,
        account: d.account,
        route: d.route,
        sourcePurpose: "fundraising" as const,
        destination: hash(item.destinationBinding),
        sourceBinding: item.sourceBinding,
        transportBinding: transport()?.binding ?? "production-held",
      };
      const obligation = await recordTrustedCommissionObligation(
        ctx,
        {
          campaignSlug: c.slug,
          nonprofitId: c.nonprofitId,
          creator: item.creator,
          account: d.account,
          route: d.route,
          obligationId: key,
          amountCents: item.amountCents,
          currency: "usd",
          destinationBinding: binding.destination,
          revision: a.revision,
          source: "commission-payments-owned-v1",
          synthetic: !!c.fixtureRunId,
        },
        {
          actor: subject,
          source: "commission-payments-owned-v1",
          evidence:
            "Exact T17 approval; controlled ledger only; actual #66 held",
          synthetic: !!c.fixtureRunId,
        },
      );
      const id = await ctx.db.insert("commissionExecutions", {
        campaignSlug: c.slug,
        nonprofitId: c.nonprofitId,
        approvalId: a._id,
        obligation,
        operationId: args.operationId,
        actor: subject,
        item,
        binding,
        externalBinding: hash(inputs),
        state: "proposed",
        reason: "Journal persisted; production #66 held",
        generation: 0,
        claimedAt: 0,
        at: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      });
      await audit(
        ctx,
        (await ctx.db.get(id))!,
        "commission-journaled",
        subject,
      );
      ids.push(id);
      await ctx.scheduler.runAfter(0, job, { executionId: id });
    }
    return ids;
  },
});
export const recheck = mutation({
  args: { ...scope, executionId: v.id("commissionExecutions") },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId),
      e = await ctx.db.get(args.executionId);
    if (
      !e ||
      e.campaignSlug !== campaign.slug ||
      e.nonprofitId !== campaign.nonprofitId
    )
      throw Error("FORBIDDEN: Commission unavailable");
    await audit(ctx, e, "same-identity-recheck-requested", subject);
    await ctx.scheduler.runAfter(0, job, { executionId: e._id });
    return e.state;
  },
});
export const claim = internalMutation({
  args: { executionId: v.id("commissionExecutions") },
  handler: async (ctx, { executionId }) => {
    const e = await ctx.db.get(executionId);
    if (!e || ["confirmed", "conflict", "failed"].includes(e.state))
      return null;
    // An interrupted claim is never retried as a new send. It becomes a lookup after its lease.
    if (e.state === "sending" && Date.now() < e.claimedAt + 15000) return null;
    const c = await campaignFor(ctx, e),
      t = transport();
    // Owned test worker suspension simulates a queue outage before its claim.
    // No public operation or production campaign can enable this control.
    if (
      controlled(c) &&
      process.env.COMMISSION_FIXTURE_WORKER_PAUSED === "true"
    )
      return null;
    if (!controlled(c) || !t || t.binding !== e.binding.transportBinding) {
      await update(
        ctx,
        e,
        e.generation ? "unknown" : "held",
        "Actual provider contract #66 or original controlled transport unavailable",
        "commission-dispatcher",
      );
      return null;
    }
    const reconcile = e.generation > 0;
    if (!reconcile) {
      if (
        await earningsHeld(
          ctx,
          e.item.details.map((d) => d.entryId),
        )
      ) {
        await update(
          ctx,
          e,
          "held",
          "Temporary fraud review holds unpaid earnings; original obligation remains reserved",
          "commission-dispatcher",
        );
        return null;
      }
      const a = await ctx.db.get(e.approvalId),
        b = a && (await ctx.db.get(a.batchId));
      const valid =
        a &&
        b &&
        !b.superseded &&
        b.cutoff ===
          latestBatchCutoff((await batchNow(ctx, c)) ?? Date.now()) &&
        (await membership(ctx, c, a.actor, "manager")) &&
        (await membership(ctx, c, e.actor, "manager")) &&
        hash(
          await externalInputs(
            ctx,
            c,
            e.binding.creator,
            e.binding.account,
            e.binding.route,
            b.cutoff,
            e.obligation,
          ),
        ) === e.externalBinding;
      if (!valid) {
        await update(
          ctx,
          e,
          "held",
          "External inputs or approval authority changed; reserved original obligation requires review",
          "commission-dispatcher",
        );
        return null;
      }
    }
    const generation = e.generation + 1;
    await update(
      ctx,
      e,
      "sending",
      reconcile
        ? "Reconciling same identity; no replacement send"
        : "Persisted claim before owned dispatch",
      "commission-dispatcher",
      { generation, claimedAt: Date.now() },
    );
    return {
      origin: t.origin,
      secret: t.secret,
      binding: e.binding,
      reconcile,
      generation,
    };
  },
});
export const observe = internalMutation({
  args: {
    executionId: v.id("commissionExecutions"),
    generation: v.number(),
    body: v.optional(v.any()),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.executionId);
    if (!e || args.generation > e.generation || e.generation === 0) return;
    const c = await campaignFor(ctx, e),
      t = transport(),
      body = args.body;
    if (!controlled(c) || !t || t.binding !== e.binding.transportBinding)
      throw Error("COMMISSION_PROVIDER_HELD");
    if (!body) {
      if (
        args.generation === e.generation &&
        !["confirmed", "conflict", "failed"].includes(e.state)
      )
        await update(
          ctx,
          e,
          "unknown",
          "Outcome unknown; reservation retained; reconcile same identity",
          "owned-commission-provider",
        );
      return;
    }
    if (
      args.signature !== commissionSignature(t.secret, body) ||
      stableRequest(body.binding) !== stableRequest(e.binding) ||
      !["pending", "failed", "confirmed"].includes(body.state) ||
      typeof body.providerId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(body.providerId) ||
      !Number.isSafeInteger(body.sequence) ||
      body.sequence < 1 ||
      (body.state === "confirmed" &&
        (typeof body.confirmationReference !== "string" ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(body.confirmationReference)))
    )
      throw Error("COMMISSION_EVIDENCE_BINDING");
    const digest = hash(body);
    const observations = await ctx.db
      .query("commissionExecutionAudit")
      .withIndex("by_execution", (q) => q.eq("executionId", e._id))
      .collect();
    if (observations.some((o) => o.digest === digest)) {
      // A lookup can return the same pending fact after a new claim or an
      // unknown read. Deduplicate evidence, but restore its current projection.
      if (body.state === "pending" && ["sending", "unknown"].includes(e.state))
        await update(
          ctx,
          e,
          "pending",
          "Duplicate pending evidence reconciled; reservation retained",
          "owned-commission-provider",
        );
      return;
    }
    await ctx.db.insert("commissionExecutionAudit", {
      executionId: e._id,
      campaignSlug: e.campaignSlug,
      nonprofitId: e.nonprofitId,
      actor: "owned-commission-provider",
      source: "commission-payments-owned-v1",
      action: "authenticated-provider-observation",
      state: e.state,
      digest,
      at: Date.now(),
      version: 1,
      providerId: body.providerId,
      sequence: body.sequence,
      generation: args.generation,
      outcome: body.state,
      ...(body.state === "confirmed"
        ? { confirmationReference: body.confirmationReference }
        : {}),
    });
    if (e.state === "conflict") {
      await audit(
        ctx,
        e,
        "conflicting-stream-held",
        "owned-commission-provider",
        digest,
      );
      return;
    }
    if (
      (e.providerId && e.providerId !== body.providerId) ||
      (e.confirmationReference &&
        body.state === "confirmed" &&
        e.confirmationReference !== body.confirmationReference) ||
      (e.state === "failed" && body.state === "confirmed") ||
      (e.state === "confirmed" && body.state === "failed")
    ) {
      await update(
        ctx,
        e,
        "conflict",
        "Conflicting authenticated evidence; immutable paid records retained",
        "owned-commission-provider",
        {},
        digest,
      );
      return;
    }
    // Reordered pending events cannot regress terminal evidence.
    if (["confirmed", "failed"].includes(e.state)) {
      await audit(
        ctx,
        e,
        "reordered-evidence-retained",
        "owned-commission-provider",
        digest,
      );
      return;
    }
    if (body.state === "confirmed") {
      const o = (await ctx.db.get(e.obligation))!;
      const {
        _id,
        _creationTime,
        at,
        approvalActor,
        approvalEvidence,
        version,
        ...binding
      } = o;
      const evidence =
        "Owned controlled ledger confirmation; not actual Stripe or bank settlement";
      await recordTrustedCommissionPayment(
        ctx,
        {
          ...binding,
          paymentId: body.confirmationReference,
          evidence,
          confirmedAt: Date.now(),
          status: "confirmed",
        },
        {
          source: "commission-payments-owned-v1",
          actor: "owned-commission-provider",
          evidence,
          synthetic: true,
        },
      );
    }
    await update(
      ctx,
      e,
      body.state,
      body.state === "confirmed"
        ? "Controlled ledger confirmed; actual #66 held"
        : body.state === "failed"
          ? "Confirmed nonsettlement; reservation retained; no replacement send"
          : "Owned provider pending; reservation retained",
      "owned-commission-provider",
      {
        providerId: body.providerId,
        ...(body.state === "confirmed"
          ? { confirmationReference: body.confirmationReference }
          : {}),
      },
      digest,
    );
  },
});
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const e of await ctx.db.query("commissionExecutions").collect())
      if (
        ["proposed", "pending", "unknown", "sending"].includes(e.state) &&
        Date.now() - e.updatedAt > 15000
      )
        await ctx.scheduler.runAfter(0, job, { executionId: e._id });
  },
});
async function projection(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  creator?: string,
) {
  const rows = (
    await ctx.db
      .query("commissionExecutions")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter(
    (e) =>
      e.nonprofitId === c.nonprofitId &&
      (!creator || e.binding.creator === creator),
  );
  return {
    production: "held-66" as const,
    contract:
      "Owned controlled ledger only; no actual Stripe or bank settlement",
    prizes:
      "Separate contractual performance-bonus execution; production remains held",
    items: await Promise.all(
      rows.map(async (e) => ({
        id: e._id,
        ...(creator ? {} : { creator: e.binding.creator }),
        amountCents: e.binding.amountCents,
        state: e.state,
        reason: e.reason,
        details: e.item.details,
        providerReference: e.providerId ?? null,
        confirmationReference: e.confirmationReference ?? null,
        at: e.at,
        updatedAt: e.updatedAt,
        audit: (
          await ctx.db
            .query("commissionExecutionAudit")
            .withIndex("by_execution", (q) => q.eq("executionId", e._id))
            .collect()
        ).map((a) => ({
          action: a.action,
          state: a.state,
          source: a.source,
          at: a.at,
          version: a.version,
          ...(a.providerId ? { providerReference: a.providerId } : {}),
          ...(a.confirmationReference
            ? { confirmationReference: a.confirmationReference }
            : {}),
          ...(a.outcome ? { outcome: a.outcome } : {}),
          ...(creator ? {} : { actor: a.actor, digest: a.digest }),
        })),
      })),
    ),
  };
}
export type CommissionView = Awaited<ReturnType<typeof projection>>;
export const read = query({
  args: {
    ...scope,
    audience: v.union(v.literal("manager"), v.literal("creator")),
  },
  handler: async (ctx, args) => {
    const access =
      args.audience === "manager"
        ? await paidManager(ctx, args.campaignId)
        : await acceptedCreator(ctx, args.campaignId);
    return projection(
      ctx,
      access.campaign,
      args.audience === "creator" ? access.subject : undefined,
    );
  },
});
