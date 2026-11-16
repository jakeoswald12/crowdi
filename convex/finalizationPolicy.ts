import { chicagoDay } from "./allocation/chicago.ts";
export const finalizationDelay = 48 * 3600000;
export const recoveryCadence = 60000;
// Half-open preparation cutoff: exact Wednesday noon belongs to next week.
export function nextPrizeBatch(finalizedAt: number) {
  const day = chicagoDay(finalizedAt);
  const weekday = new Date(day.label + "T12:00:00Z").getUTCDay();
  const distance = (3 - weekday + 7) % 7;
  const candidateDay = chicagoDay(
    Date.parse(day.label + "T12:00:00Z") + distance * 86400000,
  );
  // Noon is unambiguous in Chicago. Resolve using that day's actual local offset.
  const noon = (d: ReturnType<typeof chicagoDay>) =>
    chicagoDay(d.end - 1).end - 12 * 3600000;
  const candidate = noon(candidateDay);
  return candidate > finalizedAt
    ? candidate
    : noon(chicagoDay(candidateDay.start + 7 * 86400000 + 12 * 3600000));
}
