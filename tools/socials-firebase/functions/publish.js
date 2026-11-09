/* Talks to Instagram (API with Instagram login) and YouTube (Data API v3). No Firebase in here.
   Base URLs can be pointed at a local fake for the emulator tests. */
const IG = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com/v23.0';
const FB = process.env.FB_GRAPH_BASE || 'https://graph.facebook.com/v23.0';
const IG_REFRESH = process.env.IG_REFRESH_URL || 'https://graph.instagram.com/refresh_access_token';
const G_TOKEN = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const YT_API = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = process.env.YT_UPLOAD_BASE || 'https://www.googleapis.com/upload/youtube/v3';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(url, { method = 'GET', form, json, headers = {}, body } = {}) {
  const h = { ...headers };
  if (form) { body = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
  if (json) { body = JSON.stringify(json); h['Content-Type'] = 'application/json; charset=UTF-8'; }
  const r = await fetch(url, { method, headers: h, body });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok || data.error) {
    const e = data.error || {};
    const msg = typeof e === 'string' ? `${e}${data.error_description ? ': ' + data.error_description : ''}`
      : (e.error_user_msg || e.message || text.slice(0, 300) || `HTTP ${r.status}`);
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return { data, headers: r.headers };
}

/* ---------- Instagram ---------- */

/* Unified-login system-user tokens start with EAA and go to graph.facebook.com; Instagram-login tokens go to graph.instagram.com. */
const isFb = t => /^EAA/.test(String(t));
const base = t => (isFb(t) ? FB : IG);

async function igMe(token, wantId) {
  if (isFb(token)) {
    // Unified-login tokens: /me is a Facebook (system) user, so check the token against the Instagram account directly.
    const tries = [];
    if (wantId) tries.push(async () => [(await call(`${FB}/${wantId}?fields=id,username&access_token=${encodeURIComponent(token)}`)).data]);
    tries.push(async () => (await call(`${FB}/me/assigned_instagram_accounts?fields=id,username&access_token=${encodeURIComponent(token)}`)).data.data || []);
    tries.push(async () => ((await call(`${FB}/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`)).data.data || [])
      .map(p => p.instagram_business_account).filter(Boolean));
    let list = [], lastErr;
    for (const t of tries) { try { list = await t(); if (list.length) break; } catch (e) { lastErr = e; } }
    const hit = wantId ? list.find(a => String(a.id) === String(wantId)) : list.length === 1 ? list[0] : null;
    if (!hit) throw lastErr && !list.length ? lastErr : new Error(`This token covers ${list.map(a => '@' + a.username).join(', ') || 'no Instagram accounts'}.`);
    return { igId: String(hit.id), username: hit.username };
  }
  const { data } = await call(`${IG}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  return { igId: String(data.user_id), username: data.username };
}

async function igRefresh(token) {
  const { data } = await call(`${IG_REFRESH}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  return data.access_token;
}

async function igQuota(igId, token) {
  const { data } = await call(`${base(token)}/${igId}/content_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(token)}`);
  const d = (data.data || [])[0] || {};
  return { used: d.quota_usage ?? null, total: (d.config || {}).quota_total ?? null };
}

async function igWait(id, token, { every, max }) {
  const until = Date.now() + max;
  while (Date.now() < until) {
    const { data } = await call(`${base(token)}/${id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') throw new Error(`Instagram could not process the media: ${data.status || data.status_code}`);
    await sleep(every);
  }
  throw new Error('Instagram was still processing the media. Try again in a few minutes.');
}

async function igContainer(igId, token, fields) {
  const { data } = await call(`${base(token)}/${igId}/media`, { method: 'POST', form: { ...fields, access_token: token } });
  return data.id;
}

/* kind: image | carousel | reel. urls: public JPEG/MP4 links. Returns { id, url }. */
async function postInstagram({ igId, token, kind, caption, urls, coverUrl, wait = {} }) {
  const imgWait = { every: wait.image ?? 3000, max: 120000 };
  let container;
  if (kind === 'image') {
    container = await igContainer(igId, token, { image_url: urls[0], caption });
    await igWait(container, token, imgWait);
  } else if (kind === 'carousel') {
    const children = [];
    for (const u of urls) children.push(await igContainer(igId, token, { image_url: u, is_carousel_item: 'true' }));
    for (const c of children) await igWait(c, token, imgWait);
    container = await igContainer(igId, token, { media_type: 'CAROUSEL', children: children.join(','), caption });
    await igWait(container, token, imgWait);
  } else if (kind === 'reel') {
    const f = { media_type: 'REELS', video_url: urls[0], caption, share_to_feed: 'true' };
    if (coverUrl) f.cover_url = coverUrl;
    container = await igContainer(igId, token, f);
    await igWait(container, token, { every: wait.video ?? 10000, max: 7 * 60000 });
  } else {
    throw new Error(`Unknown Instagram post type ${kind}`);
  }
  const { data } = await call(`${base(token)}/${igId}/media_publish`, { method: 'POST', form: { creation_id: container, access_token: token } });
  let url = '';
  try { url = (await call(`${base(token)}/${data.id}?fields=permalink&access_token=${encodeURIComponent(token)}`)).data.permalink || ''; } catch { /* the post is live either way */ }
  return { id: data.id, url };
}

/* The same media as a Story. The API can't use the app's "share post to story" sticker, so this is a separate Story with
   the image or video itself (no caption or link). Returns the Story's media id. */
async function postInstagramStory({ igId, token, imageUrl, videoUrl, wait = {} }) {
  const f = { media_type: 'STORIES' };
  if (videoUrl) f.video_url = videoUrl; else f.image_url = imageUrl;
  const container = await igContainer(igId, token, f);
  await igWait(container, token, videoUrl ? { every: wait.video ?? 10000, max: 7 * 60000 } : { every: wait.image ?? 3000, max: 120000 });
  const { data } = await call(`${base(token)}/${igId}/media_publish`, { method: 'POST', form: { creation_id: container, access_token: token } });
  return data.id;
}

/* ---------- YouTube ---------- */

async function ytExchangeCode({ clientId, clientSecret, code }) {
  const { data } = await call(G_TOKEN, { method: 'POST', form: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: 'postmessage', grant_type: 'authorization_code' } });
  if (!data.refresh_token) throw new Error('Google sent no refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
  return data;
}

async function ytAccess({ clientId, clientSecret, refreshToken }) {
  const { data } = await call(G_TOKEN, { method: 'POST', form: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' } });
  return data.access_token;
}

async function ytChannel(access) {
  const { data } = await call(`${YT_API}/channels?part=snippet&mine=true`, { headers: { Authorization: 'Bearer ' + access } });
  const c = (data.items || [])[0];
  return c ? { id: c.id, title: c.snippet.title } : null;
}

/* video: Buffer of the MP4. Returns { id, url }. */
async function postYouTube({ access, title, description, privacy, video }) {
  const meta = {
    snippet: { title: String(title).replace(/\s*\((Short|Reel)\)\s*$/i, '').slice(0, 100), description: String(description || '').slice(0, 4900), categoryId: '22' },
    status: { privacyStatus: privacy || 'public', selfDeclaredMadeForKids: false },
  };
  const { headers } = await call(`${YT_UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST', json: meta,
    headers: { Authorization: 'Bearer ' + access, 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.length) },
  });
  const loc = headers.get('location');
  if (!loc) throw new Error('YouTube did not return an upload address.');
  const { data } = await call(loc, { method: 'PUT', body: video, headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'video/mp4' } });
  return { id: data.id, url: `https://youtube.com/shorts/${data.id}` };
}

module.exports = { igMe, igRefresh, igQuota, postInstagram, postInstagramStory,ytExchangeCode, ytAccess, ytChannel, postYouTube, call };
