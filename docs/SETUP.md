# Setting up TimeKeeper

Two things to get right: the Microsoft 365 app registration, and the
environment file. Allow about twenty minutes.

---

## 1. Prepare Active Directory

Two things are needed in AD: a group that controls who can use TimeKeeper, and
a read-only service account for the nightly sync.

### Access group

Create a security group — `TimeKeeper-Users` is the obvious name — and put in it
everyone who should be able to sign in. Nested groups are followed, so a group
of groups works. Membership is checked at every sign-in, so removing someone
takes effect immediately.

If you leave `LDAP_ACCESS_GROUP_DN` empty, anyone in the directory can sign in.
Note the distinguished name of the group; it goes in the environment file:

```powershell
Get-ADGroup TimeKeeper-Users | Select-Object -ExpandProperty DistinguishedName
```

### Service account

Sign-in itself does **not** need a service account — TimeKeeper binds to the
directory as the person signing in, using the password they typed. A read-only
account is needed for two things:

- the nightly sync, which creates accounts for people who have not signed in yet
  and deactivates anyone who has left the group
- resolving a line manager who has not signed in yet

An ordinary user account with no special privileges is enough. Note its
distinguished name and password.

### What TimeKeeper reads

`userPrincipalName`, `displayName`, `mail`, `department`, `title`, `manager`,
`objectGUID`, `userAccountControl` and `memberOf`. It never writes to the
directory.

The `manager` attribute is the useful one: TimeKeeper turns it into the line
manager used for approval routing, so if your AD org chart is accurate, nobody
has to build one by hand. Where `manager` is empty, requests go to the shared HR
queue until an administrator sets one.

### A note on the connection

On `ldap://` port 389 a simple bind sends the user's password across the network
in clear text. Anything able to capture traffic between the app and the domain
controller can read staff passwords. To encrypt it, either change the scheme to
`ldaps://` and the port to 636, or set `LDAP_STARTTLS=true` on port 389. If the
domain controller uses a certificate from an internal CA that the container does
not trust, set `LDAP_TLS_REJECT_UNAUTHORIZED=false` — which encrypts the traffic
but stops verifying who is on the other end.

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

LDAP_URL=ldap://dc01.yourdomain.local:389
LDAP_BASE_DN=DC=yourdomain,DC=local
LDAP_UPN_SUFFIX=@yourcompany.co.uk
LDAP_ACCESS_GROUP_DN=CN=TimeKeeper-Users,OU=Groups,DC=yourdomain,DC=local
LDAP_BIND_DN=CN=svc-timekeeper,OU=Service Accounts,DC=yourdomain,DC=local
LDAP_BIND_PASSWORD=<service account password>

BOOTSTRAP_ADMIN_UPN=you@yourcompany.co.uk
```

`LDAP_UPN_SUFFIX` is what lets people type just `alex.pinner` instead of the
full `alex.pinner@yourcompany.co.uk`. Both forms work, as does
`DOMAIN\alex.pinner`.

`BOOTSTRAP_ADMIN_UPN` must be your own userPrincipalName exactly as AD holds it.
That account becomes a sysadmin on first sign-in; without it nobody can reach
the admin screens.

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

### "The site cannot be reached" on `serverip:3000`

By default the port is published on the server's loopback interface only, so it
answers on the server itself but not from anywhere else on the network. To reach
it directly while you are setting things up, set this in `.env` and redeploy:

```ini
APP_BIND=0.0.0.0
```

Then `http://<server-ip>:3000` works, and sign-in works with it: Active
Directory authentication does not require an HTTPS callback the way the previous
Microsoft 365 sign-in did.

It is still worth putting TLS in front before real use. Over plain http the
session cookie and the password typed into the sign-in form both cross the
network unprotected.

### Put your reverse proxy in front

The app listens on `127.0.0.1:3000` by default and expects TLS to be terminated
by your own infrastructure. Forward to it and preserve the original host. With nginx:

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

1. **Sign in yourself**, with your Windows username and password. Your account
   is created and made sysadmin.
2. **Admin → Company settings.** Leave year start, default allowance, carryover
   cap and expiry date. Do this before anyone books leave.
3. **Admin → Bank holidays.** Check the seeded dates and add any company
   shutdown days.
4. **Admin → Projects and tasks.** Nobody can record hours until a project has
   at least one task.
5. **Wait for the nightly sync, or ask everyone to sign in once.** With a
   service account configured, the 02:00 sync creates an account for every
   member of the access group and fills in line managers from AD, so you may
   not need to do anything here.
6. **Admin → People.** Names, email, department, job title and line manager come
   from AD and are refreshed on every sign-in, so what is left to set is each
   person's working pattern and allowance. Anyone whose AD record has no
   `manager` will show as having none, and their requests go to the HR queue.
7. **Promote whoever runs HR** to HR / Admin so you are not the only one who can
   act on the queue.

---

## Troubleshooting

**"Your account does not have access to TimeKeeper."**
The person is not in the access group. Check `LDAP_ACCESS_GROUP_DN` is the
group's full distinguished name, and that they are a member.

**"TimeKeeper cannot reach the directory."**
Not a password problem. Check the container can reach the domain controller on
that port, and that `LDAP_URL` is right. If you have just switched to `ldaps://`
and it started failing, the certificate is the likely cause — see
`LDAP_TLS_REJECT_UNAUTHORIZED`.

**Everyone's password is rejected.**
Check `LDAP_UPN_SUFFIX` matches what AD holds in `userPrincipalName`. This is
often a different domain from the internal AD domain — `@company.co.uk` rather
than `@company.local`.

**The nightly sync deactivated people it should not have.**
It deactivates anyone not in the access group, by design, so that leavers lose
access. Check the group still contains everyone it should. The sync refuses to
act at all if the directory returns nobody, so a total outage cannot lock out
the company.

**Nobody has a line manager.**
Check the `manager` attribute is populated in AD, and that a service account is
configured — without one, a manager can only be linked once they have signed in
themselves.

**Approvals are going to the wrong person.**
Check the line manager under Admin → People, and look for an active delegation
under Approval cover.

**No email is arriving.**
`docker compose logs app` — with `SMTP_HOST` unset, messages are logged rather
than sent. Send failures are logged and deliberately never block an approval.
