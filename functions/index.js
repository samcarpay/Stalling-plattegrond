// ─────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS FOR NEW CUSTOMER PICKUP REQUESTS
//
// Runs at Firebase whenever the public booking form adds a new entry
// under pickup-appointments. Sends a notification (with the red count
// on the app icon) to every device that turned notifications on from
// the Agenda tab.
//
// Staff-made appointments (source: 'manual' / 'auto') are skipped —
// only requests from customers via the website notify.
//
// The private half of the push key is NOT in this repo — it lives in
// Firebase's secret storage as VAPID_PRIVATE_KEY.
// ─────────────────────────────────────────────────────────────────

const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// must match SYNC_PATH in firebase-config.js and VAPID_PUBLIC_KEY in index.html
const SYNC_PATH = 'Plattegrond-111ws-qbh3Tm791';
const VAPID_PUBLIC_KEY = 'BPe_35GQQK7ZoPVo46UdsLzA3lpIk2oq13RcOg3ex_v5Nh0OPHn1ZW3VYCgfEWyeeYub_mIFWI1p-pH0NqXcHC8';
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');

// Sends one push message to every device that turned notifications on.
async function sendToAllDevices(message){
  const db = admin.database();
  const subs = (await db.ref(`${SYNC_PATH}/push/subscriptions`).once('value')).val() || {};
  if(!Object.keys(subs).length) return;
  webpush.setVapidDetails('https://zwartendijkstalling.nl', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
  const payload = JSON.stringify(message);
  await Promise.all(Object.entries(subs).map(async ([key, sub]) => {
    try{
      await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'high' });
    }catch(err){
      if(err.statusCode === 404 || err.statusCode === 410){
        // device turned notifications off or the subscription expired
        await db.ref(`${SYNC_PATH}/push/subscriptions/${key}`).remove();
      } else {
        logger.error('Push failed', key, err.statusCode, err.body || err.message);
      }
    }
  }));
}

function formatDate(isoDate){
  if(!isoDate) return '';
  const d = new Date(isoDate + 'T12:00:00Z');
  if(isNaN(d)) return isoDate;
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });
}

exports.notifyNewPickup = onValueCreated(
  {
    ref: '/pickup-appointments/{apptId}',
    instance: 'stalling-plattegrond-default-rtdb',
    region: 'europe-west1',
    secrets: [VAPID_PRIVATE_KEY],
  },
  async (event) => {
    const appt = event.data.val();
    if(!appt || appt.source) return; // staff-made, not a customer request

    const db = admin.database();
    const [seenSnap, apptsSnap] = await Promise.all([
      db.ref(`${SYNC_PATH}/push/lastSeenAgendaAt`).once('value'),
      db.ref('pickup-appointments').once('value'),
    ]);

    // badge = customer requests that came in since someone last opened the Agenda
    const lastSeen = seenSnap.val() || 0;
    const badge = Object.values(apptsSnap.val() || {})
      .filter(a => a && !a.source && a.status === 'requested' && (a.createdAt || 0) > lastSeen)
      .length;

    const when = [formatDate(appt.date), appt.time].filter(Boolean).join(' ');
    await sendToAllDevices({
      title: 'Nieuwe ophaalafspraak',
      body: [appt.name || 'Onbekende klant', when].filter(Boolean).join(' — '),
      tag: `pickup-${event.params.apptId}`,
      badge,
    });
  }
);

// ─────────────────────────────────────────────────────────────────
// NIGHTLY BACKUP TO A PRIVATE GITHUB REPO
//
// Every night at 03:00 (Amsterdam time) this saves a copy of all data
// to a PRIVATE GitHub repo, outside Google, one folder per day:
//   backups/2026/09-25/plattegrond.json  — the floor plan; can be loaded
//                                          straight into the app with
//                                          "Importeren"
//   backups/2026/09-25/agenda.json       — pickup appointments, blocked
//                                          dates and planning bookings
// If it fails, every device with notifications on gets a message.
//
// The GitHub access token lives in Firebase's secret storage as
// GITHUB_BACKUP_TOKEN (fine-grained, write access to that repo only).
// ─────────────────────────────────────────────────────────────────

const GITHUB_BACKUP_TOKEN = defineSecret('GITHUB_BACKUP_TOKEN');
const BACKUP_REPO = 'samcarpay/Stalling-backups';

async function putGithubFile(token, path, content, message){
  const url = `https://api.github.com/repos/${BACKUP_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'stalling-plattegrond-backup',
  };
  // a second run on the same day replaces that day's file, which needs its sha
  const existing = await fetch(url, { headers });
  const sha = existing.ok ? (await existing.json()).sha : undefined;
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  });
  if(!res.ok) throw new Error(`GitHub ${res.status} for ${path}: ${(await res.text()).slice(0, 300)}`);
}

exports.nightlyBackup = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Europe/Amsterdam',
    region: 'europe-west1',
    secrets: [GITHUB_BACKUP_TOKEN, VAPID_PRIVATE_KEY],
    retryCount: 0, // tomorrow's run is the retry — one failure message per night is enough
  },
  async () => {
    const db = admin.database();
    const statusRef = db.ref(`${SYNC_PATH}/backupStatus`);
    try{
      const [dataSnap, apptsSnap, blockedSnap, planningSnap] = await Promise.all([
        db.ref(`${SYNC_PATH}/data`).once('value'),
        db.ref('pickup-appointments').once('value'),
        db.ref('blocked-dates').once('value'),
        db.ref('werkloods-bookings').once('value'),
      ]);
      const raw = dataSnap.val();
      if(!raw) throw new Error('no floor plan data found — nothing backed up');
      const plattegrond = JSON.parse(raw); // throws on corrupt data, so a bad copy is never saved

      const now = new Date();
      const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' }).split('-');
      const folder = `backups/${y}/${m}-${d}`;
      const token = GITHUB_BACKUP_TOKEN.value().trim(); // a pasted token can carry a stray newline

      await putGithubFile(token, `${folder}/plattegrond.json`, JSON.stringify(plattegrond, null, 1), `Back-up ${y}-${m}-${d}: plattegrond`);
      await putGithubFile(token, `${folder}/agenda.json`, JSON.stringify({
        backedUpAt: now.toISOString(),
        pickupAppointments: apptsSnap.val() || {},
        blockedDates: blockedSnap.val() || {},
        planningBookings: planningSnap.val() || {},
      }, null, 1), `Back-up ${y}-${m}-${d}: agenda`);
      logger.info('Backup saved', folder, raw.length, 'bytes of floor plan');
      await statusRef.update({ lastSuccessAt: Date.now(), lastSuccessFolder: folder, lastError: null });
    }catch(err){
      logger.error('Nightly backup failed', err.message);
      await statusRef.update({ lastError: String(err.message).slice(0, 500), lastErrorAt: Date.now() }).catch(() => {});
      await sendToAllDevices({
        title: 'Back-up mislukt',
        body: 'De nachtelijke back-up naar GitHub is niet gelukt. Vraag Claude om het te bekijken.',
        tag: 'backup-failed',
      }).catch(() => {});
      throw err; // marks the run as failed so it's retried and visible in the logs
    }
  }
);
