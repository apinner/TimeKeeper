# Setting up TimeKeeper

Two things to get right: the Microsoft 365 app registration, and the
environment file. Allow about twenty minutes.

---

## 1. Register the application in Microsoft Entra ID

You need an account that can create app registrations — Application
Administrator, Cloud Application Administrator, or Global Administrator.

### Create the registration

1. Go to the [Microsoft Entra admin centre](https://entra.microsoft.com) →
   **Applications** → **App registrations** → **New registration**.
2. **Name:** `TimeKeeper`
3. **Supported account types:** *Accounts in this organizational directory only
   (single tenant)*. This matters — the app also verifies the tenant on every
   sign-in, so a token from any other tenant is rejected.
4. **Redirect URI:** platform **Web**, value:

   ```
   https://timekeeper.example.com/api/auth/callback/microsoft-entra-id
   ```

   Replace the host with your own. It must be the public HTTPS address, it must
   match `AUTH_URL`, and the path must be exactly as shown.
5. **Register**.

From the **Overview** page, copy:

- **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
- **Directory (tenant) ID** → `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`

### Create a client secret

1. **Certificates & secrets** → **Client secrets** → **New client secret**.
2. Describe it (`TimeKeeper`) and choose an expiry. **Note the expiry date** —
   sign-in stops working the day it lapses, and the failure is not obvious.
3. Copy the **Value** immediately (not the Secret ID — the value is shown once)
   → `AUTH_MICROSOFT_ENTRA_ID_SECRET`.

### Permissions

None beyond the defaults. TimeKeeper reads the sign-in token and nothing else:
it does not call Microsoft Graph, so there is no directory data to consent to
and no admin consent to chase. The consequence is that TimeKeeper does not know
your org chart — line managers are set inside the app.

### Restrict who can sign in

1. **Enterprise applications** → **TimeKeeper** → **Properties**.
2. Set **Assignment required?** to **Yes**, and **Save**.
3. **Users and groups** → **Add user/group** → assign the group or people who
   should have access.

With this on, only assigned people can sign in, and disabling someone's Microsoft
account cuts off their access immediately.

---

## 2. Fill in the environment file

```bash
cp .env.example .env
```

Generate a session key:

```bash
openssl rand -base64 32
```

Then set, at minimum:

```ini
POSTGRES_PASSWORD=<a long random password>
DATABASE_URL=postgresql://timekeeper:<same password>@postgres:5432/timekeeper?schema=public

AUTH_SECRET=<the generated key>
AUTH_URL=https://timekeeper.example.com
AUTH_TRUST_HOST=true

AUTH_MICROSOFT_ENTRA_ID_ID=<application (client) id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<directory (tenant) id>

BOOTSTRAP_ADMIN_UPN=you@yourcompany.com
```

`BOOTSTRAP_ADMIN_UPN` must be your own sign-in name exactly as Microsoft 365
knows it. That account becomes a sysadmin on first sign-in; without it nobody
can reach the admin screens.

### Email

```ini
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=timekeeper@yourcompany.com
SMTP_PASSWORD=<password or app password>
SMTP_FROM=TimeKeeper <timekeeper@yourcompany.com>
```

Leave `SMTP_HOST` empty to start with: mail is written to the container log
instead of being sent, which is a good way to see what would go out before
pointing it at a live relay.

---

## 3. Start it

```bash
docker compose up -d --build
docker compose logs -f app
```

On first start the app applies migrations and seeds leave types, England &
Wales bank holidays and default settings.

### Put your reverse proxy in front

The app listens on `127.0.0.1:3000` and expects TLS to be terminated by your own
infrastructure. Forward to it and preserve the original host. With nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`AUTH_TRUST_HOST=true` is what allows the app to trust those headers when
building the sign-in redirect. Sign-in will fail in confusing ways if
`AUTH_URL` does not exactly match the address people actually visit.

---

## 4. First run, in order

1. **Sign in yourself.** Your account is created and made sysadmin.
2. **Admin → Company settings.** Leave year start, default allowance, carryover
   cap and expiry date. Do this before anyone books leave.
3. **Admin → Bank holidays.** Check the seeded dates and add any company
   shutdown days.
4. **Admin → Projects and tasks.** Nobody can record hours until a project has
   at least one task.
5. **Ask everyone to sign in once.** This creates their accounts.
6. **Admin → People.** For each person set their line manager, department,
   working pattern and allowance. Until a line manager is set, their requests
   go to the HR queue — the admin dashboard tells you how many people are in
   that state.
7. **Promote whoever runs HR** to HR / Admin so you are not the only one who can
   act on the queue.

---

## Troubleshooting

**"Your account cannot sign in to TimeKeeper."**
The person is not assigned to the enterprise application, or their TimeKeeper
account has been deactivated under Admin → People.

**Redirect or reply URL mismatch.**
The redirect URI in the app registration must match `AUTH_URL` exactly,
including `https://` and the `/api/auth/callback/microsoft-entra-id` path.

**Sign-in worked, then stopped for everyone.**
Check whether the client secret expired, and issue a new one.

**Approvals are going to the wrong person.**
Check the line manager under Admin → People, and look for an active delegation
under Approval cover.

**No email is arriving.**
`docker compose logs app` — with `SMTP_HOST` unset, messages are logged rather
than sent. Send failures are logged and deliberately never block an approval.
