import type { PlainDate } from "@/lib/dates";

export interface BalanceInput {
  allowanceMinutes: number;
  carriedOverMinutes: number;
  carryoverExpiresOn: PlainDate | null;
  /** Sum of signed balance adjustments for this leave year. */
  adjustmentMinutes: number;
  /** Approved leave of types that deduct from the allowance. */
  approvedMinutes: number;
  /** Awaiting a decision. Shown separately, never silently subtracted. */
  pendingMinutes: number;
  asOf: PlainDate;
}

export interface Balance {
  entitledMinutes: number;
  approvedMinutes: number;
  pendingMinutes: number;
  lapsedMinutes: number;
  remainingMinutes: number;
  /** What remains if everything currently pending is approved. */
  remainingIfPendingApprovedMinutes: number;
  isNegative: boolean;
}

/**
 * Leave is drawn from carried-over days first, so anything left of the
 * carryover lapses on its expiry date rather than eating into this year's
 * fresh allowance.
 *
 * Balances can go negative by design: over-booking warns rather than blocks, at
 * the line manager's discretion.
 */
export function computeBalance(input: BalanceInput): Balance {
  const carriedOver = input.carriedOverMinutes;
  const usedFromCarryover = Math.max(0, Math.min(input.approvedMinutes, carriedOver));
  const expired =
    input.carryoverExpiresOn !== null && input.asOf > input.carryoverExpiresOn;
  const lapsedMinutes = expired ? Math.max(0, carriedOver - usedFromCarryover) : 0;

  const entitledMinutes = input.allowanceMinutes + carriedOver + input.adjustmentMinutes;
  const remainingMinutes = entitledMinutes - input.approvedMinutes - lapsedMinutes;

  return {
    entitledMinutes,
    approvedMinutes: input.approvedMinutes,
    pendingMinutes: input.pendingMinutes,
    lapsedMinutes,
    remainingMinutes,
    remainingIfPendingApprovedMinutes: remainingMinutes - input.pendingMinutes,
    isNegative: remainingMinutes < 0,
  };
}

export interface OverdraftWarning {
  wouldOverdraw: boolean;
  /** Minutes the request exceeds the remaining balance by. Never negative. */
  shortfallMinutes: number;
  balanceAfterMinutes: number;
}

/**
 * Over-booking is allowed, so this produces the figure the approver is shown at
 * decision time: exactly how far into the red the request takes someone.
 */
export function assessOverdraft(balance: Balance, requestMinutes: number): OverdraftWarning {
  const balanceAfterMinutes = balance.remainingMinutes - requestMinutes;
  return {
    wouldOverdraw: balanceAfterMinutes < 0,
    shortfallMinutes: Math.max(0, -balanceAfterMinutes),
    balanceAfterMinutes,
  };
}
