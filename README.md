# TimeKeeper

Timesheets and holiday requests for a small business, with Active Directory
sign-in, PostgreSQL storage and Docker deployment.

Built to the decisions recorded in [docs/DESIGN.md](docs/DESIGN.md). Preparing
Active Directory is covered in [docs/SETUP.md](docs/SETUP.md).

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
docker compose up -d --build
```

That is the whole installation. There is no configuration file to write: the
stack starts with working defaults, generates its own session secret, applies
migrations and seeds reference data. Open it in a browser and it asks you to
create an administrator account.

The app publishes on `127.0.0.1:3000` for your own reverse proxy to sit in front
of, so it is not reachable from other machines until you either put that proxy
in place or start it with `APP_BIND=0.0.0.0`.

On a fresh install, opening TimeKeeper offers a one-time page to create the
administrator account, with a password held by TimeKeeper. Sign in with it and
connect Active Directory under Admin → Authentication, using **Test connection**
to prove the settings before saving them. The setup page closes as soon as that
account exists.

Everyone else is created from Active Directory — either on their own first
sign-in, or by the nightly sync — with their line manager taken from the
directory's `manager` attribute.

Local passwords are for administrators only, and exist so the system can be
configured and repaired when the directory is unreachable. After five failed
attempts one locks for fifteen minutes and then unlocks itself; the lock applies
to the local password alone, so it cannot be used to deny someone their normal
directory sign-in.

### Locally, for development

```bash
npm install
docker run -d --name tk-db -e POSTGRES_PASSWORD=timekeeper \
  -e POSTGRES_USER=timekeeper -e POSTGRES_DB=timekeeper -p 5432:5432 postgres:17-alpine

cat > .env <<'ENV'
DATABASE_URL="postgresql://timekeeper:timekeeper@localhost:5432/timekeeper?schema=public"
AUTH_SECRET="development-only-secret-not-for-production"
ENV

npx prisma migrate deploy
npm run seed          # leave types, bank holidays, settings
npm run seed:demo     # optional: ~50 fictional staff with a term of history
npm run dev
```

Only development needs that file — the Docker stack supplies both values itself.

`seed:demo` refuses to run against a database containing accounts created by
real sign-ins.

---

## Configuration

Everything is configured in the application, under Admin. Nothing has to be set
before it will run.

These can be overridden if you want to — in the environment, or a `.env` file
next to the compose file — but all of them have working defaults:

| Variable | Default | Purpose |
|---|---|---|
| `APP_BIND` / `APP_PORT` | `127.0.0.1` / `3000` | Interface and port to publish on |
| `POSTGRES_PASSWORD` | `timekeeper` | The bundled database is not published outside the compose network |
| `AUTH_SECRET` | generated on first start | Signs sessions **and** encrypts stored directory and mail passwords |
| `AUTH_URL` | taken from the request | Only needed to pin the address used in email links |
| `ENABLE_SCHEDULER` | `true` | Set `false` on any replica that should not run scheduled jobs |
| `TZ` | `Europe/London` | |

The generated session secret is kept in the `timekeeper-secret` volume and
reused on every restart. **Back that volume up along with the database**: losing
it signs everyone out and makes the stored directory and mail passwords
unreadable, so they would have to be entered again in Admin.

Configured in the app:

| Where | What |
|---|---|
| Admin → Authentication | Directory connection, access group, service account, **Test connection**, administrator passwords |
| Admin → Email | Mail relay, from address, **Send test message** |
| Admin → Company settings | Leave year, allowances, carryover, scheduled job times, session length |

Directory and mail passwords are encrypted with AES-256-GCM using a key derived
from the session secret, so a database dump does not hand over working
credentials. Administrator passwords are hashed with scrypt and are never
recoverable.

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
| Daily 02:00 | Active Directory sync: details, line managers, leavers |
| Monday 09:00 | Digest to approvers with items waiting |
| Daily 01:00 | Year-end roll forward (no-ops unless it is the first day of the leave year) |

---

## Backups

`scripts/backup.sh` writes a compressed dump into `./backups` and keeps 30 days.
Back up the `timekeeper-secret` volume too — without it, a restored database
cannot decrypt its own stored passwords.
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
