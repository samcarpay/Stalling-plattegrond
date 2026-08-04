// ─────────────────────────────────────────────────────────────────
// CROSS-DEVICE SYNC SETUP (optional)
//
// Leave FIREBASE_ENABLED as false and the app works exactly as before —
// just without syncing between devices.
//
// To turn on sync:
//   1. Go to https://console.firebase.google.com and create a free project
//      (Google Analytics is not needed — you can skip it).
//   2. In the project: Build → Realtime Database → Create Database.
//      Pick any region. When asked about rules, choose "locked mode" —
//      we'll paste our own rules in the next step.
//   3. Go to the "Rules" tab of the Realtime Database and replace the
//      contents with (then click Publish):
//
//      {
//        "rules": {
//          "YOUR-PRIVATE-PATH-HERE": {
//            ".read": true,
//            ".write": true
//          }
//        }
//      }
//
//      Replace YOUR-PRIVATE-PATH-HERE with a long, made-up, hard-to-guess
//      word (e.g. "yard-8f2x91qz") — anyone who knows this exact word can
//      read/write your data, so keep it private, don't reuse a word from
//      elsewhere, and don't share the URL/word publicly. This app has no
//      login system, so this private path IS the security.
//
//   4. Go to Project settings (gear icon, top left) → General tab →
//      scroll to "Your apps" → click the web icon (</>) → register an app
//      (any nickname) → you'll be shown a firebaseConfig object.
//   5. Copy apiKey, databaseURL, and projectId from that object into the
//      fields below. Set SYNC_PATH to the exact same word you used in the
//      rules in step 3. Set FIREBASE_ENABLED to true.
//   6. Re-upload this file to GitHub (same filename, so it replaces the
//      old one) and commit. Reload the app on each device — they'll now
//      sync automatically whenever you're online.
// ─────────────────────────────────────────────────────────────────

const FIREBASE_ENABLED = true;

const firebaseConfig = {
  apiKey: "AIzaSyAM7A6huZzCnTiGgXymOpS-3uzelzn0gjI",
  databaseURL: "https://stalling-plattegrond-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "stalling-plattegrond",
  // The 4 fields below are only needed if you turn on NIEUWE_KLANTEN_ENABLED
  // further down this file — everything else in this app ignores them, so
  // it's fine to leave them blank otherwise.
  authDomain: "stalling-plattegrond.firebaseapp.com",
  storageBucket: "stalling-plattegrond.firebasestorage.app",
  messagingSenderId: "164944812598",
  appId: "1:164944812598:web:163b7567328b5627055697",
};

const SYNC_PATH = "Plattegrond-111ws-qbh3Tm791";

// ─────────────────────────────────────────────────────────────────
// PIN GATE (optional)
//
// A lightweight "keep casual visitors out" screen shown before the app
// loads. IMPORTANT — read this honestly:
//   - This is NOT real security. It's checked in the browser, so anyone
//     who opens developer tools and reads the page's code can see the
//     PIN. It stops someone from stumbling onto your URL and browsing
//     around, but it will not stop a determined technical person.
//   - Your Firebase database itself is unprotected by this — its real
//     security is still just the private SYNC_PATH word above (see the
//     sync setup notes). The PIN only gates this app's screen.
//
// To turn it on: set a PIN below (letters/numbers, anything you like)
// and re-upload this file. Leave it blank ("") to turn the gate off
// entirely — the app then behaves exactly as before.
// ─────────────────────────────────────────────────────────────────

const APP_PIN = "0808";

