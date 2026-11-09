/* tappStudio socials: posts Instagram images, carousels and reels, and YouTube Shorts, from the calendar page.

   api   (callable)  everything the page asks for: sign-in check, queue a post now or at a time, cancel, retry,
                     list jobs, connect accounts. Only the owner emails in OWNER_EMAILS can use it.
   tick  (every 30 min, :00 and :30 IST) posts whatever is due, marks stuck posts, refreshes Instagram tokens once a week.

   Firestore (Admin SDK only, so no client rules are needed):
     jobs/{board}__{brand}__{id}   one per post: state scheduled | posting | posted | failed
     private/creds                 Instagram tokens per brand, YouTube OAuth client and refresh token
   Storage: media/... uploaded by the page (JPEG slides, MP4 reels, JPEG covers); deleted once nothing still needs it. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const P = require('./publish');

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 2 });
const OWNER_EMAILS = defineString('OWNER_EMAILS', { description: 'Comma-separated Google account emails allowed to post' });

const db = getFirestore();
const bucket = () => getStorage().bucket(process.env.MEDIA_BUCKET || undefined);   // MEDIA_BUCKET only in the emulator
const CREDS = () => db.doc('private/creds');
const STUCK_MS = 20 * 60000;          // a post still "posting" after this is marked failed for you to check
const MAX_PER_TICK = 4;
const TOKEN_REFRESH_MS = 7 * 86400000;
const OK_ID = /^[A-Za-z0-9_-]{1,128}$/;

const istDate = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);   // IST is UTC+5:30, no DST
const jobId = (board, brand, id) => `${board}__${brand}__${id}`;

/* ---------- calendar status (same encoding as socials/index.html: posted = "p=<date>;a=1;d=<moved date>") ---------- */
const decMeta = v => { const m = {}; if (!v) return m; if (!v.includes('=')) { m.p = v; return m; }
  v.split(';').forEach(kv => { const [k, ...r] = kv.split('='); if (k) m[k] = r.join('='); }); return m; };
const encMeta = m => ['p', 'a', 'd'].filter(k => m[k]).map(k => `${k}=${m[k]}`).join(';');

async function setCalendarStatus(board, brand, id, status) {
  const ref = db.doc(`boards/${board}/status/${brand}__${id}`);
  const snap = await ref.get();
  const meta = decMeta(snap.exists ? snap.get('posted') : '');
  meta.p = status === 'posted' ? istDate() : '';
  await ref.set({ brand, id, status, posted: encMeta(meta), updated: Timestamp.now() });
}

/* ---------- auth ---------- */
function owner(req) {
  const t = req.auth && req.auth.token;
  const allowed = OWNER_EMAILS.value().split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!t || !t.email || !t.email_verified || !allowed.includes(t.email.toLowerCase())) {
    throw new HttpsError('permission-denied', 'This Google account is not allowed to post.');
  }
  return t;
}

/* ---------- media ---------- */
/* A download-token link Instagram can fetch. Same as getDownloadURL, but through the storage API, which the emulator
   also lets the Admin SDK use (its getDownloadURL call is held to the client rules there). Web uploads already carry
   a token; one is added if a file has none. */
