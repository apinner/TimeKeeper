import type { PlainDate } from "@/lib/dates";

export type ApprovalRoute = "DELEGATE" | "MANAGER" | "HR_QUEUE";

export interface DelegationWindow {
  managerId: string;
  delegateId: string;
  startDate: PlainDate;
  endDate: PlainDate;
}

export interface RoutingInput {
  requesterId: string;
  managerId: string | null;
  /** Delegations belonging to the requester's manager. */
  delegations: DelegationWindow[];
  onDate: PlainDate;
}

export interface Routing {
  approverId: string | null;
  /** Set when a delegate is acting, so decisions record "on behalf of". */
  onBehalfOfId: string | null;
  route: ApprovalRoute;
}

/**
 * Who should decide this request:
 *
 *   an active delegate of the line manager
 *   -> otherwise the line manager
 *   -> otherwise the shared HR/admin queue
 *
 * The HR fallback matters more than it looks under just-in-time provisioning:
 * nobody has a manager until an admin sets one, and the managing director never
 * will.
 */
export function resolveApprover(input: RoutingInput): Routing {
  if (!input.managerId || input.managerId === input.requesterId) {
    return { approverId: null, onBehalfOfId: null, route: "HR_QUEUE" };
  }

  const delegation = input.delegations.find(
    (d) =>
      d.managerId === input.managerId &&
      d.startDate <= input.onDate &&
      d.endDate >= input.onDate &&
      d.delegateId !== input.requesterId,
  );

  if (delegation) {
    return {
      approverId: delegation.delegateId,
      onBehalfOfId: input.managerId,
      route: "DELEGATE",
    };
  }

  return { approverId: input.managerId, onBehalfOfId: null, route: "MANAGER" };
}

export interface DecisionRightsInput {
  actorId: string;
  actorRole: "EMPLOYEE" | "MANAGER" | "HR_ADMIN" | "SYSADMIN";
  requesterId: string;
  approverId: string | null;
  /** Delegations where the actor is the delegate, active today. */
  actingForManagerIds: string[];
}

/**
 * HR and sysadmins can action anything, which is what keeps a queue from
 * rotting while its owner is away. Nobody approves their own request.
 */
export function canDecide(input: DecisionRightsInput): boolean {
  if (input.actorId === input.requesterId) return false;
  if (input.actorRole === "HR_ADMIN" || input.actorRole === "SYSADMIN") return true;
  if (input.approverId && input.approverId === input.actorId) return true;
  if (input.approverId && input.actingForManagerIds.includes(input.approverId)) return true;
  return false;
}
