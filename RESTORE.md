# Restore guide — Zwartendijk Stalling plattegrond

How to get everything working again after something goes wrong, from small
(a bad change) to large (the whole Firebase project gone). Written so you can
follow it yourself, or hand it to whoever helps you.

## What exists, and where

| Part | Where | Notes |
|---|---|---|
| **The app** (index.html, styles.css, app.js, sw.js, icons) | GitHub repo `samcarpay/Stalling-plattegrond`, branch `main` — also a copy on the Mac in `~/code/Stalling-plattegrond` | Every push to `main` goes live |
| **Website hosting** | GitHub Pages of that repo: `https://samcarpay.github.io/Stalling-plattegrond/` | Settings → Pages → "Deploy from branch: main" |
| **Settings the app reads** | `firebase-config.js` in the repo | Firebase keys, `SYNC_PATH`, which features are on |
| **Database** | Firebase project `stalling-plattegrond` → Realtime Database (europe-west1) | See "What's in the database" below |
| **Database rules** (who may read/write what) | `database.rules.json` in the repo — the live copy is in the Firebase console | Keep both the same |
| **Logins** for the app | Firebase → Authentication → Users (email + password) | Not backed up — recreate by hand if ever needed |
| **Cloud Functions** (notifications, nightly backup, morning reminder) | `functions/` in the repo, running in Firebase (europe-west1, Blaze plan) | |
| **Secrets** | Firebase secret storage: `VAPID_PRIVATE_KEY` (push notifications), `GITHUB_BACKUP_TOKEN` (backups) | Not backed up on purpose — both can be made new |
| **Nightly backups** | Private GitHub repo `samcarpay/Stalling-backups` → `backups/YYYY/MM-DD/`: `plattegrond.json` (floor plan), `agenda.json` (Agenda, blocked dates, Planning), `app-code.zip` (this repo as it was that day) | Daily 30 days, weekly 1 year, monthly after |
| **Booking form, contract system** (booking-widget, klant.html, admin.html, onderteken.html) | Your own website `zwartendijkstalling.nl` — **not in this repo** | Make sure your web host keeps a backup of those |

### What's in the database

- `Plattegrond-111ws-qbh3Tm791/data` — all warehouses, spots and customers (one JSON text)
- `Plattegrond-111ws-qbh3Tm791/backups` — the app's own backups (Back-ups button)
- `Plattegrond-111ws-qbh3Tm791/push` — which phones get notifications
- `Plattegrond-111ws-qbh3Tm791/backupStatus` — result of the last nightly backup
- `pickup-appointments` — the Agenda (from the booking form and staff)
- `blocked-dates` — dates the booking form won't accept
- `werkloods-bookings` — the Planning (werkloods / overig)

## Tools on the Mac

Node.js and the Firebase tool are installed in your home folder, not system-wide.
Start every Terminal session for this with:

```bash
export PATH=~/.local/node/bin:$PATH && cd ~/code/Stalling-plattegrond
```

If `firebase` says you're not logged in: `firebase login` (opens the browser).

---

## A. The app broke after a change

The data is fine; only the app's code is wrong.

1. Ask Claude to undo the last change — or yourself: in the repo folder run
   `git log --oneline -5` to see recent changes, then `git revert <code>` for
   the bad one and `git push origin main`.
2. Wait 1–2 minutes for GitHub Pages; phones pick it up on their own.

## B. Data is wrong or missing

**Floor plan (spots, customers) — from within the app:** Back-ups → pick a
moment → Terugzetten. Makes a safety copy first.

