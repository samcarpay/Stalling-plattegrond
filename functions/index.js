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
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// must match SYNC_PATH in firebase-config.js and VAPID_PUBLIC_KEY in index.html
const SYNC_PATH = 'Plattegrond-111ws-qbh3Tm791';
const VAPID_PUBLIC_KEY = 'BPe_35GQQK7ZoPVo46UdsLzA3lpIk2oq13RcOg3ex_v5Nh0OPHn1ZW3VYCgfEWyeeYub_mIFWI1p-pH0NqXcHC8';
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');

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
    const [subsSnap, seenSnap, apptsSnap] = await Promise.all([
      db.ref(`${SYNC_PATH}/push/subscriptions`).once('value'),
      db.ref(`${SYNC_PATH}/push/lastSeenAgendaAt`).once('value'),
      db.ref('pickup-appointments').once('value'),
    ]);
    const subs = subsSnap.val() || {};
    if(!Object.keys(subs).length) return;

    // badge = customer requests that came in since someone last opened the Agenda
    const lastSeen = seenSnap.val() || 0;
    const badge = Object.values(apptsSnap.val() || {})
      .filter(a => a && !a.source && a.status === 'requested' && (a.createdAt || 0) > lastSeen)
      .length;

    const when = [formatDate(appt.date), appt.time].filter(Boolean).join(' ');
    const payload = JSON.stringify({
      title: 'Nieuwe ophaalafspraak',
      body: [appt.name || 'Onbekende klant', when].filter(Boolean).join(' — '),
      tag: `pickup-${event.params.apptId}`,
      badge,
    });

    webpush.setVapidDetails('https://zwartendijkstalling.nl', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());

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
);