async function publicUrl(path) {
  const file = bucket().file(path);
  const [meta] = await file.getMetadata();
  let token = ((meta.metadata || {}).firebaseStorageDownloadTokens || '').split(',')[0];
  if (!token) {
    token = require('crypto').randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${file.bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function cleanupMedia(paths, exceptJob) {
  if (!paths.length) return;
  const open = await db.collection('jobs').where('state', 'in', ['scheduled', 'posting', 'failed']).get();
  const inUse = new Set();
  open.docs.filter(d => d.id !== exceptJob).forEach(d => [...(d.get('media') || []), d.get('cover')].forEach(p => p && inUse.add(p)));
  await Promise.all(paths.filter(p => p && !inUse.has(p)).map(p => bucket().file(p).delete({ ignoreNotFound: true }).catch(e => logger.warn('delete failed', p, e.message))));
}

/* ---------- credentials ---------- */
async function readCreds() {
  const s = await CREDS().get();
  return s.exists ? s.data() : {};
}

async function igAccount(brand) {
  const ig = ((await readCreds()).ig || {})[brand];
  if (!ig || !ig.token) throw new Error(`Instagram is not connected for ${brand}. Open Accounts on the calendar.`);
  return ig;
}

async function ytCreds() {
  const yt = (await readCreds()).yt || {};
  if (!yt.refreshToken) throw new Error('YouTube is not connected. Open Accounts on the calendar.');
  return yt;
}

/* Instagram account ids per brand, as Meta's app dashboard lists them. Unified-login tokens are checked against these. */
const IG_IDS = { nasab: '17841435631780906', kadak: '17841414977107902', misbaha: '17841464963491348', splitup: '17841474271475128' };

/* ---------- posting ---------- */
async function publish(job) {
  if (job.platform === 'IG') {
    const ig = await igAccount(job.brand);
    const urls = await Promise.all(job.media.map(publicUrl));
    const coverUrl = job.cover ? await publicUrl(job.cover).catch(() => '') : '';
    const res = await P.postInstagram({ igId: ig.igId, token: ig.token, kind: job.kind, caption: job.caption, urls, coverUrl });
    // Also as a Story (on unless switched off in Accounts): the image, the first carousel slide, or the reel video.
    // A Story that fails never fails the post; the reason is shown on the row.
    if (ig.story !== false) {
      try {
        res.story = await P.postInstagramStory({ igId: ig.igId, token: ig.token, ...(job.kind === 'reel' ? { videoUrl: urls[0] } : { imageUrl: urls[0] }) });
      } catch (e) {
        res.storyError = String(e.message || e).slice(0, 300);
        logger.warn('story failed', job.brand, job.id, res.storyError);
      }
    }
    return res;
  }
  if (job.platform === 'YT') {
    const yt = await ytCreds();
    const access = await P.ytAccess(yt);
    const [video] = await bucket().file(job.media[0]).download();
    return P.postYouTube({ access, title: job.title, description: job.caption, privacy: yt.privacy, video });
  }
  throw new Error(`Unknown platform ${job.platform}`);
}

/* Claims the job (scheduled -> posting) so two runs can never post it twice, then posts it. */
async function processJob(ref) {
  const claimed = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists || s.get('state') !== 'scheduled') return null;
    tx.update(ref, { state: 'posting', started: Timestamp.now(), error: '' });
    return s.data();
  });
  if (!claimed) return (await ref.get()).data() || null;
  try {
    const res = await publish(claimed);
    await ref.update({ state: 'posted', remoteId: res.id, url: res.url, story: res.story || '', storyError: res.storyError || '',
      postedAt: Timestamp.now(), updated: Timestamp.now() });
    logger.info('posted', ref.id, res.url);
    await setCalendarStatus(claimed.board, claimed.brand, claimed.id, 'posted').catch(e => logger.error('calendar status', e));
    await cleanupMedia([...claimed.media, claimed.cover], ref.id).catch(e => logger.warn('cleanup', e.message));
  } catch (e) {
    logger.error('post failed', ref.id, e);
    await ref.update({ state: 'failed', error: String(e.message || e).slice(0, 500), updated: Timestamp.now() });
    await setCalendarStatus(claimed.board, claimed.brand, claimed.id, 'ready').catch(() => {});
  }
  return (await ref.get()).data();
}

/* ---------- api ---------- */
const view = d => {
  const j = d.data();
  return { key: d.id, board: j.board, brand: j.brand, id: j.id, platform: j.platform, kind: j.kind, state: j.state,
    at: j.at ? j.at.toMillis() : null, url: j.url || '', error: j.error || '', story: !!j.story, storyError: j.storyError || '', postedAt: j.postedAt ? j.postedAt.toMillis() : null };
};

function checkQueue(d) {
  const bad = m => { throw new HttpsError('invalid-argument', m); };
  if (!OK_ID.test(d.board || '') || !OK_ID.test(d.brand || '') || !OK_ID.test(d.id || '')) bad('Missing board, brand or post id.');
  if (!['IG', 'YT'].includes(d.platform)) bad('Only Instagram and YouTube posts can be posted from here.');
  const kinds = d.platform === 'IG' ? ['image', 'carousel', 'reel'] : ['short'];
  if (!kinds.includes(d.kind)) bad(`A ${d.platform} post can't be a ${d.kind}.`);
  const media = Array.isArray(d.media) ? d.media : [];
  if (!media.length || media.some(p => typeof p !== 'string' || !p.startsWith('media/') || p.includes('..'))) bad('The media was not uploaded.');
  if (d.kind === 'carousel' && (media.length < 2 || media.length > 10)) bad('An Instagram carousel needs 2 to 10 images.');
  if (d.kind !== 'carousel' && media.length !== 1) bad('This post takes exactly one file.');
  if (d.cover && (typeof d.cover !== 'string' || !d.cover.startsWith('media/'))) bad('Bad cover path.');
  if (typeof d.caption !== 'string' || d.caption.length > 2200) bad('The caption is missing or over 2,200 characters.');
  if (d.at != null && (typeof d.at !== 'number' || d.at > Date.now() + 180 * 86400000)) bad('Pick a time within the next 6 months.');
}