// ─────────────────────────────────────────────────────────────────
// REAL LOGIN (optional — a stronger alternative to the PIN above)
//
// Unlike the PIN, this is actual security: a real Firebase account
// (email + password) is required, and — critically — your database
// itself is locked down to only allow logged-in requests, not just
// the app's screen. If you turn this on, the PIN above is ignored.
//
// You already have everything needed for this if you've set up the
// contract system (admin.html) — same Firebase project, same
// Authentication service, same account you log into admin.html with
// can be reused here too.
//
// To turn it on:
//   1. Confirm Email/Password sign-in is enabled: Firebase console →
//      Authentication → Sign-in method → Email/Password. (Already
//      done if you've set up admin.html.)
//   2. Confirm you have at least one user: Authentication → Users.
//      (Your own admin.html login works fine here too.)
//   3. THE IMPORTANT STEP — tighten your Realtime Database rules so
//      the data itself actually requires login, not just the app's
//      screen. Go to Realtime Database → Rules, and change your
//      main private-path entry from this:
//
//        "YOUR-PRIVATE-PATH-HERE": { ".read": true, ".write": true }
//
//      to this:
//
//        "YOUR-PRIVATE-PATH-HERE": { ".read": "auth != null", ".write": "auth != null" }
//
//      Leave any other entries (appointments, blocked-dates) exactly
//      as they were — only change this one line. Click Publish.
//   4. Set USE_REAL_LOGIN below to true.
//   5. Re-upload this file. Reload the app — you'll see a proper
//      email/password screen instead of the PIN.
//
// Leave as false to keep using the PIN (or no gate at all).
// ─────────────────────────────────────────────────────────────────

const USE_REAL_LOGIN = true;

// ─────────────────────────────────────────────────────────────────
// AGENDA / PICKUP APPOINTMENTS (optional)
//
// Lets a booking form on your public website (a separate file — see
// booking-widget.html) drop pickup requests straight into a new
// "Agenda" tab in this app, grouped by week. You link each request to
// the actual bay yourself using the search you already have.
//
// This needs its own small setup, on top of the sync setup above,
// because the booking form is PUBLIC (anyone can submit a request) but
// your storage data must stay PRIVATE. Two separate things make that
// safe:
//   - Appointments live at their own path (set below), not mixed into
//     your private data.
//   - This app signs itself in anonymously (invisible to you, no
//     password) so the Firebase rule can tell "this app" apart from
//     "the public booking form" — the form can only ADD new requests,
//     it can never read existing ones.
//
// To turn it on:
//   1. In the Firebase console: Build → Authentication → Get started →
//      Sign-in method tab → Anonymous → Enable.
//   2. Go to Realtime Database → Rules tab, and add a second entry
//      alongside your existing one (don't remove your existing rule —
//      just add this as a sibling inside the same "rules": { ... }):
//
//      {
//        "rules": {
//          "YOUR-PRIVATE-PATH-HERE": {
//            ".read": true,
//            ".write": true
//          },
//          "YOUR-APPOINTMENTS-PATH-HERE": {
//            ".read": "auth != null",
//            ".write": true
//          }
//        }
//      }
//
//      Replace YOUR-APPOINTMENTS-PATH-HERE with a plain, short, fixed
//      name (e.g. "pickup-appointments") — it does NOT need to be a
//      secret, since the rule already keeps it write-only for the
//      public and read-only for this signed-in app.
//   3. Set APPOINTMENTS_PATH below to that exact same name.
//   4. Re-upload this file. Reload the app — an "📅 Agenda" tab
//      appears automatically once this is filled in.
//   5. Open booking-widget.html for the last step (adding the actual
//      form to your website).
//
// Leave this blank to turn the whole feature off — nothing else changes.
// ─────────────────────────────────────────────────────────────────

const APPOINTMENTS_PATH = "pickup-appointments";

// ─────────────────────────────────────────────────────────────────
// BLOCKED PICKUP DATES (optional, needs Agenda set up above)
//
// Lets you block specific dates (holidays, closures) so customers can't
// pick them on the booking form, and manage the list from a new
// "Blocked dates" button in this app's toolbar.
//
// Same public-read / staff-only-write split as appointments above —
// the booking form needs to READ the list to check a date, but only
// this signed-in app can ADD or REMOVE blocked dates.
//
// To turn it on:
//   1. Realtime Database → Rules tab → add a third sibling entry:
//
//      {
//        "rules": {
//          "YOUR-PRIVATE-PATH-HERE": { ".read": true, ".write": true },
//          "YOUR-APPOINTMENTS-PATH-HERE": { ".read": "auth != null", ".write": true },
//          "YOUR-BLOCKED-DATES-PATH-HERE": { ".read": true, ".write": "auth != null" }
//        }
//      }
//
//      Note this one is the other way around from appointments: here
//      anyone can READ (the booking form needs to check dates), but
//      only this signed-in app can WRITE (so a stranger can't block
//      your dates). Pick any plain name, e.g. "blocked-dates".
//   2. Set BLOCKED_DATES_PATH below to that same name.
//   3. Re-upload this file. A "Blocked dates" button appears in the
//      toolbar once this is filled in.
//
// Leave blank to turn this feature off.
// ─────────────────────────────────────────────────────────────────

