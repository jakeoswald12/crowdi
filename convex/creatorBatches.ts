import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
  type Doc,
} from "./functions.ts";
import { paidManager } from "./paidCorrections.ts";
import { acceptedCreator } from "./creatorAccess.ts";
import { batchContents } from "./creatorBatchContents.ts";
import { latestBatchCutoff } from "./batchPolicy.ts";
import { nextPrizeBatch } from "./finalizationPolicy.ts";
import { operationIdentity } from "./access.ts";
import { recordTrustedIncident } from "./operatorIncidents.ts";
import { unpaidPrizeLiabilities } from "./prizeFinalization.ts";

const wakeRef = makeFunctionReference<"mutation", { campaignId: string }>(
  "creatorBatches:wake",
);
const scope = { campaignId: v.string() };
export async function batchNow(ctx: QueryCtx, c: Doc<"campaigns">) {
  if (c.fixtureRunId) {
    if (c.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
      throw Error("BATCH_FIXTURE_SCOPE");
    return (
      (
        await ctx.db
          .query("creatorBatchClocks")
          .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
          .unique()
      )?.now ?? null
    );
  }
  return Date.now();
}
async function batches(ctx: QueryCtx, c: Doc<"campaigns">) {
  return (
    await ctx.db
      .query("creatorBatches")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((b) => b.nonprofitId === c.nonprofitId);
}
async function audit(
  ctx: MutationCtx,
  b: Doc<"creatorBatches">,
  action: string,
  actor: string,
) {
  await ctx.db.insert("creatorBatchAudit", {
    campaignSlug: b.campaignSlug,
    nonprofitId: b.nonprofitId,
    batchId: b._id,
    revision: b.revision,
    fingerprint: b.fingerprint,
    items: b.items,
    action,
    actor,
    source: "creator-batches-v1",
    at: Date.now(),
    version: 1,
  });
}
async function notice(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  b: Doc<"creatorBatches">,
) {
  await recordTrustedIncident(
    ctx,
    {
      campaignId: c.slug,
      key: `batch-ready:${b._id}:${b.revision}`,
      kind: "batch-ready",
      sequence: 1,
      observedAt: Date.now(),
      active: true,
      reason:
        "Creator batch is ready for exact review. Changed contents require fresh approval; payment execution remains held.",
      evidence: `Batch ${b._id}; revision ${b.revision}; USD; provider settlement not established`,
      resolutionRole: "manager",
    },
    {
      producer: "creator-batches-v1",
      actor: "creator-batch-scheduler",
      synthetic: !!c.fixtureRunId,
    },
  );
}
export async function prepareCreatorBatch(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
) {
  const settings = await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .unique();
  if (!settings || settings.nonprofitId !== c.nonprofitId) return null;
  const now = await batchNow(ctx, c);
  if (now === null) return null;
  const cutoff = latestBatchCutoff(now);
  if (cutoff < nextPrizeBatch(Date.parse(settings.rules.earningStart) - 1))
    return null;
  const history = await batches(ctx, c),
    active = history.find((b) => !b.superseded);
  if (active && active.cutoff > cutoff) return active; // Reordered recovery cannot move the schedule backwards.
  const content = await batchContents(ctx, c, cutoff);
  if (active?.cutoff === cutoff && active.fingerprint === content.fingerprint)
    return active;
  if (active?.cutoff === cutoff) {
    await ctx.db.patch(active._id, {
      ...content,
      revision: active.revision + 1,
    });
    const updated = (await ctx.db.get(active._id))!;
    await audit(
      ctx,
      updated,
      "contents-changed-approval-invalidated",
      "creator-batch-scheduler",
    );
    await notice(ctx, c, updated);
    return updated;
  }
  // One active cumulative batch owns unpaid sources. A missed interval creates
  // one catch-up batch, not duplicate payable copies for every missed week.
  if (active) {
    await ctx.db.patch(active._id, { superseded: true });
    await audit(
      ctx,
      active,
      "superseded-by-catch-up",
      "creator-batch-scheduler",
    );
  }
  const id = await ctx.db.insert("creatorBatches", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    cutoff,
    ...content,
    preparedAt: now,
    revision: 1,
    superseded: false,
    actor: "creator-batch-scheduler",
    source: "creator-batches-v1",
    version: 1,
  });
  const created = (await ctx.db.get(id))!;
  await audit(ctx, created, "prepared", "creator-batch-scheduler");
  await notice(ctx, c, created);
  // Production exact scheduled mutation plus cron recovery. Controlled clocks
  // advance through the same function without scheduling historical wall times.
  if (!c.fixtureRunId)
    await ctx.scheduler.runAt(nextPrizeBatch(now), wakeRef, {
      campaignId: c.slug,
    });
  return created;
}
export async function ensureCreatorBatchSchedule(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
) {
  const prepared = await prepareCreatorBatch(ctx, c);
  if (!prepared && !c.fixtureRunId)
    await ctx.scheduler.runAt(nextPrizeBatch(Date.now()), wakeRef, {
      campaignId: c.slug,
    });
}
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const c of await ctx.db.query("campaigns").collect())
      await prepareCreatorBatch(ctx, c);
  },
});
export const wake = internalMutation({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", campaignId))
      .unique();
    if (c) await ensureCreatorBatchSchedule(ctx, c);
  },
});
async function projection(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  creator?: string,
) {
  const history = await batches(ctx, c),
    active = history.find((b) => !b.superseded);
  const upcomingPrizes = (
    await unpaidPrizeLiabilities(ctx, c, Number.MAX_SAFE_INTEGER)
  )
    .filter(
      (p) =>
        (!creator || p.creator === creator) &&
        (!active || p.batchEligibleAt > active.cutoff),
    )
    .map((p) => ({
      id: p._id,
      entryId: p.entryId,
      period: p.period,
      amountCents: p.amountCents,
      batchEligibleAt: p.batchEligibleAt,
      state: p.state,
    }));
  if (!active)
    return {
      batch: null,
      history: [],
      upcomingPrizes,
      execution: "provider-held" as const,
    };
  const current = await batchContents(ctx, c, active.cutoff);
  const approvals = await ctx.db
    .query("creatorBatchApprovals")
    .withIndex("by_batch", (q) => q.eq("batchId", active._id))
    .collect();
  const matching = approvals.filter(
    (a) =>
      a.fingerprint === current.fingerprint && a.revision === active.revision,
  );
  let managerApproved = false;
  let approvalId: Doc<"creatorBatchApprovals">["_id"] | null = null;
  for (const approval of matching) {
    const manager = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", approval.actor).eq("nonprofitId", c.nonprofitId),
      )
      .unique();
    if (manager?.active && manager.role === "manager") {
      managerApproved = true;
      approvalId = approval._id;
      break;
    }
  }
  const approved =
    managerApproved &&
    active.fingerprint === current.fingerprint &&
    active.cutoff === latestBatchCutoff((await batchNow(ctx, c)) ?? Date.now());
  const items = current.items
    .filter((i) => !creator || i.creator === creator)
    .map((i) =>
      creator
        ? {
            key: i.key,
            kind: i.kind,
            amountCents: i.amountCents,
            carryforwardCents: i.carryforwardCents,
            reservedCents: i.reservedCents,
            paidCents: i.paidCents,
            details: i.details,
            state: i.state,
            guidance: i.guidance,
          }
        : i,
    );
  return {
    upcomingPrizes,
    batch: {
      id: active._id,
      cutoff: active.cutoff,
      week: active.week,
      preparedAt: active.preparedAt,
      revision: active.revision,
      fingerprint: creator ? null : current.fingerprint,
      approvalId: creator || !approved ? null : approvalId,
      state: approved
        ? "approved"
        : approvals.length
          ? "approval-required"
          : "awaiting-approval",
      items,
    },
    history: creator
      ? []
      : history.map((b) => ({
          id: b._id,
          cutoff: b.cutoff,
          revision: b.revision,
          superseded: b.superseded,
        })),
    execution: "provider-held" as const,
  };
}
export const read = query({
  args: {
    ...scope,
    audience: v.union(v.literal("manager"), v.literal("creator")),
  },
  handler: async (ctx, { campaignId, audience }) => {
    const access =
      audience === "manager"
        ? await paidManager(ctx, campaignId)
        : await acceptedCreator(ctx, campaignId);
    return projection(
      ctx,
      access.campaign,
      audience === "creator" ? access.subject : undefined,
    );
  },
});
export type BatchView = Awaited<ReturnType<typeof projection>>;
export const refresh = mutation({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await paidManager(ctx, campaignId);
    await prepareCreatorBatch(ctx, campaign);
    return projection(ctx, campaign);
  },
});
export const approve = mutation({
  args: {
    ...scope,
    batchId: v.id("creatorBatches"),
    revision: v.number(),
    fingerprint: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId);
    operationIdentity(args.operationId);
    const b = await ctx.db.get(args.batchId);
    if (
      !b ||
      b.campaignSlug !== campaign.slug ||
      b.nonprofitId !== campaign.nonprofitId
    )
      throw Error("FORBIDDEN: Batch access denied");
    const current = await batchContents(ctx, campaign, b.cutoff);
    if (
      b.superseded ||
      b.cutoff !==
        latestBatchCutoff((await batchNow(ctx, campaign)) ?? Date.now()) ||
      b.revision !== args.revision ||
      b.fingerprint !== args.fingerprint ||
      current.fingerprint !== args.fingerprint
    )
      throw Error(
        "BATCH_CHANGED: Refresh and review exact current contents before approval",
      );
    const prior = await ctx.db
      .query("creatorBatchApprovals")
      .withIndex("by_operation", (q) =>
        q.eq("campaignSlug", campaign.slug).eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (
        prior.batchId !== b._id ||
        prior.fingerprint !== args.fingerprint ||
        prior.actor !== subject ||
        prior.revision !== args.revision
      )
        throw Error("OPERATION_CONFLICT");
      return prior._id;
    }
    const same = (
      await ctx.db
        .query("creatorBatchApprovals")
        .withIndex("by_batch", (q) => q.eq("batchId", b._id))
        .collect()
    ).find(
      (a) =>
        a.revision === b.revision &&
        a.fingerprint === b.fingerprint &&
        a.actor === subject,
    );
    if (same) return same._id;
    const id = await ctx.db.insert("creatorBatchApprovals", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      batchId: b._id,
      revision: b.revision,
      fingerprint: b.fingerprint,
      items: current.items,
      operationId: args.operationId,
      actor: subject,
      source: "creatorBatches:approve",
      at: Date.now(),
      version: 1,
    });
    await audit(ctx, b, "exact-contents-approved-provider-held", subject);
    return id;
  },
});
export const history = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await paidManager(ctx, campaignId);
    return ctx.db
      .query("creatorBatchAudit")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
  },
});
