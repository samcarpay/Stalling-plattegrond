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
//   backups/2026/09-25/app-code.zip      — the app repo as it was that day
// Older backups are thinned out: every day for 30 days, then one per
// week up to a year back, then one per month (they stay in git history).
// If it fails, every device with notifications on gets a message.
//
// The GitHub access token lives in Firebase's secret storage as
// GITHUB_BACKUP_TOKEN (fine-grained, write access to that repo only).
// ─────────────────────────────────────────────────────────────────

const GITHUB_BACKUP_TOKEN = defineSecret('GITHUB_BACKUP_TOKEN');
const BACKUP_REPO = 'samcarpay/Stalling-backups';
const APP_REPO = 'samcarpay/Stalling-plattegrond'; // public, so its ZIP needs no token

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

// Which backup days to thin out. Keeps every day for the last 30 days,
// then the earliest backup of each week up to a year back, then the
// earliest of each month. dates: 'YYYY-MM-DD' strings; today likewise.
function selectBackupsToDelete(dates, today){
  const dayMs = 86400000;
  const utc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const weekKey = (d) => { const t = utc(d); const dow = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dow * dayMs).toISOString().slice(0, 10); };
  const sorted = [...new Set(dates)].sort();
  const firstOf = (keyFn) => {
    const seen = new Set();
    return new Set(sorted.filter(d => { const k = keyFn(d); if(seen.has(k)) return false; seen.add(k); return true; }));
  };
  const firstOfWeek = firstOf(weekKey);
  const firstOfMonth = firstOf(d => d.slice(0, 7));
  return sorted.filter(d => {
    const age = Math.round((utc(today) - utc(d)) / dayMs);
    if(age < 30) return false;
    if(age < 365) return !firstOfWeek.has(d);
    return !firstOfMonth.has(d);
  });
}

async function pruneOldBackups(token, today){
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'stalling-plattegrond-backup',
  };
  const api = (path, opts) => fetch(`https://api.github.com/repos/${BACKUP_REPO}${path}`, { headers, ...opts });
  const repoRes = await api('');
  if(!repoRes.ok) throw new Error(`GitHub ${repoRes.status} reading repo`);
  const branch = (await repoRes.json()).default_branch;
  const treeRes = await api(`/git/trees/${branch}?recursive=1`);
  if(!treeRes.ok) throw new Error(`GitHub ${treeRes.status} listing backups`);
  const files = (await treeRes.json()).tree
    .filter(f => f.type === 'blob' && /^backups\/\d{4}\/\d{2}-\d{2}\//.test(f.path));
  const dateOf = (path) => { const [, y, md] = path.split('/'); return `${y}-${md}`; };
  const toDelete = new Set(selectBackupsToDelete(files.map(f => dateOf(f.path)), today));
  let deleted = 0;
  for(const f of files.filter(f => toDelete.has(dateOf(f.path)))){
    const res = await api(`/contents/${f.path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `Uitdunnen: ${dateOf(f.path)}`, sha: f.sha, branch }),
    });
    if(!res.ok) throw new Error(`GitHub ${res.status} deleting ${f.path}`);
    deleted++;
  }
  return { days: toDelete.size, files: deleted };
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

      // the app itself as it was today (code, rules, RESTORE.md) — git stores
      // an unchanged ZIP only once, so this costs next to nothing
      const zipRes = await fetch(`https://api.github.com/repos/${APP_REPO}/zipball/main`, {
        headers: { 'User-Agent': 'stalling-plattegrond-backup' },
      });
      if(!zipRes.ok) throw new Error(`GitHub ${zipRes.status} downloading the app's code`);
      const zip = Buffer.from(await zipRes.arrayBuffer());
      await putGithubFile(token, `${folder}/app-code.zip`, zip, `Back-up ${y}-${m}-${d}: app code`);
      logger.info('Backup saved', folder, raw.length, 'bytes of floor plan');
      await statusRef.update({ lastSuccessAt: Date.now(), lastSuccessFolder: folder, lastError: null });

      // thinning out never fails the backup itself — it just tries again tomorrow
      try{
        const pruned = await pruneOldBackups(token, `${y}-${m}-${d}`);
        await statusRef.update({ lastPruneAt: Date.now(), lastPruned: pruned, lastPruneError: null });
      }catch(pruneErr){
        logger.error('Thinning out old backups failed', pruneErr.message);
        await statusRef.update({ lastPruneError: String(pruneErr.message).slice(0, 300), lastPruneErrorAt: Date.now() }).catch(() => {});
      }
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

// ─────────────────────────────────────────────────────────────────
// MORNING REMINDER: TODAY'S PICKUPS NOT YET MARKED AWAY
//
// Every morning at 07:00 (Amsterdam time): if any of today's pickups
// (not done yet) isn't marked "weg" in its spot, every device with
// notifications on gets one reminder listing them. Nothing is sent when
// all of today's pickups are already marked away, or there are none.
// Uses the same matching as the Agenda (findMatchingOccupant in app.js).
// ─────────────────────────────────────────────────────────────────

function findLinkedSpot(plattegrond, linked){
  if(!linked) return null;
  const w = (plattegrond.warehouses || []).find(x => x.id === linked.warehouseId);
  if(!w) return null;
  for(const side of ['left', 'right']){
    for(const row of (w[side] || [])){
      const s = (row.spots || []).find(sp => sp.id === linked.spotId);
      if(s) return s;
    }
  }
  return null;
}

function findMatchingOccupant(spot, appt){
  if(!spot || !spot.occupants || spot.occupants.length === 0) return null;
  if(spot.occupants.length === 1) return spot.occupants[0];
  const apptObjNum = (appt.vehicleDesc || '').trim().toLowerCase();
  if(apptObjNum){
    const byObjNum = spot.occupants.find(o => (o.objectNummer || '').trim().toLowerCase() === apptObjNum);
    if(byObjNum) return byObjNum;
  }
  const apptName = (appt.name || '').trim().toLowerCase();
  if(apptName){
    const byName = spot.occupants.find(o => (o.name || '').trim().toLowerCase() === apptName);
    if(byName) return byName;
  }
  return null;
}

exports.morningAwayReminder = onSchedule(
  {
    schedule: 'every day 07:00',
    timeZone: 'Europe/Amsterdam',
    region: 'europe-west1',
    secrets: [VAPID_PRIVATE_KEY],
    retryCount: 0,
  },
  async () => {
    const db = admin.database();
    const [dataSnap, apptsSnap] = await Promise.all([
      db.ref(`${SYNC_PATH}/data`).once('value'),
      db.ref('pickup-appointments').once('value'),
    ]);
    const plattegrond = JSON.parse(dataSnap.val() || '{}');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' }); // YYYY-MM-DD

    const notAway = Object.values(apptsSnap.val() || {})
      .filter(a => a && a.status !== 'done' && a.date === today)
      .filter(a => {
        const occ = findMatchingOccupant(findLinkedSpot(plattegrond, a.linked), a);
        return !(occ && occ.away);
      });
    if(!notAway.length) return;

    const names = notAway.map(a => (a.name || 'onbekend') + (a.time ? ` (${a.time})` : '') + (a.linked ? '' : ' — nog niet gekoppeld'));
    const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ` en nog ${names.length - 4}` : '');
    await sendToAllDevices({
      title: `Vandaag ${notAway.length} ophaling${notAway.length === 1 ? '' : 'en'} nog niet als weg gemarkeerd`,
      body: shown,
      tag: `morning-away-${today}`,
    });
    logger.info('Morning reminder sent', notAway.length);
  }
);