const actions = {
  async hello(req) {
    const t = owner(req);
    if (t.owner !== true) await getAuth().setCustomUserClaims(t.uid, { owner: true });
    return { owner: true, refreshToken: t.owner !== true };
  },

  async jobs(req) {
    owner(req);
    const board = req.data.board;
    if (!OK_ID.test(board || '')) throw new HttpsError('invalid-argument', 'Missing board.');
    const snap = await db.collection('jobs').where('board', '==', board).get();
    return { jobs: snap.docs.map(view) };
  },

  async queue(req) {
    const t = owner(req), d = req.data;
    checkQueue(d);
    const ref = db.doc(`jobs/${jobId(d.board, d.brand, d.id)}`);
    const now = Date.now(), at = d.at && d.at > now + 60000 ? d.at : now;
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (s.exists && ['posting', 'posted'].includes(s.get('state'))) throw new HttpsError('failed-precondition', `This post is already ${s.get('state')}.`);
      tx.set(ref, { board: d.board, brand: d.brand, id: d.id, platform: d.platform, kind: d.kind, caption: d.caption,
        title: String(d.title || '').slice(0, 200), media: d.media, cover: d.cover || '', at: Timestamp.fromMillis(at),
        state: 'scheduled', error: '', url: '', by: t.email, created: s.exists ? s.get('created') : Timestamp.now(), updated: Timestamp.now() });
    });
    if (at > now) {
      await setCalendarStatus(d.board, d.brand, d.id, 'scheduled');
      return { job: view(await ref.get()) };
    }
    await processJob(ref);
    return { job: view(await ref.get()) };
  },

  async retry(req) {
    owner(req);
    const d = req.data, ref = db.doc(`jobs/${jobId(d.board, d.brand, d.id)}`);
    const s = await ref.get();
    if (!s.exists || s.get('state') !== 'failed') throw new HttpsError('failed-precondition', 'Only a failed post can be retried.');
    await ref.update({ state: 'scheduled', at: Timestamp.now(), error: '' });
    await processJob(ref);
    return { job: view(await ref.get()) };
  },

  async cancel(req) {
    owner(req);
    const d = req.data, ref = db.doc(`jobs/${jobId(d.board, d.brand, d.id)}`);
    const s = await ref.get();
    if (!s.exists) return { ok: true };
    if (!['scheduled', 'failed'].includes(s.get('state'))) throw new HttpsError('failed-precondition', `It is already ${s.get('state')}.`);
    await ref.delete();
    await cleanupMedia([...(s.get('media') || []), s.get('cover')], ref.id);
    await setCalendarStatus(s.get('board'), s.get('brand'), s.get('id'), 'ready');
    return { ok: true };
  },

  /* What is connected, never the tokens themselves. */
  async accounts(req) {
    owner(req);
    const c = await readCreds(), ig = {};
    for (const [brand, a] of Object.entries(c.ig || {})) {
      ig[brand] = { username: a.username, igId: a.igId, refreshed: a.refreshed || '', story: a.story !== false, quota: null, error: '' };
      try { ig[brand].quota = await P.igQuota(a.igId, a.token); } catch (e) { ig[brand].error = e.message; }
    }
    const yt = c.yt || {};
    return { ig, yt: { clientId: yt.clientId || '', hasSecret: !!yt.clientSecret, connected: !!yt.refreshToken, channel: yt.channel || null, privacy: yt.privacy || 'public' } };
  },

  async setInstagram(req) {
    owner(req);
    const { brand, token } = req.data;
    if (!OK_ID.test(brand || '') || typeof token !== 'string' || token.length < 20) throw new HttpsError('invalid-argument', 'Paste the long-lived Instagram token.');
    let me;
    try { me = await P.igMe(token.trim(), req.data.igId || IG_IDS[brand]); } catch (e) { throw new HttpsError('invalid-argument', `Instagram rejected the token: ${e.message}`); }
    await CREDS().set({ ig: { [brand]: { token: token.trim(), igId: me.igId, username: me.username, refreshed: new Date().toISOString() } } }, { merge: true });
    return { username: me.username };
  },

  /* "Also post to Story" for one account. On unless switched off. */
  async setInstagramStory(req) {
    owner(req);
    const { brand, on } = req.data;
    if (!OK_ID.test(brand || '') || typeof on !== 'boolean') throw new HttpsError('invalid-argument', 'Missing brand or setting.');
    if (!((await readCreds()).ig || {})[brand]) throw new HttpsError('failed-precondition', 'Connect this Instagram account first.');
    await CREDS().set({ ig: { [brand]: { story: on } } }, { merge: true });
    return { story: on };
  },

  async removeInstagram(req) {
    owner(req);
    if (!OK_ID.test(req.data.brand || '')) throw new HttpsError('invalid-argument', 'Missing brand.');
    await CREDS().set({ ig: { [req.data.brand]: FieldValue.delete() } }, { merge: true });
    return { ok: true };
  },

  async setYouTubeClient(req) {
    owner(req);
    const { clientId, clientSecret, privacy } = req.data, patch = {};
    if (clientId) patch.clientId = String(clientId).trim();
    if (clientSecret) patch.clientSecret = String(clientSecret).trim();
    if (privacy) {
      if (!['public', 'unlisted', 'private'].includes(privacy)) throw new HttpsError('invalid-argument', 'Privacy must be public, unlisted or private.');
      patch.privacy = privacy;
    }
    await CREDS().set({ yt: patch }, { merge: true });
    return { ok: true };
  },

  /* The page gets a one-time code from Google's popup (redirect_uri "postmessage"); we swap it for a refresh token. */
  async connectYouTube(req) {
    owner(req);
    const yt = (await readCreds()).yt || {};
    if (!yt.clientId || !yt.clientSecret) throw new HttpsError('failed-precondition', 'Save the YouTube OAuth client ID and secret first.');
    let tok, channel;
    try {
      tok = await P.ytExchangeCode({ clientId: yt.clientId, clientSecret: yt.clientSecret, code: String(req.data.code || '') });
      channel = await P.ytChannel(tok.access_token);
    } catch (e) { throw new HttpsError('invalid-argument', `Google sign-in failed: ${e.message}`); }
    if (!channel) throw new HttpsError('failed-precondition', 'That Google account has no YouTube channel.');
    await CREDS().set({ yt: { refreshToken: tok.refresh_token, channel } }, { merge: true });
    return { channel };
  },
};

