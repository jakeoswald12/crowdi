import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v, type Infer } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import {
  advertisingGoal,
  advertisingRequest,
  advertisingResult,
} from "./advertisingSchema.ts";
import { paidProvider } from "./paidMetricSchema.ts";
import { requestFingerprint } from "./requestFingerprint.ts";
import { creativeBinding } from "./paidMetrics.ts";
import { trackedPath } from "./publicViewer.ts";

type Setup = Doc<"advertisingSetups">;
type Operation = Doc<"advertisingOperations">;
type Result = Infer<typeof advertisingResult>;
const scope = { campaignId: v.string() };
const expirationJob = makeFunctionReference<
  "mutation",
  {
    requestId: Operation["_id"];
    setupRevision: number;
    expiresAt: number;
  }
>("advertising:expire");
const actualGate =
  "Actual developer application, nonprofit ownership, grant and placement evidence remains required (#12).";
const providerGuides = {
  meta: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization",
  tiktok: "https://business-api.tiktok.com/portal/docs?id=1738373141733378",
};
function reference(value: string) {
  if (
    !/^[A-Za-z0-9_./:-]{1,160}$/.test(value) ||
    /bearer|secret|token|sk_live|sk_test/i.test(value)
  )
    throw new Error("ADVERTISING_SCOPE: Invalid redacted provider reference");
}
async function records(ctx: QueryCtx, campaignId: string) {
  const [setups, operations] = await Promise.all([
    ctx.db
      .query("advertisingSetups")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect(),
    ctx.db
      .query("advertisingOperations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect(),
  ]);
  return { setups, operations };
}
async function audit(
  ctx: MutationCtx,
  setup: Pick<Setup, "campaignSlug" | "nonprofitId" | "provider" | "revision">,
  actor: string,
  operationId: string,
  fingerprint: string,
  action: string,
  reason: string,
) {
  await ctx.db.insert("advertisingAudit", {
    campaignSlug: setup.campaignSlug,
    nonprofitId: setup.nonprofitId,
    provider: setup.provider,
    setupRevision: setup.revision,
    actor,
    source: "advertising-v1",
    at: Date.now(),
    version: 1,
    operationId,
    fingerprint,
    action,
    reason,
  });
}
async function currentActor(
  ctx: QueryCtx,
  nonprofitId: string,
  subject: string,
) {
  const [member, administrator] = await Promise.all([
    ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", subject).eq("nonprofitId", nonprofitId),
      )
      .unique(),
    ctx.db
      .query("operators")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique(),
  ]);
  return (
    !!(member?.active && member.role === "manager") ||
    administrator?.active === true
  );
}
async function creative(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  entryId: Doc<"photoEntries">["_id"],
) {
  const entry = await ctx.db.get(entryId);
  if (
    !entry ||
    entry.campaignSlug !== campaign.slug ||
    entry.nonprofitId !== campaign.nonprofitId
  )
    throw new Error("FORBIDDEN: Advertising creative access denied");
  const version = await ctx.db
    .query("photoVersions")
    .withIndex("by_entry_version", (q) =>
      q.eq("entryId", entryId).eq("version", entry.version),
    )
    .unique();
  if (!version || entry.status !== "approved")
    throw new Error("ADVERTISING_BLOCKED: Current approved creative required");
  return { entry, version, digest: creativeBinding(version) };
}
function latest(
  operations: Operation[],
  setup: Setup,
  action: Operation["action"],
) {
  return operations
    .filter(
      (o) =>
        o.provider === setup.provider &&
        o.setupRevision === setup.revision &&
        o.action === action,
    )
    .sort((a, b) => b._creationTime - a._creationTime)[0];
}
function observationReason(
  result: Result | undefined,
  now: number,
  expiredAt?: number,
) {
  if (!result) return "Trusted provider capability evidence is missing.";
  if (expiredAt !== undefined || result.expiresAt <= now)
    return "Provider capability evidence expired; reconnect and validate again.";
  return null;
}
async function grantState(
  ctx: QueryCtx,
  setup: Setup,
  operations: Operation[],
  now: number,
) {
  const discovery = latest(operations, setup, "discover");
  const discovered = discovery?.result;
  if (!discovery || discovery.state !== "succeeded")
    return {
      op: undefined,
      reason:
        discovery?.reason ?? "Trusted nonprofit account discovery is missing.",
    };
  if (!(await currentActor(ctx, setup.nonprofitId, discovery.actor)))
    return {
      op: undefined,
      reason: "The discovery requester's current scoped authority was revoked.",
    };
  if (discovered?.kind !== "discovery" || !discovered.supported)
    return {
      op: undefined,
      reason:
        "Provider discovery capability is unsupported; advertising is blocked.",
    };
  const discoveryReason = observationReason(
    discovered,
    now,
    discovery.capabilityExpiredAt,
  );
  if (discoveryReason) return { op: undefined, reason: discoveryReason };
  const op = latest(operations, setup, "authorize");
  if (!op)
    return {
      op,
      reason:
        "A nonprofit-owned advertiser account and delegated grant are missing.",
    };
  if (!(await currentActor(ctx, setup.nonprofitId, op.actor)))
    return {
      op,
      reason: "The grant requester's current scoped authority was revoked.",
    };
  if (op.state !== "succeeded")
    return {
      op,
      reason:
        op.state === "pending" && op.expiresAt <= now
          ? "Provider setup response expired; retry with a new request."
          : op.reason,
    };
  const result = op.result;
  let reason = observationReason(result, now, op.capabilityExpiredAt);
  if (!reason && result?.kind === "grant") {
    if (
      !discovered.accounts.some(
        (account) =>
          account.accountId === result.accountId &&
          account.ownerNonprofitId === setup.nonprofitId,
      )
    )
      reason =
        "The granted nonprofit account is missing from current provider discovery.";
    else if (result.status !== "granted")
      reason = `Provider grant is ${result.status}; advertising is blocked.`;
    else if (!result.permissions.includes("manage_ads"))
      reason =
        "Read or discovery permissions do not authorize advertising writes.";
  } else if (!reason) reason = "Trusted scoped grant is missing.";
  return { op, reason };
}
async function contractState(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  setup: Setup,
  operations: Operation[],
) {
  const grant = await grantState(ctx, setup, operations, Date.now());
  if (grant.reason) return { controlledReady: false, reason: grant.reason };
  const validation = latest(operations, setup, "validate");
  if (!validation)
    return {
      controlledReady: false,
      reason:
        "Validate the actual objective, placement, media and brand identity for an approved creative.",
    };
  if (!(await currentActor(ctx, setup.nonprofitId, validation.actor)))
    return {
      controlledReady: false,
      reason:
        "The validation requester's current scoped authority was revoked.",
    };
  if (validation.state !== "succeeded")
    return {
      controlledReady: false,
      reason:
        validation.state === "pending" && validation.expiresAt <= Date.now()
          ? "Provider validation response expired; submit a new request."
          : validation.reason,
    };
  const result = validation.result,
    grantResult = grant.op?.result;
  let reason = observationReason(
    result,
    Date.now(),
    validation.capabilityExpiredAt,
  );
  if (!reason && result?.kind === "contract" && grantResult?.kind === "grant") {
    if (
      validation.grantRevision !== grantResult.grantRevision ||
      result.accountId !== grantResult.accountId
    )
      reason =
        "The grant changed; validate the current account and grant again.";
    else if (result.identityStatus !== "authorized")
      reason = `Brand identity is ${result.identityStatus}; advertising is blocked.`;
    else if (result.mediaStatus !== "accepted")
      reason = `Provider placement media is ${result.mediaStatus}; upload acceptance alone is insufficient.`;
    else {
      try {
        const current = await creative(ctx, campaign, result.entryId);
        if (current.digest !== result.creativeDigest)
          reason =
            "Creative media changed; provider placement validation is stale.";
      } catch {
        reason =
          "The creative is no longer approved or available for this campaign.";
      }
    }
  } else if (!reason)
    reason = "Trusted objective, media and identity contract is missing.";
  return {
    controlledReady: !reason,
    validatedScope:
      !reason && result?.kind === "contract"
        ? {
            entryId: result.entryId,
            creativeDigest: result.creativeDigest,
            accountId: result.accountId,
            goal: result.goal,
            setupRevision: setup.revision,
            grantRevision: result.grantRevision,
            objective: result.objective,
            optimization: result.optimization,
            placement: result.placement,
            identityId: result.identityId,
          }
        : null,
    reason:
      reason ??
      "Controlled objective, media and identity validation passed. Real provider acceptance remains unvalidated.",
  };
}
export const read = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    const { setups, operations } = await records(ctx, campaignId);
    const entries = await ctx.db
      .query("photoEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect();
    const providers = await Promise.all(
      (["meta", "tiktok"] as const).map(async (provider) => {
        const setup = setups.find((s) => s.provider === provider);
        if (!setup)
          return {
            provider,
            revision: 0,
            goal: "awareness" as const,
            accounts: [],
            grant: null,
            controlledReady: false,
            reason:
              "Start provider-supported guided setup for nonprofit-owned assets.",
            productionReady: false as const,
            guide: providerGuides[provider],
          };
        const discovery = latest(operations, setup, "discover"),
          result = discovery?.result;
        const accounts =
          discovery?.state === "succeeded" &&
          result?.kind === "discovery" &&
          result.supported &&
          !observationReason(result, Date.now(), discovery.capabilityExpiredAt)
            ? result.accounts
            : [];
        const grant = await grantState(ctx, setup, operations, Date.now());
        const status = await contractState(ctx, campaign, setup, operations);
        return {
          provider,
          revision: setup.revision,
          goal: setup.goal,
          accounts,
          grant: grant.op?.result?.kind === "grant" ? grant.op.result : null,
          ...status,
          productionReady: false as const,
          guide: providerGuides[provider],
          discoveryReason:
            discovery?.reason ?? "Discovery evidence is missing.",
        };
      }),
    );
    return {
      campaignId,
      nonprofitId: campaign.nonprofitId,
      publicRollout: "adoption.is",
      synthetic: !!campaign.fixtureRunId,
      productionReady: false as const,
      actualGate,
      providers,
      entries: entries
        .filter(
          (e) =>
            e.nonprofitId === campaign.nonprofitId && e.status === "approved",
        )
        .map((e) => ({ id: e._id, version: e.version })),
      operations: operations.map(
        ({ resultFingerprint: _, fingerprint: __, ...op }) => op,
      ),
      audit: await ctx.db
        .query("advertisingAudit")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect(),
    };
  },
});
export const selectGoal = mutation({
  args: {
    ...scope,
    provider: paidProvider,
    expectedVersion: v.number(),
    operationId: v.string(),
    goal: advertisingGoal,
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    operationIdentity(args.operationId);
    const fingerprint = requestFingerprint(args),
      { setups } = await records(ctx, campaign.slug);
    const prior = await ctx.db
      .query("advertisingAudit")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", campaign.slug)
          .eq("actor", subject)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT: Advertising goal retry changed");
      return { revision: prior.setupRevision };
    }
    const setup = setups.find((s) => s.provider === args.provider);
    if ((setup?.revision ?? 0) !== args.expectedVersion)
      throw new Error("ADVERTISING_STALE: Reload current setup revision");
    const revision = (setup?.revision ?? 0) + 1;
    const next = {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      provider: args.provider,
      goal: args.goal,
      revision,
      actor: subject,
      source: "advertising:selectGoal",
      at: Date.now(),
    };
    if (setup) await ctx.db.patch(setup._id, next);
    else await ctx.db.insert("advertisingSetups", next);
    await audit(
      ctx,
      next,
      subject,
      args.operationId,
      fingerprint,
      "goal-selected",
      "Current account and creative validation is required for this revision.",
    );
    return { revision };
  },
});
export const request = mutation({
  args: advertisingRequest,
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    operationIdentity(args.operationId);
    const fingerprint = requestFingerprint(args);
    const { setups, operations } = await records(ctx, campaign.slug);
    const prior = operations.find(
      (o) => o.actor === subject && o.operationId === args.operationId,
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error(
          "OPERATION_CONFLICT: Advertising request retry changed",
        );
      const setup = setups.find((s) => s.provider === prior.provider);
      if (setup?.revision !== prior.setupRevision)
        throw new Error(
          "ADVERTISING_STALE: Request belongs to an older setup revision",
        );
      if (prior.entryId) {
        const current = await creative(ctx, campaign, prior.entryId);
        if (current.digest !== prior.creativeDigest)
          throw new Error("ADVERTISING_STALE: Creative media changed");
      }
      return {
        ...prior,
        goal: setup.goal,
        fixtureRunId: campaign.fixtureRunId ?? null,
      };
    }
    const reused = await ctx.db
      .query("advertisingAudit")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", campaign.slug)
          .eq("actor", subject)
          .eq("operationId", args.operationId),
      )
      .first();
    if (reused)
      throw new Error(
        "OPERATION_CONFLICT: Advertising operation identity already used",
      );
    let setup = setups.find((s) => s.provider === args.provider);
    if ((setup?.revision ?? 0) !== args.expectedVersion)
      throw new Error("ADVERTISING_STALE: Reload current setup revision");
    if (!campaign.fixtureRunId && campaign.slug !== "adoption")
      throw new Error(
        "ADVERTISING_BLOCKED: First public rollout supports adoption.is only",
      );
    if (
      (args.action === "discover" && (args.accountId || args.entryId)) ||
      (args.action === "authorize" && (!args.accountId || args.entryId)) ||
      (args.action === "validate" && (!args.accountId || !args.entryId))
    )
      throw new Error("ADVERTISING_SCOPE: Exact operation inputs required");
    if (args.accountId) reference(args.accountId);
    if (!setup) {
      if (args.action !== "discover")
        throw new Error("ADVERTISING_BLOCKED: Start guided discovery first");
      const id = await ctx.db.insert("advertisingSetups", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        provider: args.provider,
        revision: 1,
        goal: "awareness",
        actor: subject,
        source: "advertising:request",
        at: Date.now(),
      });
      setup = (await ctx.db.get(id))!;
    }
    let binding: string | undefined, grantRevision: string | undefined;
    if (args.action === "authorize") {
      const discovery = latest(operations, setup, "discover"),
        result = discovery?.result;
      if (
        discovery?.state !== "succeeded" ||
        result?.kind !== "discovery" ||
        !result.supported ||
        observationReason(result, Date.now(), discovery.capabilityExpiredAt) ||
        !result.accounts.some(
          (a) =>
            a.accountId === args.accountId &&
            a.ownerNonprofitId === campaign.nonprofitId,
        )
      )
        throw new Error(
          "ADVERTISING_BLOCKED: Select an account from current trusted nonprofit-owned discovery",
        );
    }
    if (args.action === "validate") {
      const grant = await grantState(ctx, setup, operations, Date.now()),
        result = grant.op?.result;
      if (grant.reason || result?.kind !== "grant")
        throw new Error(`ADVERTISING_BLOCKED: ${grant.reason}`);
      if (result.accountId !== args.accountId)
        throw new Error("FORBIDDEN: Advertising account access denied");
      grantRevision = result.grantRevision;
      binding = (await creative(ctx, campaign, args.entryId!)).digest;
    }
    const expiresAt = Date.now() + 300_000;
    const id = await ctx.db.insert("advertisingOperations", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: "advertising:request",
      at: Date.now(),
      version: 1,
      provider: args.provider,
      operationId: args.operationId,
      fingerprint,
      setupRevision: setup.revision,
      action: args.action,
      accountId: args.accountId,
      entryId: args.entryId,
      creativeDigest: binding,
      grantRevision,
      state: campaign.fixtureRunId ? "pending" : "failed",
      reason: campaign.fixtureRunId
        ? "Provider response pending; advertising remains blocked."
        : `Provider application capability unavailable. ${actualGate}`,
      synthetic: !!campaign.fixtureRunId,
      expiresAt,
    });
    if (campaign.fixtureRunId)
      await ctx.scheduler.runAt(expiresAt, expirationJob, {
        requestId: id,
        setupRevision: setup.revision,
        expiresAt,
      });
    await audit(
      ctx,
      setup,
      subject,
      args.operationId,
      fingerprint,
      "setup-requested",
      "Advertising remains blocked pending scoped provider evidence.",
    );
    return {
      ...(await ctx.db.get(id))!,
      goal: setup.goal,
      fixtureRunId: campaign.fixtureRunId ?? null,
    };
  },
});
const receipt = v.object({
  requestId: v.id("advertisingOperations"),
  fixtureRunId: v.string(),
  at: v.number(),
  result: v.optional(advertisingResult),
  failed: v.boolean(),
});
export const complete = mutation({
  args: { value: receipt, signature: v.string() },
  handler: async (ctx, { value, signature }) => {
    const secret = process.env.ADVERTISING_RECEIPT_SECRET;
    const expected = secret
      ? bytesToHex(
          hmac(
            sha256,
            new TextEncoder().encode(secret),
            new TextEncoder().encode(stableRequest(value)),
          ),
        )
      : "";
    let difference = expected.length ^ signature.length;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
    if (
      !secret ||
      difference ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !Number.isSafeInteger(value.at) ||
      Math.abs(Date.now() - value.at) > 30_000
    )
      throw new Error("FORBIDDEN: Trusted advertising receipt required");
    const op = await ctx.db.get(value.requestId),
      campaign = op
        ? await ctx.db
            .query("campaigns")
            .withIndex("by_slug", (q) => q.eq("slug", op.campaignSlug))
            .unique()
        : null;
    if (
      !op ||
      !campaign?.fixtureRunId ||
      value.fixtureRunId !== campaign.fixtureRunId ||
      campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID ||
      !op.synthetic
    )
      throw new Error(
        "ADVERTISING_HELD: Controlled receipts cannot authorize production advertising",
      );
    if (!(await currentActor(ctx, op.nonprofitId, op.actor)))
      throw new Error("FORBIDDEN: Advertising requester authority revoked");
    const { setups, operations } = await records(ctx, campaign.slug),
      setup = setups.find((s) => s.provider === op.provider);
    if (
      !setup ||
      setup.revision !== op.setupRevision ||
      op.expiresAt <= Date.now()
    )
      throw new Error(
        "ADVERTISING_STALE: Provider response belongs to an expired or older request",
      );
    if (
      op.entryId &&
      (await creative(ctx, campaign, op.entryId)).digest !== op.creativeDigest
    )
      throw new Error("ADVERTISING_STALE: Creative media changed");
    const fingerprint = requestFingerprint({
      result: value.result ?? null,
      failed: value.failed,
    });
    if (op.resultFingerprint) {
      if (op.resultFingerprint !== fingerprint)
        throw new Error(
          "OPERATION_CONFLICT: Provider receipt contents changed",
        );
      return { id: op._id, state: op.state, productionReady: false };
    }
    const result = value.result;
    if (value.failed === !!result)
      throw new Error("ADVERTISING_SCOPE: Exact provider outcome required");
    if (result) {
      for (const [key, field] of Object.entries(result))
        if (typeof field === "string" && key !== "destination")
          reference(field);
      if (
        result.applicationId !== `owned-slander-${op.provider}` ||
        result.nonprofitId !== op.nonprofitId ||
        result.observedAt > Date.now() + 5_000 ||
        result.observedAt < op.at - 5_000 ||
        result.expiresAt <= result.observedAt ||
        result.expiresAt > result.observedAt + 3_600_000 ||
        !Number.isSafeInteger(result.expiresAt) ||
        !Number.isSafeInteger(result.observedAt)
      )
        throw new Error(
          "ADVERTISING_SCOPE: Current Slander application and nonprofit evidence required",
        );
      if (result.kind === "discovery") {
        if (
          op.action !== "discover" ||
          result.accounts.length > 20 ||
          new Set(result.accounts.map((a) => a.accountId)).size !==
            result.accounts.length
        )
          throw new Error(
            "ADVERTISING_SCOPE: Bounded discovery response required",
          );
        for (const account of result.accounts) {
          reference(account.accountId);
          if (account.ownerNonprofitId !== op.nonprofitId)
            throw new Error(
              "ADVERTISING_SCOPE: Nonprofit account ownership mismatch",
            );
        }
      } else if (result.kind === "grant") {
        if (
          op.action !== "authorize" ||
          result.accountId !== op.accountId ||
          result.ownerNonprofitId !== op.nonprofitId ||
          result.permissions.length > 2
        )
          throw new Error(
            "ADVERTISING_SCOPE: Exact nonprofit account and grant scope required",
          );
      } else {
        const grant = await grantState(ctx, setup, operations, Date.now()),
          g = grant.op?.result;
        if (
          op.action !== "validate" ||
          grant.reason ||
          g?.kind !== "grant" ||
          result.accountId !== op.accountId ||
          result.grantRevision !== op.grantRevision ||
          result.grantRevision !== g.grantRevision ||
          result.entryId !== op.entryId ||
          result.creativeDigest !== op.creativeDigest ||
          result.goal !== setup.goal ||
          result.identityOwnerNonprofitId !== op.nonprofitId ||
          result.destination !== trackedPath(result.entryId)
        )
          throw new Error(
            "ADVERTISING_SCOPE: Exact current creative, tracked page and grant required",
          );
        const expectedObjective =
          op.provider === "meta"
            ? setup.goal === "awareness"
              ? "OUTCOME_AWARENESS"
              : "OUTCOME_TRAFFIC"
            : setup.goal === "awareness"
              ? "REACH"
              : "TRAFFIC";
        if (
          result.objective !== expectedObjective ||
          result.optimization !==
            (setup.goal === "awareness" ? "REACH" : "LINK_CLICKS") ||
          !(
            op.provider === "meta"
              ? ["facebook-feed", "instagram-feed"]
              : ["tiktok-feed"]
          ).includes(result.placement)
        )
          throw new Error(
            "ADVERTISING_SCOPE: Unsupported initial objective or placement contract",
          );
      }
    }
    const reason = value.failed
      ? "Provider response failed or unsupported; no capability was granted."
      : "Controlled scoped provider response recorded; real provider acceptance remains unvalidated.";
    await ctx.db.patch(op._id, {
      state: value.failed ? "failed" : "succeeded",
      reason,
      result,
      resultFingerprint: fingerprint,
      completedAt: Date.now(),
    });
    if (result)
      await ctx.scheduler.runAt(result.expiresAt, expirationJob, {
        requestId: op._id,
        setupRevision: op.setupRevision,
        expiresAt: result.expiresAt,
      });
    await audit(
      ctx,
      setup,
      "owned-advertising-adapter",
      op.operationId,
      fingerprint,
      "provider-response-recorded",
      reason,
    );
    return {
      id: op._id,
      state: value.failed ? "failed" : "succeeded",
      productionReady: false,
    };
  },
});
export const expire = internalMutation({
  args: {
    requestId: v.id("advertisingOperations"),
    setupRevision: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.requestId);
    if (!op || op.setupRevision !== args.setupRevision) return;
    const expiresAt =
      op.state === "pending"
        ? op.expiresAt
        : op.state === "succeeded"
          ? op.result?.expiresAt
          : undefined;
    if (
      expiresAt !== args.expiresAt ||
      expiresAt > Date.now() ||
      op.capabilityExpiredAt !== undefined
    )
      return;
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", op.campaignSlug))
      .unique();
    if (
      !campaign ||
      campaign.nonprofitId !== op.nonprofitId ||
      op.synthetic !== !!campaign.fixtureRunId ||
      (campaign.fixtureRunId &&
        campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
    )
      return;
    await ctx.db.patch(op._id, { capabilityExpiredAt: Date.now() });
    await audit(
      ctx,
      {
        campaignSlug: op.campaignSlug,
        nonprofitId: op.nonprofitId,
        provider: op.provider,
        revision: op.setupRevision,
      },
      "trusted-expiry-monitor",
      op.operationId,
      requestFingerprint(args),
      "capability-expired",
      op.state === "pending"
        ? "Provider setup response expired; retry with a new request."
        : "Provider capability evidence expired; reconnect and validate again.",
    );
  },
});
