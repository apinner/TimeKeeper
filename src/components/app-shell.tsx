import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/auth";
import { canApproveAnything, isAdmin, type SessionUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { pendingApprovalCount } from "@/lib/queries/approvals";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export async function AppShell({
  user,
  current,
  children,
}: {
  user: SessionUser;
  current: string;
  children: React.ReactNode;
}) {
  const settings = await getSettings();
  const canApprove = await canApproveAnything(user);
  const admin = isAdmin(user);
  const pending = canApprove ? await pendingApprovalCount(user) : 0;

  const items: NavItem[] = [
    { href: "/", label: "Dashboard" },
    { href: "/timesheets", label: "My timesheet" },
    { href: "/leave", label: "My leave" },
  ];
  if (canApprove) items.push({ href: "/approvals", label: "Approvals", badge: pending });
  items.push({ href: "/team", label: "Team calendar" });
  if (canApprove) items.push({ href: "/reports", label: "Reports" });
  if (admin) items.push({ href: "/admin", label: "Admin" });

  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:shrink-0 border-b md:border-b-0 md:border-r border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="p-4 md:h-full md:flex md:flex-col">
          <Link href="/" className="block mb-5">
            <Image
              src={settings.logoPath}
              alt={settings.companyName}
              width={180}
              height={36}
              priority
              style={{ height: "auto", width: "150px" }}
            />
          </Link>

          <nav className="flex flex-wrap gap-1 md:block md:space-y-0.5">
            {items.map((item) => {
              const active =
                item.href === "/" ? current === "/" : current.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? "nav-link-active" : ""} flex items-center justify-between`}
                >
                  <span>{item.label}</span>
                  {item.badge ? <span className="pill pill-pending">{item.badge}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 md:mt-auto pt-4 border-t border-[var(--color-line)]">
            <p className="text-sm font-semibold text-[var(--color-graphite-900)] truncate">
              {user.name ?? user.upn}
            </p>
            <p className="text-xs text-[var(--color-muted)] truncate">{user.upn}</p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button type="submit" className="btn btn-secondary btn-sm mt-2.5 w-full">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
