const LABELS: Record<string, { text: string; className: string }> = {
  OPEN: { text: "Draft", className: "pill-neutral" },
  SUBMITTED: { text: "Awaiting approval", className: "pill-pending" },
  APPROVED: { text: "Approved", className: "pill-approved" },
  REJECTED: { text: "Sent back", className: "pill-rejected" },
  PENDING: { text: "Awaiting approval", className: "pill-pending" },
  CANCELLED: { text: "Cancelled", className: "pill-neutral" },
};

export function StatusPill({ status }: { status: string }) {
  const label = LABELS[status] ?? { text: status, className: "pill-neutral" };
  return <span className={`pill ${label.className}`}>{label.text}</span>;
}
