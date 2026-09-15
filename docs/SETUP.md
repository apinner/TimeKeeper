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

Only infrastructure lives here now. Everything about the directory, email and
company policy is configured inside the application.

```bash
cp .env.example .env
```

Generate a session key:

```bash
openssl rand -base64 32
```

Then set:

```ini
POSTGRES_PASSWORD=<a long random password>
DATABASE_URL=postgresql://timekeeper:<same password>@postgres:5432/timekeeper?schema=public

AUTH_SECRET=<the generated key>
AUTH_URL=https://timekeeper.example.com
AUTH_TRUST_HOST=true
```

`AUTH_SECRET` does double duty: it signs sessions **and** encrypts the directory
and mail passwords stored in the database. Changing it signs everyone out and
makes those stored passwords unreadable, so they have to be re-entered in Admin.
Keep it somewhere you can find it again.

### Upgrading from a version that used LDAP_* and SMTP_* variables

Leave them in `.env` for one start. They are copied into the database
automatically, the log says so, and they can then be deleted. Settings already
in the database are never overwritten.

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

1. **Open TimeKeeper in a browser.** While nobody can sign in, it offers a
   one-time page to create the administrator account. Use the same username
   Active Directory knows you by, so your directory account attaches to this one
   rather than creating a second. Choose a password of at least 12 characters —
   this is held by TimeKeeper, separately from your Windows password, and exists
   so you can get in when the directory cannot be reached.

   The setup page closes permanently once that account exists.

2. **Admin → Authentication.** Enter the directory settings from step 1 and use
   **Test connection** before saving: with a username and password it proves a
   real sign-in including group membership, and tells you what it read back.
   Then tick *Allow staff to sign in with their directory account* and save.

   **Sync now** will then create an account for everyone in the access group.

3. **Admin → Email.** The mail relay, with a **Send test message** button.
   Leaving the host empty is a valid choice: messages are written to the
   application log instead of being sent.

4. **Admin → Company settings.** Leave year start, default allowance, carryover
   cap and expiry date, and the times the scheduled jobs run. Do this before
   anyone books leave.
5. **Admin → Bank holidays.** Check the seeded dates and add any company
   shutdown days.
6. **Admin → Projects and tasks.** Nobody can record hours until a project has
   at least one task.
7. **Wait for the nightly sync, or ask everyone to sign in once.** With a
   service account configured, the 02:00 sync creates an account for every
   member of the access group and fills in line managers from AD, so you may
   not need to do anything here.
8. **Admin → People.** Names, email, department, job title and line manager come
   from AD and are refreshed on every sign-in, so what is left to set is each
   person's working pattern and allowance. Anyone whose AD record has no
   `manager` will show as having none, and their requests go to the HR queue.
9. **Promote whoever runs HR** to HR / Admin so you are not the only one who can
   act on the queue. Under Admin → Authentication you can give them a local
   password too, so you are not the only person who can get in when the
   directory is down.

---

## Troubleshooting

**"Your account does not have access to TimeKeeper."**
The person is not in the access group. Check `LDAP_ACCESS_GROUP_DN` is the
group's full distinguished name, and that they are a member.

**"TimeKeeper cannot reach the directory."**
Not a password problem. Check the container can reach the domain controller on
that port, and that the server URL in Admin → Authentication is right. If you
have just switched to `ldaps://` and it started failing, the certificate is the
likely cause — untick *Verify the server certificate* under Advanced to confirm
that is what it is.

**Everyone's password is rejected.**
Check the username suffix in Admin → Authentication matches what AD holds in
`userPrincipalName`. This is
often a different domain from the internal AD domain — `@company.co.uk` rather
than `@company.local`.

**The nightly sync deactivated people it should not have.**
It deactivates anyone not in the access group, by design, so that leavers lose
access. Check the group still contains everyone it should. The sync refuses to
act at all if the directory returns nobody, so a total outage cannot lock out
the company.

**Locked out: the directory is broken and nobody can sign in.**
Any administrator with a local password can still sign in and fix the settings.
That is what local passwords are for, and it is worth making sure at least two
people have one. After five failed attempts a local password locks for fifteen
minutes and then unlocks itself; the lock does not affect directory sign-in.

**Lost the only administrator password.**
Connect to the database and clear the directory setting, which reopens the setup
page: `docker compose exec postgres psql -U timekeeper -d timekeeper -c 'UPDATE
"Settings" SET "ldapEnabled" = false;'` then clear the password hashes with
`UPDATE "User" SET "passwordHash" = NULL;`. The next visit offers setup again.

**Nobody has a line manager.**
Check the `manager` attribute is populated in AD, and that a service account is
configured — without one, a manager can only be linked once they have signed in
themselves.

**Approvals are going to the wrong person.**
Check the line manager under Admin → People, and look for an active delegation
under Approval cover.

**No email is arriving.**
Admin → Email has a **Send test message** button that reports exactly what the
mail server said. With no host configured, messages are written to the
application log instead — `docker compose logs app`. Send failures are logged
and deliberately never block an approval.
