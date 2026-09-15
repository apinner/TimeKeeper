import { prisma } from "@/lib/db";
import { today, toDbDate, toPlainDate } from "@/lib/dates";
import { leaveYearStartFor } from "@/lib/domain/leave-year";
import { proRataAllowanceMinutes } from "@/lib/domain/leave-year";
import { DEFAULT_PATTERN } from "@/lib/domain/patterns";
import { getSettings } from "@/lib/settings";

/**
 * Everything a newly provisioned person needs to be able to use the system on
 * their first morning: a working pattern and an entitlement for the current
 * leave year, pro-rated if they started part-way through it.
 *
 * Provisioning is just-in-time, so this runs on first sign-in. Their line
 * manager is not known from the token and must be set by an admin; until then
 * their requests route to the shared HR queue.
 */
export async function ensureUserSetUp(userId: string): Promise<void> {
  const settings = await getSettings();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workingPattern: true },
  });
  if (!user) return;

  const pattern =
    user.workingPattern ??
    (await prisma.workingPattern.create({ data: { userId, ...DEFAULT_PATTERN } }));

  const now = today();
  const leaveYearStart = leaveYearStartFor(now, settings);
  const existing = await prisma.entitlement.findUnique({
    where: { userId_leaveYearStart: { userId, leaveYearStart: toDbDate(leaveYearStart) } },
  });
  if (existing) return;

  const startDate = user.startDate ? toPlainDate(user.startDate) : now;
  const allowanceMinutes = proRataAllowanceMinutes(
    settings.defaultAllowanceMinutes,
    pattern,
    leaveYearStart,
    startDate,
  );

  await prisma.entitlement.create({
    data: {
      userId,
      leaveYearStart: toDbDate(leaveYearStart),
      allowanceMinutes,
    },
  });
}
