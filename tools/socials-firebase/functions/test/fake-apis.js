/* A stand-in for Instagram, Google OAuth and YouTube, for the emulator tests. Listens on 127.0.0.1:9300.
   It fetches every image_url / video_url / cover_url it is given, like Instagram does, and records what it got.
   A caption containing FAIL makes Instagram reject the post. GET /calls returns the log. */
const http = require('http');

const calls = [];
let n = 0;
const containers = {};

const readBody = req => new Promise(res => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };

async function fetchMedia(url) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: r.ok, status: r.status, type: r.headers.get('content-type'), bytes: buf.length };
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), body = await readBody(req);
  const form = Object.fromEntries(new URLSearchParams(req.headers['content-type'] === 'application/x-www-form-urlencoded' ? body.toString() : ''));
  const q = Object.fromEntries(u.searchParams);
  const p = u.pathname;
  const log = { method: req.method, path: p, form, q: { ...q, access_token: q.access_token ? 'tok' : undefined } };
  if (p !== '/calls') calls.push(log);
  try {
    if (p === '/calls') return send(res, 200, calls);
    if (p === '/reset') { calls.length = 0; return send(res, 200, {}); }

    // Instagram
    if (p === '/ig/me') return send(res, 200, { user_id: '17841400000000001', username: 'fake_' + String(q.access_token).slice(-4) });
    if (p === '/ig/refresh_access_token') return send(res, 200, { access_token: q.access_token + '-r', expires_in: 5184000 });
    const m = p.match(/^\/ig\/(\w+)(?:\/(\w+))?$/);
    if (m && m[2] === 'content_publishing_limit') return send(res, 200, { data: [{ quota_usage: 2, config: { quota_total: 100 } }] });
    if (m && m[2] === 'media' && req.method === 'POST') {
      if ((form.caption || '').includes('FAIL')) return send(res, 400, { error: { message: 'Fake Instagram rejected this post', code: 100 } });
      if (form.media_type === 'STORIES' && (form.access_token || '').includes('nostory')) return send(res, 400, { error: { message: 'Fake Instagram rejected the story', code: 100 } });
      for (const k of ['image_url', 'video_url', 'cover_url']) if (form[k]) log[k.replace('_url', '')] = await fetchMedia(form[k]);
      const id = 'c' + (++n);
      containers[id] = { polls: form.media_type === 'REELS' ? 1 : 0 };
      return send(res, 200, { id });
    }
    if (m && m[2] === 'media_publish') return send(res, 200, { id: 'm' + (++n) });
    if (m && !m[2] && containers[m[1]]) {
      const c = containers[m[1]];
      return send(res, 200, { status_code: c.polls-- > 0 ? 'IN_PROGRESS' : 'FINISHED' });
    }
    if (m && !m[2] && m[1].startsWith('m')) return send(res, 200, { permalink: `https://www.instagram.com/p/FAKE_${m[1]}/` });

    // Google OAuth + YouTube
    if (p === '/token') {
      if (form.grant_type === 'authorization_code') return send(res, 200, { access_token: 'ya29.fake', refresh_token: '1//fake-refresh' });
      return send(res, 200, { access_token: 'ya29.fake' });
    }
    if (p === '/yt/channels') return send(res, 200, { items: [{ id: 'UCfake', snippet: { title: 'Fake tappStudio channel' } }] });
    if (p === '/upload/videos' && req.method === 'POST') {
      log.meta = JSON.parse(body.toString());
      log.declared = req.headers['x-upload-content-length'];
      return send(res, 200, {}, { Location: 'http://127.0.0.1:9300/upload/session/' + (++n) });
    }
    if (p.startsWith('/upload/session/') && req.method === 'PUT') { log.bytes = body.length; return send(res, 200, { id: 'yt' + (++n) }); }

    send(res, 404, { error: { message: 'fake: no route ' + p } });
  } catch (e) {
    send(res, 500, { error: { message: 'fake: ' + e.message } });
  }
}).listen(9300, '127.0.0.1', () => console.log('fake APIs on http://127.0.0.1:9300'));
