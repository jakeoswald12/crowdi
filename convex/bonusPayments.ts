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
import { earningsHeld } from "./participationPolicy.ts";
import { batchNow } from "./creatorBatches.ts";
import { latestBatchCutoff } from "./batchPolicy.ts";
import { prizeCoverage } from "./prizeFunds.ts";
import { bonusLedger } from "./bonusLedger.ts";
import { updateBonusCorrectionStatus } from "./bonusCorrections.ts";
import { bonusSignature } from "./bonusTransport.ts";

const scope = { campaignId: v.string() };
const job = makeFunctionReference<
  "action",
  { executionId: Doc<"bonusExecutions">["_id"] }
>("bonusJobs:run");
const controlled = (c: Doc<"campaigns">) =>
  !!c.fixtureRunId &&
  c.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID;
function transport() {
  const origin = process.env.BONUS_FIXTURE_ORIGIN,
    secret = process.env.BONUS_FIXTURE_SECRET;
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
async function audit(
  ctx: MutationCtx,
  e: Doc<"bonusExecutions">,
  action: string,
  actor: string,
  digest = hash(e.binding),
) {
  await ctx.db.insert("bonusExecutionAudit", {
    executionId: e._id,
    campaignSlug: e.campaignSlug,
    nonprofitId: e.nonprofitId,
    actor,
    source: "bonus-payments-owned-v1",
    action,
    state: e.state,
    digest,
    at: Date.now(),
    version: 1,
  });
}
async function update(
  ctx: MutationCtx,
  e: Doc<"bonusExecutions">,
  state: Doc<"bonusExecutions">["state"],
  reason: string,
  actor: string,
  extra: Partial<
    Pick<
      Doc<"bonusExecutions">,
      "providerId" | "confirmationReference" | "generation" | "claimedAt"
    >
  > = {},
  digest?: string,
) {
  await ctx.db.patch(e._id, { state, reason, updatedAt: Date.now(), ...extra });
  await audit(ctx, (await ctx.db.get(e._id))!, reason, actor, digest);
}
async function campaignFor(ctx: QueryCtx, e: Doc<"bonusExecutions">) {
  const c = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", e.campaignSlug))
    .unique();
  if (!c || c.nonprofitId !== e.nonprofitId) throw Error("BONUS_SCOPE");
  return c;
}
// Approval and reservation ownership are distinct. A liability has one durable
// allocation. Only an allocation with no dispatched generation can receive a
// freshly reviewed authorization; every prior authorization remains immutable.
async function exactApproval(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  id: Doc<"creatorBatchApprovals">["_id"],
) {
  const a = await ctx.db.get(id);
  if (!a || a.campaignSlug !== c.slug || a.nonprofitId !== c.nonprofitId)
    throw Error("FORBIDDEN: Approval unavailable");
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
    throw Error("BONUS_APPROVAL_CHANGED");
  return a;
}
async function dispatchApprovalMatches(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  a: Doc<"creatorBatchApprovals">,
  cutoff: number,
) {
  const current = await batchContents(ctx, c, cutoff),
    ledger = await bonusLedger(ctx, c);
  const items = current.items.map((item) => {
    const allocated =
      item.kind === "prize"
        ? ledger.reserved.get(item.key as Doc<"prizeLiabilities">["_id"])
        : undefined;
    const original = a.items.find((i) => i.key === item.key);
    if (
      allocated?.approvalId === a._id &&
      original &&
      item.sourceBinding === original.sourceBinding &&
      item.recipientRevision === original.recipientRevision &&
      item.destinationBinding === original.destinationBinding
    )
      return {
        ...item,
        reservedCents: original.reservedCents,
        guidance: original.guidance,
        state: original.state,
      };
    return item;
  });
  for (const original of a.items)
    if (
      !items.some((i) => i.key === original.key) &&
      ledger.payments.some(
        (p) => p.liability === original.key && p.approvalId === a._id,
      )
    )
      items.push(original);
  items.sort((x, y) => x.key.localeCompare(y.key));
  return (
    hash({ cutoff, items, currency: "USD", execution: "provider-held" }) ===
    a.fingerprint
  );
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
    // Authorization is checked before returning an exact operation retry.
    const prior = await ctx.db
      .query("bonusAuthorizations")
      .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
      .collect();
    if (prior.length) {
      if (
        prior.some(
          (p) =>
            p.actor !== subject ||
            p.approvalId !== args.approvalId ||
            p.binding.campaignId !== c.slug ||
            p.binding.nonprofitId !== c.nonprofitId,
        )
      )
        throw Error("OPERATION_CONFLICT");
      return prior.map((p) => p.executionId);
    }
    const a = await exactApproval(ctx, c, args.approvalId),
      funding = await prizeCoverage(ctx, c);
    const ids: Doc<"bonusExecutions">["_id"][] = [];
    for (const item of a.items) {
      if (
        item.kind !== "prize" ||
        item.sourcePurpose !== "prize" ||
        item.state !== "owed" ||
        item.amountCents <= 0 ||
        !item.destinationBinding
      )
        continue;
      const liability = await ctx.db.get(
        item.key as Doc<"prizeLiabilities">["_id"],
      );
      if (
        !liability ||
        liability.campaignSlug !== c.slug ||
        liability.nonprofitId !== c.nonprofitId ||
        liability.creator !== item.creator ||
        liability.amountCents !== item.amountCents ||
        !Number.isSafeInteger(item.amountCents) ||
        liability.currency !== "USD"
      )
        throw Error("BONUS_SOURCE");
      const old = await ctx.db
        .query("bonusExecutions")
        .withIndex("by_liability", (q) => q.eq("liability", liability._id))
        .unique();
      if (
        old?.generation ||
        (await bonusLedger(ctx, c)).paid.has(liability._id)
      )
        continue;
      if (old?.approvalId === a._id) {
        ids.push(old._id);
        continue;
      }
      const evidence = funding.evidence;
      const binding = {
        key: "bonus-" + hash([c.nonprofitId, c.slug, liability._id]),
        liability: liability._id,
        nonprofitId: c.nonprofitId,
        campaignId: c.slug,
        creator: item.creator,
        amountCents: item.amountCents,
        currency: "USD" as const,
        sourcePurpose: "prize" as const,
        account: evidence?.input.account ?? "production-held",
        route: evidence?.input.route ?? "production-held",
        destination: hash(item.destinationBinding),
        sourceBinding: item.sourceBinding,
        transportBinding: transport()?.binding ?? "production-held",
        approvalId: a._id,
        revision: a.revision,
      };
      const value = {
        approvalId: a._id,
        operationId: args.operationId,
        actor: subject,
        item,
        binding,
        fundingEvidenceId: evidence?._id ?? null,
        state: "proposed" as const,
        reason:
          "Exact contractual performance-bonus approval journaled; payment provider setup remains on hold",
        updatedAt: Date.now(),
      };
      let id: Doc<"bonusExecutions">["_id"];
      if (old) {
        id = old._id;
        await ctx.db.patch(id, value);
      } else
        id = await ctx.db.insert("bonusExecutions", {
          ...value,
          liability: liability._id,
          campaignSlug: c.slug,
          nonprofitId: c.nonprofitId,
          generation: 0,
          claimedAt: 0,
          at: Date.now(),
          version: 1,
        });
      await ctx.db.insert("bonusAuthorizations", {
        executionId: id,
        approvalId: a._id,
        operationId: args.operationId,
        binding,
        item,
        actor: subject,
        source: "bonus-payments-owned-v1",
        at: Date.now(),
        version: 1,
        synthetic: true,
      });
      await audit(
        ctx,
        (await ctx.db.get(id))!,
        old ? "fresh-exact-authorization" : "bonus-journaled",
        subject,
      );
      ids.push(id);
      await ctx.scheduler.runAfter(0, job, { executionId: id });
    }
    return ids;
  },
});
export const recheck = mutation({
  args: { ...scope, executionId: v.id("bonusExecutions") },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId),
      e = await ctx.db.get(args.executionId);
    if (
      !e ||
      e.campaignSlug !== campaign.slug ||
      e.nonprofitId !== campaign.nonprofitId
    )
      throw Error("FORBIDDEN: Bonus unavailable");
    await audit(ctx, e, "same-identity-recheck-requested", subject);
    await ctx.scheduler.runAfter(0, job, { executionId: e._id });
    return e.state;
  },
});
export const claim = internalMutation({
  args: { executionId: v.id("bonusExecutions") },
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
    if (controlled(c) && process.env.BONUS_FIXTURE_WORKER_PAUSED === "true")
      return null;
    if (!controlled(c) || !t || t.binding !== e.binding.transportBinding) {
      await update(
        ctx,
        e,
        e.generation ? "unknown" : "held",
        "Payment provider setup or the original controlled connection is unavailable; funds stay reserved",
        "bonus-dispatcher",
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
          "Temporary fraud review holds unpaid bonus; original liability remains reserved",
          "bonus-dispatcher",
        );
        return null;
      }
      if ((await bonusLedger(ctx, c)).retired.has(e.liability)) {
        await update(
          ctx,
          e,
          "held",
          "Original obligation superseded by confirmed correction; review corrected earnings in a fresh batch",
          "bonus-dispatcher",
        );
        return null;
      }
      const a = await ctx.db.get(e.approvalId),
        b = a && (await ctx.db.get(a.batchId));
      const recipient = await ctx.db
        .query("creatorBatchRecipients")
        .withIndex("by_creator", (q) =>
          q.eq("campaignSlug", c.slug).eq("creator", e.binding.creator),
        )
        .unique();
      const funding = await prizeCoverage(ctx, c);
      // Own reservation is already part of immutable T16 liability coverage.
      // It is never subtracted from purpose cash or required coverage twice.
      const valid =
        a &&
        b &&
        !b.superseded &&
        b.cutoff ===
          latestBatchCutoff((await batchNow(ctx, c)) ?? Date.now()) &&
        (await membership(ctx, c, a.actor, "manager")) &&
        (await membership(ctx, c, e.actor, "manager")) &&
        (await dispatchApprovalMatches(ctx, c, a, b.cutoff)) &&
        (await membership(ctx, c, e.binding.creator, "creator")) &&
        recipient?.nonprofitId === c.nonprofitId &&
        recipient.restriction === "reviewable" &&
        recipient.revision === e.item.recipientRevision &&
        recipient.destinationBinding &&
        hash(recipient.destinationBinding) === e.binding.destination &&
        funding.covered &&
        !funding.reason &&
        funding.evidence?._id === e.fundingEvidenceId &&
        funding.evidence.input.account === e.binding.account &&
        funding.evidence.input.route === e.binding.route;
      if (!valid) {
        await update(
          ctx,
          e,
          "held",
          "Approval, recipient or purpose funding changed; reserved and owed; refresh and approve exact contents again",
          "bonus-dispatcher",
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
      "bonus-dispatcher",
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
    executionId: v.id("bonusExecutions"),
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
      throw Error("BONUS_PROVIDER_HELD");
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
          "owned-bonus-provider",
        );
      return;
    }
    if (
      args.signature !== bonusSignature(t.secret, body) ||
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
      throw Error("BONUS_EVIDENCE_BINDING");
    const digest = hash(body);
    const observations = await ctx.db
      .query("bonusExecutionAudit")
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
          "owned-bonus-provider",
        );
      return;
    }
    await ctx.db.insert("bonusExecutionAudit", {
      executionId: e._id,
      campaignSlug: e.campaignSlug,
      nonprofitId: e.nonprofitId,
      actor: "owned-bonus-provider",
      source: "bonus-payments-owned-v1",
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
        "owned-bonus-provider",
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
        "owned-bonus-provider",
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
        "owned-bonus-provider",
        digest,
      );
      return;
    }
    if (body.state === "confirmed") {
      const existing = await ctx.db
        .query("bonusPayments")
        .withIndex("by_liability", (q) => q.eq("liability", e.liability))
        .unique();
      if (!existing) {
        const paymentId = await ctx.db.insert("bonusPayments", {
          campaignSlug: e.campaignSlug,
          nonprofitId: e.nonprofitId,
          liability: e.liability,
          executionId: e._id,
          approvalId: e.approvalId,
          binding: e.binding,
          amountCents: e.binding.amountCents,
          currency: "USD",
          providerId: body.providerId,
          confirmationReference: body.confirmationReference,
          confirmationDigest: digest,
          confirmedAt: Date.now(),
          actor: "owned-bonus-provider",
          source: "bonus-payments-owned-v1",
          at: Date.now(),
          version: 1,
          synthetic: true,
        });
        await updateBonusCorrectionStatus(ctx, (await ctx.db.get(paymentId))!);
      }
    }
    await update(
      ctx,
      e,
      body.state,
      body.state === "confirmed"
        ? "Controlled ledger confirmed; actual payment provider setup remains on hold"
        : body.state === "failed"
          ? "Confirmed nonsettlement; reservation retained; no replacement send"
          : "Owned provider pending; reservation retained",
      "owned-bonus-provider",
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
    for (const e of await ctx.db.query("bonusExecutions").collect())
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
      .query("bonusExecutions")
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
    synthetic: true,
    items: await Promise.all(
      rows.map(async (e) => ({
        id: e._id,
        ...(creator ? {} : { creator: e.binding.creator }),
        amountCents: e.binding.amountCents,
        state: e.state,
        reason: e.reason,
        details: e.item.details,
        synthetic: true,
        liability: e.liability,
        providerReference: e.providerId ?? null,
        confirmationReference: e.confirmationReference ?? null,
        at: e.at,
        updatedAt: e.updatedAt,
        audit: (
          await ctx.db
            .query("bonusExecutionAudit")
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
export type BonusView = Awaited<ReturnType<typeof projection>>;
export const history = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await paidManager(ctx, campaignId),
      ledger = await bonusLedger(ctx, campaign);
    return {
      payments: ledger.payments,
      reservations: ledger.allocations,
      stillReserved: ledger.reservations,
      authorizations: (
        await Promise.all(
          ledger.allocations.map((e) =>
            ctx.db
              .query("bonusAuthorizations")
              .withIndex("by_execution", (q) => q.eq("executionId", e._id))
              .collect(),
          ),
        )
      ).flat(),
      production: "held-66-89" as const,
    };
  },
});
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
