import { chicagoDay } from "./allocation/chicago.ts";
import { nextPrizeBatch } from "./finalizationPolicy.ts";
import { competitionPeriod } from "./competitionPolicy.ts";

// Civil-week arithmetic preserves Chicago noon across both DST transitions.
export function latestBatchCutoff(now: number) {
  const next = nextPrizeBatch(now);
  const previousDay = chicagoDay(next - 7 * 86400000);
  return previousDay.end - 12 * 3600000;
}
export function batchWeek(cutoff: number) {
  const current = competitionPeriod("weekly", cutoff);
  return competitionPeriod("weekly", current.start - 1);
}
