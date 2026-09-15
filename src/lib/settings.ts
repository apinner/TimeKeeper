import { prisma } from "@/lib/db";
import type { Settings } from "@prisma/client";

/** The settings row is a singleton at id = 1, created by the seed. */
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 1 } });
}
