import { formatDate, formatLongDate, type PlainDate } from "@/lib/dates";
import { formatHours } from "@/lib/duration";
import { appUrl, type Mail } from "./mailer";

interface Person {
  name: string | null;
  upn: string;
  email: string;
}

const who = (person: Person) => person.name ?? person.upn;

export async function leaveSubmitted(params: {
  approver: Person;
  requester: Person;
  typeName: string;
  start: PlainDate;
  end: PlainDate;
  totalMinutes: number;
  onBehalfOf: string | null;
  overdraftMinutes: number;
}): Promise<Mail> {
  const lines = [
    `${who(params.requester)} has requested ${params.typeName.toLowerCase()}.`,
    "",
    `Dates:  ${formatLongDate(params.start)} to ${formatLongDate(params.end)}`,
    `Total:  ${formatHours(params.totalMinutes)} hours`,
  ];

  if (params.overdraftMinutes > 0) {
    lines.push(
      "",
      `Note: this request exceeds their remaining balance by ${formatHours(params.overdraftMinutes)} hours.`,
      "It is your decision whether to approve it.",
    );
  }

  if (params.onBehalfOf) {
    lines.push("", `You are receiving this as cover for ${params.onBehalfOf}.`);
  }

  lines.push("", `Review it here: ${await appUrl("/approvals")}`);

  return {
    to: params.approver.email,
    subject: `Leave request from ${who(params.requester)}`,
    text: lines.join("\n"),
  };
}

export async function leaveDecided(params: {
  requester: Person;
  decider: Person;
  approved: boolean;
  typeName: string;
  start: PlainDate;
  end: PlainDate;
  totalMinutes: number;
  comment: string | null;
  onBehalfOf: string | null;
}): Promise<Mail> {
  const verdict = params.approved ? "approved" : "not approved";
  const lines = [
    `Your ${params.typeName.toLowerCase()} request has been ${verdict}.`,
    "",
    `Dates:  ${formatLongDate(params.start)} to ${formatLongDate(params.end)}`,
    `Total:  ${formatHours(params.totalMinutes)} hours`,
    `Decided by: ${who(params.decider)}${params.onBehalfOf ? ` on behalf of ${params.onBehalfOf}` : ""}`,
  ];

  if (params.comment) lines.push("", `Comment: ${params.comment}`);
  lines.push("", `View your leave: ${await appUrl("/leave")}`);

  return {
    to: params.requester.email,
    subject: `Leave request ${verdict}`,
    text: lines.join("\n"),
  };
}

export async function leaveCancelled(params: {
  approver: Person;
  requester: Person;
  typeName: string;
  start: PlainDate;
  end: PlainDate;
  totalMinutes: number;
}): Promise<Mail> {
  return {
    to: params.approver.email,
    subject: `Leave cancelled by ${who(params.requester)}`,
    text: [
      `${who(params.requester)} has cancelled approved ${params.typeName.toLowerCase()}.`,
      "",
      `Dates:  ${formatLongDate(params.start)} to ${formatLongDate(params.end)}`,
      `Total:  ${formatHours(params.totalMinutes)} hours returned to their balance`,
      "",
      `Team calendar: ${await appUrl("/team")}`,
    ].join("\n"),
  };
}

export async function timesheetSubmitted(params: {
  approver: Person;
  owner: Person;
  weekStart: PlainDate;
  accountedMinutes: number;
  contractedMinutes: number;
  varianceReason: string | null;
}): Promise<Mail> {
  const lines = [
    `${who(params.owner)} has submitted their timesheet for the week commencing ${formatDate(params.weekStart)}.`,
    "",
    `Accounted:  ${formatHours(params.accountedMinutes)} hours`,
    `Contracted: ${formatHours(params.contractedMinutes)} hours`,
  ];

  if (params.varianceReason) lines.push("", `Reason given: ${params.varianceReason}`);
  lines.push("", `Review it here: ${await appUrl("/approvals")}`);

  return {
    to: params.approver.email,
    subject: `Timesheet from ${who(params.owner)} — w/c ${formatDate(params.weekStart)}`,
    text: lines.join("\n"),
  };
}

export async function timesheetDecided(params: {
  owner: Person;
  decider: Person;
  approved: boolean;
  weekStart: PlainDate;
  comment: string | null;
}): Promise<Mail> {
  const verdict = params.approved ? "approved" : "sent back";
  const lines = [
    `Your timesheet for the week commencing ${formatDate(params.weekStart)} has been ${verdict}.`,
    `Decided by: ${who(params.decider)}`,
  ];

  if (params.comment) lines.push("", `Comment: ${params.comment}`);
  if (!params.approved) {
    lines.push("", "The week has been reopened so you can correct and resubmit it.");
  }
  lines.push("", await appUrl("/timesheets"));

  return {
    to: params.owner.email,
    subject: `Timesheet ${verdict} — w/c ${formatDate(params.weekStart)}`,
    text: lines.join("\n"),
  };
}

export async function delegationAssigned(params: {
  delegate: Person;
  manager: Person;
  start: PlainDate;
  end: PlainDate;
}): Promise<Mail> {
  return {
    to: params.delegate.email,
    subject: `You are covering approvals for ${who(params.manager)}`,
    text: [
      `${who(params.manager)} has asked you to cover their approvals.`,
      "",
      `From:  ${formatLongDate(params.start)}`,
      `Until: ${formatLongDate(params.end)}`,
      "",
      "Their team's leave requests and timesheets will appear in your approvals",
      "queue for that period, and your decisions are recorded as made on their behalf.",
      "",
      await appUrl("/approvals"),
    ].join("\n"),
  };
}

export async function timesheetReminder(params: { owner: Person; weekStart: PlainDate }): Promise<Mail> {
  return {
    to: params.owner.email,
    subject: `Timesheet not submitted — w/c ${formatDate(params.weekStart)}`,
    text: [
      `Your timesheet for the week commencing ${formatDate(params.weekStart)} has not been submitted.`,
      "",
      `Fill it in here: ${await appUrl("/timesheets")}`,
    ].join("\n"),
  };
}

export async function managerDigest(params: {
  approver: Person;
  pendingLeave: number;
  pendingTimesheets: number;
}): Promise<Mail> {
  const parts: string[] = [];
  if (params.pendingLeave > 0) {
    parts.push(
      `${params.pendingLeave} leave request${params.pendingLeave === 1 ? "" : "s"}`,
    );
  }
  if (params.pendingTimesheets > 0) {
    parts.push(
      `${params.pendingTimesheets} timesheet${params.pendingTimesheets === 1 ? "" : "s"}`,
    );
  }

  return {
    to: params.approver.email,
    subject: `Waiting for your approval: ${parts.join(" and ")}`,
    text: [
      `You have ${parts.join(" and ")} waiting for a decision.`,
      "",
      await appUrl("/approvals"),
    ].join("\n"),
  };
}
