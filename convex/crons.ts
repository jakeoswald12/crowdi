import { cronJobs, makeFunctionReference } from "convex/server";
const crons = cronJobs();
crons.interval(
  "recover bonus outcomes",
  { minutes: 1 },
  makeFunctionReference<"mutation", Record<string, never>>(
    "bonusPayments:recover",
  ),
  {},
);
crons.interval(
  "recover commission outcomes",
  { minutes: 1 },
  makeFunctionReference<"mutation", Record<string, never>>(
    "commissionPayments:recover",
  ),
  {},
);
crons.interval(
  "recover weekly creator batches",
  { minutes: 1 },
  makeFunctionReference<"mutation", Record<string, never>>(
    "creatorBatches:recover",
  ),
  {},
);
crons.interval(
  "recover incomplete competition periods",
  { minutes: 1 },
  makeFunctionReference<"mutation", Record<string, never>>(
    "prizeFinalization:recover",
  ),
  {},
);
export default crons;
