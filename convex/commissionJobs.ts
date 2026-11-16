import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./functions.ts";
import { controlledCommission } from "./commissionTransport.ts";
const claim = makeFunctionReference<"mutation", any, any>(
  "commissionPayments:claim",
);
const observe = makeFunctionReference<"mutation", any, any>(
  "commissionPayments:observe",
);
export const run = internalAction({
  args: { executionId: v.id("commissionExecutions") },
  handler: async (ctx, args) => {
    const work = await ctx.runMutation(claim, args);
    if (!work) return;
    const result = await controlledCommission(work);
    await ctx.runMutation(observe, {
      ...args,
      generation: work.generation,
      ...(result ?? {}),
    });
  },
});
