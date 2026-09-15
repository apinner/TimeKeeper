# TimeKeeper — Design & Decisions

A web-based timesheet and holiday request system for a ~50-person business,
with Microsoft 365 single sign-on, PostgreSQL storage and Docker deployment.

This document records every decision agreed during design, the reasoning behind
it, and the consequences that follow. It is the specification the build works to.

Status: **awaiting sign-off**. No application code has been written yet.

---

## 1. Decisions

### Platform

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 1 | Stack | Next.js (App Router) + TypeScript + Prisma + PostgreSQL | One language across UI and API; SSO is configuration rather than hand-written OIDC; versioned migrations |
| 2 | Hosting | Existing on-prem Docker host | Compose file stays portable, assumes nothing about a reverse proxy; TLS terminated by your infrastructure |
| 3 | Database | PostgreSQL inside the Compose stack, named volume | Self-contained; you own patching and backups. A `pg_dump` script is provided |
| 4 | Provisioning | Just-in-time on first SSO login, no Microsoft Graph | No Graph permissions to consent to. **Line managers must be assigned in-app** |
| 5 | Sign-in policy | Single tenant, tenant ID verified on every token, assignment to the enterprise app required | IT controls access via an Entra group; disabling an account revokes access immediately |
| 6 | Roles | In-app: Employee, Manager, HR/Admin, Sysadmin. First admin bootstrapped from `BOOTSTRAP_ADMIN_UPN` | HR changes roles without an IT ticket. Manager rights also follow implicitly from having direct reports |
| 7 | Locale | Europe/London, weeks start Monday, dd/mm/yyyy, decimal hours, English (UK) | Dates stored as plain calendar dates, so a booked Tuesday stays Tuesday across BST transitions |

### Timesheets

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 8 | Entry model | Weekly grid: rows are tasks, columns are days, cells are decimal hours | Fast to fill in; copy-last-week and running totals come naturally |
| 9 | Booking structure | Two levels — Project → Task | Precise reporting; someone must maintain task lists per project |
| 10 | Workflow | Draft → Submit (locks for employee) → Manager approves or rejects with a comment → Locked. Admins can reopen | Defensible record and a clear chase list |
| 11 | Leave on the grid | Approved leave and bank holidays appear as auto-filled read-only rows | No double entry; the week adds up before anyone types |
| 12 | Validation | A week whose total differs from contracted hours warns and asks for a reason. Never blocks | Clean data without blocking genuinely short weeks |