**Floor plan — from the nightly backup** (when the app's own backups are gone too):
1. On GitHub: `Stalling-backups` → `backups` → year → day → `plattegrond.json` →
   the download button (↓ "Download raw file").
2. In the app: **Importeren** → choose that file.

**Agenda, blocked dates, Planning — from the nightly backup:**
1. Download `agenda.json` from the same day folder. It holds three parts:
   `pickupAppointments`, `blockedDates`, `planningBookings`.
2. For the part you need, save just that part as its own file (ask Claude to
   do this if unsure).
3. Firebase console → Realtime Database → click the path
   (`pickup-appointments`, `blocked-dates` or `werkloods-bookings`) → ⋮ →
   **Import JSON** → that file. This replaces everything at that path.

## C. The whole Firebase project is gone

Longest scenario. Do it in this order.

1. **New project:** console.firebase.google.com → Add project. Then:
   - Build → **Realtime Database** → Create (region europe-west1).
   - Build → **Authentication** → Sign-in method → **Email/Password** on.
     Leave **Anonymous** off.
   - Project settings → Your apps → Web app (</>) → copy the config values.
2. **firebase-config.js:** paste the new `apiKey`, `databaseURL`, `projectId`,
   `authDomain`, `storageBucket`, `messagingSenderId`, `appId`. Keep `SYNC_PATH`
   the same (or change it everywhere — see step 6).
3. **Rules:** put the new project id in `.firebaserc`, then
   `firebase deploy --only database` (uses `database.rules.json`).
4. **Logins:** Authentication → Users → Add user, for each person.
5. **Data:** log in to the app, then B above (Importeren for the floor plan,
   Import JSON for the Agenda parts).
6. **Functions** (notifications, backups, reminder) — needs the Blaze plan:
   - Switch the project to Blaze and set a budget alert.
   - In `functions/index.js`: check `SYNC_PATH` and, in `notifyNewPickup`,
     `instance:` = the new database name (the part before
     `.europe-west1.firebasedatabase.app` in `databaseURL`).
   - New push keys: ask Claude to generate a VAPID key pair; the public key goes
     in `VAPID_PUBLIC_KEY` in **both** `app.js` and `functions/index.js`, the
     private key via `firebase functions:secrets:set VAPID_PRIVATE_KEY`.
   - Backup token: a new fine-grained GitHub token (only `Stalling-backups`,
     Contents read/write), stored with
     `pbpaste | firebase functions:secrets:set GITHUB_BACKUP_TOKEN --data-file -`.
   - `firebase deploy --only functions`.
7. **Push the app** (`git push origin main`) with the new config and cache
   version bumped in `sw.js`.
8. **Phones:** open the app → Agenda → 🔔 Meldingen aanzetten again.
9. **Booking form and contract system** on zwartendijkstalling.nl use the same
   Firebase project — update their config too.

## C2. This app repo is deleted or messed up (the backup repo is fine)

1. `Stalling-backups` → the most recent day folder → `app-code.zip` → download.
2. Unzip it, create the repo again (same name, **public**), and upload the
   files (or ask Claude to push them). Settings → Pages → deploy from `main`.
   The address stays the same, so phones keep working.

## D. The GitHub account is gone

1. New GitHub account (or ask GitHub support first).
2. New repo, then push the Mac copy (`~/code/Stalling-plattegrond`) or a
   ZIP you kept outside GitHub to it. Settings → Pages → deploy from `main`.
3. New private `Stalling-backups` repo; in `functions/index.js` update
   `BACKUP_REPO`; new token as in C.6; `firebase deploy --only functions`.
4. Phones: remove the old home-screen app and add the new address.

Because the app **and** the backups are both on GitHub, keep a ZIP of both
repos somewhere else once or twice a year (GitHub → Code → Download ZIP →
USB stick or your own cloud storage).

---

## Yearly check-up

- [ ] `Stalling-backups` has recent backups (and `backupStatus` shows no error)
- [ ] Expiry date of the GitHub backup token
- [ ] Payment card on the Google Cloud billing account still valid
- [ ] Budget alert still set
- [ ] Download a ZIP of both repos to somewhere outside GitHub
- [ ] Remove app logins of people who no longer need access
- [ ] Ask Claude whether anything needs updating (Node.js version for the
      functions, Firebase libraries)