exports.api = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async req => {
  const fn = actions[req.data && req.data.action];
  if (!fn) throw new HttpsError('invalid-argument', 'Unknown action.');
  try {
    return await fn(req);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error(req.data.action, e);
    throw new HttpsError('internal', String(e.message || e).slice(0, 300));
  }
});

/* ---------- schedule ---------- */
async function refreshInstagramTokens() {
  const c = await readCreds();
  for (const [brand, a] of Object.entries(c.ig || {})) {
    if (/^EAA/.test(a.token)) continue; // system-user tokens never expire
    if (a.refreshed && Date.now() - Date.parse(a.refreshed) < TOKEN_REFRESH_MS) continue;
    try {
      const token = await P.igRefresh(a.token);
      await CREDS().set({ ig: { [brand]: { token, refreshed: new Date().toISOString() } } }, { merge: true });
      logger.info('refreshed Instagram token', brand);
    } catch (e) { logger.warn('Instagram token refresh failed', brand, e.message); }
  }
}

async function runTick() {
  const started = Date.now();
  const scheduled = await db.collection('jobs').where('state', '==', 'scheduled').get();
  const due = scheduled.docs.filter(d => d.get('at').toMillis() <= Date.now()).sort((a, b) => a.get('at').toMillis() - b.get('at').toMillis());
  for (const d of due.slice(0, MAX_PER_TICK)) {
    if (Date.now() - started > 6 * 60000) break;   // leave the rest for the next run
    await processJob(d.ref);
  }
  const posting = await db.collection('jobs').where('state', '==', 'posting').get();
  for (const d of posting.docs) {
    const s = d.get('started');
    if (!s || Date.now() - s.toMillis() > STUCK_MS) {
      await d.ref.update({ state: 'failed', error: 'Posting did not finish. Check the account before retrying: it may have gone out.' });
    }
  }
  await refreshInstagramTokens();
  return due.length;
}

// On the hour and half hour, IST. The page rounds scheduled times up to these slots.
exports.tick = onSchedule({ schedule: '*/30 * * * *', timeZone: 'Asia/Kolkata', timeoutSeconds: 540, memory: '512MiB', retryCount: 0 }, async () => {
  const n = await runTick();
  if (n) logger.info(`tick: ${n} due`);
});

// The emulator has no scheduler, so the tests run a tick through the api. Never available once deployed.
if (process.env.FUNCTIONS_EMULATOR === 'true') actions._tick = async req => { owner(req); return { due: await runTick() }; };
