import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LeaveRequestForm } from "@/components/leave-request-form";
import { prisma } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import { bankHolidaysBetween } from "@/lib/queries/bank-holidays";
import { balanceFor, patternFor } from "@/lib/queries/leave";
import { requireUser } from "@/lib/session";

export default async function NewLeavePage() {
  const user = await requireUser();
  const now = today();

  const [leaveTypes, pattern, balance, holidays] = await Promise.all([
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    patternFor(user.id),
    balanceFor(user.id),
    bankHolidaysBetween(addDays(now, -365), addDays(now, 730)),
  ]);

  return (
    <AppShell user={user} current="/leave">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">Book leave</h1>
          <p className="page-subtitle">
            Pick your dates, then adjust the hours on any day if you only need part of it.
          </p>
        </div>
        <Link href="/leave" className="btn btn-secondary btn-sm">
          Back to my leave
        </Link>
      </div>

      {leaveTypes.length === 0 ? (
        <div className="notice notice-warning">
          No leave types have been set up yet. An administrator can add them under Admin → Leave
          types.
        </div>
      ) : (
        <LeaveRequestForm
          leaveTypes={leaveTypes.map((type) => ({
            id: type.id,
            name: type.name,
            requiresNote: type.requiresNote,
            deductsFromAllowance: type.deductsFromAllowance,
          }))}
          pattern={pattern}
          bankHolidays={[...holidays.keys()]}
          remainingMinutes={balance.remainingMinutes}
          averageDayMinutes={balance.averageDayMinutes}
        />
      )}
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