const BLOCKED_DATES_PATH = "blocked-dates";

// ─────────────────────────────────────────────────────────────────
// NIEUWE KLANTEN / NEW CUSTOMERS FROM THE CONTRACT SYSTEM (optional)
//
// If you've set up the separate stallingscontract system (klant.html /
// admin.html / onderteken.html), this lets Storage Sites read signed
// contracts from it and show them in a new "🧾 Nieuwe klanten" tab —
// with a button to place each one straight into a real bay, pre-filled
// with their name, kenteken, email, phone and object nummer, so you
// don't have to retype anything you already collected.
//
// SECURITY NOTE — please read this honestly before turning it on:
// This app already signs itself in anonymously to support the Agenda
// feature above. Your contract system's Firestore rules currently
// treat "signed in" as one single permission level — they don't
// distinguish "the real admin.html login" from "this app's quiet
// anonymous session." That means turning this on gives Storage Sites
// the same read/write reach into your contract data that admin.html
// has, not just read-only access to signed contracts. Given Storage
// Sites is already PIN-protected and not public-facing, this is a
// reasonable tradeoff for a small operation — but it's a real one,
// not a hidden one.
//
// To turn it on:
//   1. Make sure you've already completed the sync setup at the very
//      top of this file (FIREBASE_ENABLED, firebaseConfig, SYNC_PATH).
//   2. This feature specifically also needs the 4 extra fields in
//      firebaseConfig above (authDomain, storageBucket,
//      messagingSenderId, appId) filled in — the rest of this app
//      doesn't need them, but the contract system's Firestore
//      database does. You already have all 6 values from setting up
//      the contract system's own firebase-config.js — copy the same
//      6 values across into firebaseConfig above.
//   3. Set NIEUWE_KLANTEN_ENABLED below to true.
//   4. Re-upload this file. A "🧾 Nieuwe klanten" tab appears once
//      there's at least one signed contract waiting to be placed.
//
// Leave as false to turn this feature off entirely.
// ─────────────────────────────────────────────────────────────────

const NIEUWE_KLANTEN_ENABLED = true;

// ─────────────────────────────────────────────────────────────────
// OFF-FIREBASE EMAIL BACKUP (optional)
//
// Everything in this app currently lives in one Firebase project.
// The Backups feature already protects you against mistakes (bad
// imports, accidental deletions) — but it doesn't protect you against
// losing access to Firebase itself. This adds a "Back-up nu e-mailen"
// button to the Backups screen that sends your current data as a
// .json file attached to an email, landing somewhere completely
// outside Firebase (your own inbox).
//
// This is a MANUAL button, not an automatic schedule — building true
// automatic scheduled backups needs a server-side component this
// static site doesn't have. Clicking it monthly (or whenever you
// think of it) is enough to matter.
//
// Reuses the same EmailJS account as your booking widget and contract
// system — same Public Key and Service ID, just one new template.
//
// To turn it on:
//   1. In your EmailJS account (emailjs.com), create ONE new template
//      with variables {{to_email}}, {{filename}}, {{date}} in the body,
//      and an attachment linked to {{backup_base64}} / {{backup_filename}}
//      (via the "Attachment" field in the template editor — same way
//      the contract PDF email attachment was set up).
//   2. Fill in the 4 values below.
//   3. Re-upload this file. A button appears in the Backups modal.
//
// Leave EMAILJS_TEMPLATE_ID_BACKUP blank to leave this feature off.
// ─────────────────────────────────────────────────────────────────

const BACKUP_EMAIL_PUBLIC_KEY = "";      // same as your booking widget's EMAILJS_PUBLIC_KEY
const BACKUP_EMAIL_SERVICE_ID = "";      // same as your booking widget's EMAILJS_SERVICE_ID
const EMAILJS_TEMPLATE_ID_BACKUP = "";   // new template, see instructions above
const BACKUP_EMAIL_TO = "";              // the email address that should receive backups