### Holiday and absence

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 13 | Allowance | Annual allowance per person, line manager approves | Requires the org chart to be populated (see #4) |
| 14 | Leave year | Fixed company-wide date, configurable, default 1 January | Everyone resets together; new starters pro-rated for their first partial year |
| 15 | Carryover | Capped (default 5 days) with an expiry date (default 31 March) | A year-end job writes carryover as a visible opening balance, not a silent recalculation |
| 16 | Working patterns | Per-person weekly pattern in hours, e.g. 7.5/7.5/7.5/4/0 | Leave is deducted in **hours**, so part-timers are charged correctly |
| 17 | Units | Stored in hours, displayed in days (hours ÷ that person's average working day) | Humans see "20 days left"; the arithmetic stays correct for a 4-day week |
| 18 | Granularity | Any number of hours per day | A request is a date range; each working day gets an hours allocation pre-filled from the pattern, editable per day. Full days and half days are special cases, not separate concepts |
| 19 | Absence types | Admin-configurable list with flags: deducts from allowance, requires approval, is paid, requires a note | Seeded with Annual leave, Sick, Unpaid, Compassionate, TOIL. Adding another is a settings change |
| 20 | Over-booking | **Warn, do not block** — manager's discretion | Balances may go negative. The approval screen states the overdraw explicitly; negatives carry forward as a negative opening balance |
| 21 | Cancellation | Employee withdraws future-dated leave themselves, approver notified; past or in-progress leave needs HR | Balance returns immediately; history cannot be quietly rewritten |
| 22 | Approver absent | Date-bounded delegate, nominated by the manager, auto-expiring. HR can set or clear anyone's | Approvals record "approved by B on behalf of A". Expiry is what stops it going stale |
| 23 | No manager set | Falls back to the shared HR/admin queue | Nothing disappears; covers the MD, who has nobody above them. Admin dashboard flags users missing a manager |
| 24 | Clashes | The approval screen lists others in the same team off during those dates | Informs the decision without pretending the software knows your staffing needs |
| 25 | Bank holidays | Seeded England & Wales dates, admin-editable | No outbound internet needed from the Docker host |

### Cross-cutting

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 26 | Email | SMTP relay configured by environment variables; writes to the log when unconfigured | Works with M365 SMTP relay or an internal relay. No extra Entra permissions |
| 27 | Email triggers | Submission to approver; decision to employee; weekly unsubmitted-timesheet reminder + Monday manager digest; cancellation and delegation notices | Year-end balance nudges deliberately excluded |
| 28 | Reporting | Payroll CSV export, team absence calendar, project time reports, outstanding balance report | All four in the first release |
| 29 | Audit | Timestamps only — no separate audit log | Each request and timesheet still records who decided, when, and their comment; balance adjustments are append-only rows |
| 30 | Testing | Vitest on the hard logic + GitHub Actions running lint, typecheck, tests and a production build | Covers balances, part-time deduction, carryover, routing, overdraw |
| 31 | Seed data | Essential seed always; `npm run seed:demo` generates ~50 fictional staff, projects and history | Reports can be evaluated properly; demo never runs in production |
| 32 | Delivery | Complete working system in one pass | — |

---

## 2. Data model

Prisma schema, PostgreSQL. Auth.js tables (`Account`, `Session`) attach to the same
`User` table rather than duplicating identity.

- **User** — `entraObjectId` (unique), `upn`, `email`, `displayName`, `jobTitle`,
  `department`, `managerId` (self-relation), `role`, `isActive`, `startDate`,
  `endDate`, timestamps.
- **WorkingPattern** — one per user: hours for each weekday. Historical accuracy is
  preserved because leave allocations store the hours actually booked (see LeaveDay),
  so changing a pattern never rewrites past requests.
- **Delegation** — `managerId`, `delegateId`, `startDate`, `endDate`.
- **LeaveType** — name, code, colour, and the four behaviour flags.
- **Entitlement** — per user per leave year: `allowanceHours`, `carriedOverHours`,
  `carryoverExpiresOn`. Unique on (user, leaveYearStart).
- **BalanceAdjustment** — signed hours, reason, who created it. Append-only.
- **LeaveRequest** — user, type, date range, status
  (`PENDING` / `APPROVED` / `REJECTED` / `CANCELLED`), note, total hours,
  routed approver, decision fields.
- **LeaveDay** — one row per date in a request with the hours allocated. Carries
  `userId` denormalised so the team calendar and clash detection are a single
  indexed query.
- **BankHoliday** — date, name, active flag.
- **Project** → **Task** — codes, client, active and billable flags.
- **Timesheet** — user + week-commencing Monday, status, submitted/decision fields,
  variance reason. Unique on (user, weekStart).
- **TimeEntry** — timesheet, task, date, hours, optional note. Unique on
  (timesheet, task, date).
- **Settings** — single row: company name, logo, leave year start, carryover cap and
  expiry, default allowance, reminder toggles.

### Balance formula

```
remaining_hours =
    allowance
  + carried_over (if not yet expired)
  + Σ adjustments
  − Σ hours on APPROVED requests of deducting types
```

Pending requests are shown separately rather than subtracted, so "remaining" and
"remaining if everything pending is approved" are both visible. Days shown in the
UI are `hours ÷ (weekly pattern hours ÷ working days per week)`.

### Approval routing

```
approver = active delegate of the line manager (if today falls in the delegation window)
         → otherwise the line manager
         → otherwise the shared HR/admin queue
```

---

## 3. Deployment

`docker-compose.yml` with two services — `app` and `postgres`. No reverse proxy is
included; the app listens on a configurable port for your existing proxy to sit in
front of. Multi-stage Dockerfile using Next.js standalone output. Migrations run via
`prisma migrate deploy` in the container entrypoint. Scheduled work (weekly
reminders, year-end carryover, carryover expiry) runs in-process on a cron
schedule guarded by a database lock.

Environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
`AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_TENANT_ID`, `SMTP_*`,
`BOOTSTRAP_ADMIN_UPN`, `TZ`.

A setup guide will cover the Entra app registration end to end: single-tenant
registration, redirect URI, client secret, and requiring user assignment.

---

## 4. Open items

- **Brand colours and logo** — requested; the theme is a single CSS variable file so
  this can be supplied at any point without touching components.
- **SMTP host, port, credentials and from-address** — needed for deployment, not for
  the build.

---

## 5. Known risks accepted

- Negative leave balances are possible by design (#20) and need a human to notice.
- With JIT-only provisioning, leavers stay active in TimeKeeper until an admin
  deactivates them; access is revoked immediately at sign-in, but their records
  remain until tidied.
- No audit log (#29) means "who changed this allowance in March" cannot be answered
  beyond the adjustment rows themselves.
