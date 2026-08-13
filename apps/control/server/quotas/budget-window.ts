export type BudgetDuration = "1d" | "7d" | "30d";

export const budgetDurationMilliseconds: Record<BudgetDuration, number> = {
  "1d": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export function nextBudgetWindow(
  now: Date,
  duration: BudgetDuration,
  storedStart?: Date | null,
  storedReset?: Date | null,
): { startedAt: Date; resetsAt: Date } {
  const length = budgetDurationMilliseconds[duration];
  let startedAt = storedStart && Number.isFinite(storedStart.getTime())
    ? storedStart
    : now;
  let resetsAt = storedReset && Number.isFinite(storedReset.getTime())
    ? storedReset
    : new Date(startedAt.getTime() + length);
  if (resetsAt <= startedAt) resetsAt = new Date(startedAt.getTime() + length);
  if (now >= resetsAt) {
    const elapsedWindows = Math.floor((now.getTime() - resetsAt.getTime()) / length) + 1;
    startedAt = new Date(resetsAt.getTime() + (elapsedWindows - 1) * length);
    resetsAt = new Date(resetsAt.getTime() + elapsedWindows * length);
  }
  return { startedAt, resetsAt };
}
