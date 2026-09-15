# TimeKeeper

Timesheets and holiday requests for a small business, with Microsoft 365 single
sign-on, PostgreSQL storage and Docker deployment.

Built to the decisions recorded in [docs/DESIGN.md](docs/DESIGN.md). Setting up
the Microsoft side is covered in [docs/SETUP.md](docs/SETUP.md).

---

## What it does

**Timesheets.** A weekly grid: rows are project tasks, columns are days, cells
are hours. Approved leave and bank holidays fill themselves in as locked rows,
so a week adds up before anyone types. Submit sends it to the line manager, who
approves or sends it back with a comment. A week that does not match contracted
hours asks for a reason — it is never blocked, because people genuinely work
short and long weeks.

**Holiday.** Requests are a date range where every working day carries an hours
allocation taken from that person's working pattern. Leave it alone for a normal
booking, halve a day for an afternoon off, set two hours for a dentist
appointment. Balances are tracked in hours and shown in days, so a four-day-week
employee is charged correctly and still reads "20 days left".

**Approvals.** Requests route to an active delegate, then the line manager, then
a shared HR queue. The approver sees the requester's balance, exactly how far a
request would take them into the red, and who else in their team is already off.

**Reports.** Payroll CSV, project time by task and person, leave taken, and
outstanding balances — on screen and as CSV.

---

## Running it

### With Docker (how it is deployed)

```bash
cp .env.example .env     # then fill it in — see below
docker compose up -d --build
```

The app listens on `127.0.0.1:3000` for your own reverse proxy to sit in front
of. Migrations and reference-data seeding run automatically on start.

The first person named in `BOOTSTRAP_ADMIN_UPN` becomes a sysadmin when they
first sign in. Everyone else is created as an employee on their own first
sign-in, and an administrator sets their line manager.

### Locally, for development

```bash
npm install
docker run -d --name tk-db -e POSTGRES_PASSWORD=timekeeper \
  -e POSTGRES_USER=timekeeper -e POSTGRES_DB=timekeeper -p 5432:5432 postgres:17-alpine
cp .env.example .env
npx prisma migrate deploy
npm run seed          # leave types, bank holidays, settings
npm run seed:demo     # optional: ~50 fictional staff with a term of history
npm run dev
```

`seed:demo` refuses to run against a database containing accounts created by
real sign-ins.

---

## Configuration

Everything is environment variables; see `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing key — `openssl rand -base64 32` |
| `AUTH_URL` | Public HTTPS address of the app |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_TENANT_ID` | From the app registration |
| `BOOTSTRAP_ADMIN_UPN` | The first administrator |
| `SMTP_*` | Mail relay. Leave `SMTP_HOST` empty and mail is written to the log |
| `ENABLE_SCHEDULER` | Set `false` on any replica that should not run scheduled jobs |
| `TZ` | `Europe/London` |

### Branding

The brand colours live in one block at the top of `src/app/globals.css`
(`--color-brand` and `--color-graphite`). They were sampled by eye from the
Mechtech Automation logo; if you have the exact hex values, change them there
and the whole interface follows.

Replace `public/logo.svg` with the real logo file. It is a placeholder wordmark.

> White text on the brand orange is about 2.7:1, which fails WCAG AA. Primary
> buttons therefore use orange with near-black text (~6:1) — the pairing the
> logo itself uses.

---

## Scheduled jobs

Run in the app process, guarded by a Postgres advisory lock so only one replica
acts:

| When | Job |
|---|---|
| Friday 16:00 | Reminder to anyone whose week is unsubmitted |
| Monday 09:00 | Digest to approvers with items waiting |
| Daily 01:00 | Year-end roll forward (no-ops unless it is the first day of the leave year) |

---

## Backups

`scripts/backup.sh` writes a compressed dump into `./backups` and keeps 30 days.
Add it to the host's crontab:

```
0 2 * * * cd /opt/timekeeper && ./scripts/backup.sh >> /var/log/timekeeper-backup.log 2>&1
```

Copy that directory off the machine as well — a backup on the same disk is not a
backup.

---

## Development

```bash
npm run dev        # development server
npm test           # domain logic tests
npm run typecheck
npm run lint
npm run build
```

The business rules that are actually hard — balances with part-time patterns,
carryover and its expiry, pro-rata allowances, approval routing with delegation,
week totals — live in `src/lib/domain/` as pure functions with no database
access, and are covered by the test suite. Start there.

### Changing the schema

```bash
npx prisma migrate dev --name what_changed
```

CI checks that the migrations and the schema still agree.
