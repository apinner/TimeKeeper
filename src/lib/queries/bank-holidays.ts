import { prisma } from "@/lib/db";
import { type PlainDate, toDbDate, toPlainDate } from "@/lib/dates";

export async function bankHolidaysBetween(
  from: PlainDate,
  to: PlainDate,
): Promise<Map<PlainDate, string>> {
  const rows = await prisma.bankHoliday.findMany({
    where: { isActive: true, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    orderBy: { date: "asc" },
  });
  return new Map(rows.map((row) => [toPlainDate(row.date), row.name]));
}

export async function bankHolidaySet(from: PlainDate, to: PlainDate): Promise<Set<PlainDate>> {
  return new Set((await bankHolidaysBetween(from, to)).keys());
}
