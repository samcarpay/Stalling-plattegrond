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
