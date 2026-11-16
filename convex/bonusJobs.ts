import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./functions.ts";
import { controlledBonus } from "./bonusTransport.ts";
const claim = makeFunctionReference<"mutation", any, any>(
  "bonusPayments:claim",
);
const observe = makeFunctionReference<"mutation", any, any>(
  "bonusPayments:observe",
);
export const run = internalAction({
  args: { executionId: v.id("bonusExecutions") },
  handler: async (ctx, args) => {
    const work = await ctx.runMutation(claim, args);
    if (!work) return;
    const result = await controlledBonus(work);
    await ctx.runMutation(observe, {
      ...args,
      generation: work.generation,
      ...(result ?? {}),
    });
  },
});
