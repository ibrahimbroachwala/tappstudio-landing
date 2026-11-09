/* End-to-end test against the local emulators and test/fake-apis.js. Nothing real is touched.
   From tools/socials-firebase:
     node functions/test/fake-apis.js &
     firebase emulators:start --only auth,functions,firestore,storage
     node functions/test/e2e.js */
const assert = require('assert/strict');

const PROJECT = 'tappstudio-socials', BUCKET = 'tappstudio-socials.firebasestorage.app', BOARD = 'testboard';
const AUTH = 'http://127.0.0.1:9099', FN = `http://127.0.0.1:5001/${PROJECT}/us-central1/api`, ST = 'http://127.0.0.1:9199';
const FSE = `http://127.0.0.1:8081/v1/projects/${PROJECT}/databases/(default)/documents`, FAKE = 'http://127.0.0.1:9300';

async function signIn(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestUri: 'http://localhost', returnSecureToken: true,
      postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true }))}&providerId=google.com` }),
  });
  return (await r.json()).idToken;
}
async function api(token, action, data = {}) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ data: { action, ...data } }) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message); e.code = j.error.status; throw e; }
  return j.result;
}
// Multipart with JSON metadata, the way the web SDK uploads (the content type the rules check comes from the metadata).
async function put(token, path, bytes, type) {
  const b = 'e2e' + Date.now(), meta = JSON.stringify({ name: path, contentType: type });
  const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from(`\r\n--${b}--`)]);
  const r = await fetch(`${ST}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}&uploadType=multipart`, {
    method: 'POST', headers: { Authorization: 'Firebase ' + token, 'Content-Type': 'multipart/related; boundary=' + b, 'X-Goog-Upload-Protocol': 'multipart' }, body });
  return r.status;
}
async function exists(path) {
  const r = await fetch(`${ST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`, { headers: { Authorization: 'Bearer owner' } });
  return r.status === 200;
}
async function statusDoc(brand, id) {
  const r = await fetch(`${FSE}/boards/${BOARD}/status/${brand}__${id}`, { headers: { Authorization: 'Bearer owner' } });
  if (r.status !== 200) return null;
  const f = (await r.json()).fields;
  return { status: f.status.stringValue, posted: f.posted.stringValue };
}
const fakeCalls = async () => (await fetch(`${FAKE}/calls`)).json();
const jpeg = n => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7), Buffer.from([0xff, 0xd9])]);
const step = async (name, fn) => { process.stdout.write(`- ${name} … `); await fn(); console.log('ok'); };

(async () => {
  await fetch(`${FAKE}/reset`);
  await fetch(`http://127.0.0.1:8081/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  // seed one status the way the calendar page writes it, with a moved date that must survive
  await fetch(`${FSE}/boards/${BOARD}/status/misbaha__IG-30`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { brand: { stringValue: 'misbaha' }, id: { stringValue: 'IG-30' }, status: { stringValue: 'ready' }, posted: { stringValue: 'd=2026-11-12' } } }) });

  let tok;
  await step('signed out and strangers are refused', async () => {
    await assert.rejects(api(null, 'hello'), /not allowed/);
    await assert.rejects(api(await signIn('stranger@example.com'), 'hello'), /not allowed/);
  });
  await step('owner signs in and gets the owner claim', async () => {
    tok = await signIn('owner@example.com');
    assert.equal((await api(tok, 'hello')).owner, true);
    tok = await signIn('owner@example.com');   // fresh token carries the claim
    assert.equal((await api(tok, 'hello')).refreshToken, false);
  });
  await step('Storage rules: stranger upload refused, owner allowed, wrong type refused', async () => {
    const stranger = await signIn('stranger@example.com');
    assert.equal(await put(stranger, 'media/x/a.jpg', jpeg(10), 'image/jpeg'), 403);
    assert.equal(await put(tok, 'media/misbaha/IG-30/01.jpg', jpeg(2000), 'image/jpeg'), 200);
    assert.equal(await put(tok, 'media/misbaha/IG-30/evil.html', Buffer.from('<b>'), 'text/html'), 403);
  });
  await step('connect Instagram for misbaha and nasab, YouTube channel', async () => {
    assert.equal((await api(tok, 'setInstagram', { brand: 'misbaha', token: 'IGAAfake-token-misbaha-0001' })).username, 'fake_0001');
    await api(tok, 'setInstagram', { brand: 'nasab', token: 'IGAAfake-token-nasab-0002' });
    await api(tok, 'setYouTubeClient', { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'sec', privacy: 'unlisted' });
    assert.equal((await api(tok, 'connectYouTube', { code: '4/fake' })).channel.title, 'Fake tappStudio channel');
    const a = await api(tok, 'accounts');
    assert.equal(a.ig.misbaha.username, 'fake_0001');
    assert.deepEqual(a.ig.misbaha.quota, { used: 2, total: 100 });
    assert.equal(a.yt.connected, true);
    assert.equal(JSON.stringify(a).includes('IGAAfake'), false, 'tokens must never come back to the page');
  });
  await step('Post now: single image', async () => {
    const { job } = await api(tok, 'queue', { board: BOARD, brand: 'misbaha', id: 'IG-30', platform: 'IG', kind: 'image', caption: 'One image', media: ['media/misbaha/IG-30/01.jpg'] });
    assert.equal(job.state, 'posted', job.error);
    assert.match(job.url, /instagram\.com\/p\/FAKE_/);
    const s = await statusDoc('misbaha', 'IG-30');
    assert.equal(s.status, 'posted');
    assert.match(s.posted, /^p=\d{4}-\d\d-\d\d;d=2026-11-12$/, 'posted date added, moved date kept');
    assert.equal(await exists('media/misbaha/IG-30/01.jpg'), false, 'media deleted after posting');
    const calls = await fakeCalls();
    const create = calls.find(c => c.path.endsWith('/media') && c.form.caption === 'One image');
    assert.equal(create.image.ok, true, 'Instagram could download the image');
    assert.equal(create.image.bytes, 2006);
    const story = calls.find(c => c.form.media_type === 'STORIES');
    assert.ok(story, 'Story is on by default');
    assert.equal(story.image.bytes, 2006, 'the Story is the same image');
    assert.equal(story.form.caption, undefined, 'Stories carry no caption');
    assert.equal(job.story, true);
  });
  await step('Story switch: refused for an unconnected brand, saved for a connected one', async () => {
    await assert.rejects(api(tok, 'setInstagramStory', { brand: 'splitup', on: false }), /Connect this Instagram account first/);
    assert.equal((await api(tok, 'setInstagramStory', { brand: 'nasab', on: false })).story, false);
    assert.equal((await api(tok, 'accounts')).ig.nasab.story, false);
    assert.equal((await api(tok, 'accounts')).ig.misbaha.story, true);
  });
  await step('posting the same post twice is refused', async () => {
    await assert.rejects(api(tok, 'queue', { board: BOARD, brand: 'misbaha', id: 'IG-30', platform: 'IG', kind: 'image', caption: 'x', media: ['media/misbaha/IG-30/01.jpg'] }), /already posted/);
  });
  await step('Post now: 3-slide carousel (Story off for nasab, so none)', async () => {
    const storiesBefore = (await fakeCalls()).filter(c => c.form.media_type === 'STORIES').length;
    const media = [];
    for (let i = 1; i <= 3; i++) { const p = `media/nasab/IG-40/0${i}.jpg`; assert.equal(await put(tok, p, jpeg(500 + i), 'image/jpeg'), 200); media.push(p); }
    const { job } = await api(tok, 'queue', { board: BOARD, brand: 'nasab', id: 'IG-40', platform: 'IG', kind: 'carousel', caption: 'Three slides', media });
    assert.equal(job.state, 'posted', job.error);
    const calls = await fakeCalls();
    const items = calls.filter(c => c.form.is_carousel_item === 'true');
    assert.equal(items.length, 3);
    assert.ok(items.every(c => c.image.ok));
    const parent = calls.find(c => c.form.media_type === 'CAROUSEL');
    assert.equal(parent.form.children.split(',').length, 3);
    assert.equal(parent.form.caption, 'Three slides');
    assert.equal(calls.filter(c => c.form.media_type === 'STORIES').length, storiesBefore, 'no Story when switched off');
    assert.equal(job.story, false);
  });
  await step('Carousel with Story on: the Story is the first slide', async () => {
    await api(tok, 'setInstagramStory', { brand: 'nasab', on: true });
    const media = [];
    for (let i = 1; i <= 2; i++) { const p = `media/nasab/IG-43/0${i}.jpg`; await put(tok, p, jpeg(700 + i), 'image/jpeg'); media.push(p); }
    const { job } = await api(tok, 'queue', { board: BOARD, brand: 'nasab', id: 'IG-43', platform: 'IG', kind: 'carousel', caption: 'Two slides', media });
    assert.equal(job.state, 'posted', job.error);
    const story = (await fakeCalls()).filter(c => c.form.media_type === 'STORIES').pop();
    assert.equal(story.image.bytes, 707, 'first slide (701 bytes + JPEG markers)');
  });
  await step('A Story that fails never fails the post', async () => {
    await api(tok, 'setInstagram', { brand: 'kadak', token: 'IGAAfake-nostory-kadak-0003' });
    await put(tok, 'media/kadak/IG-70/01.jpg', jpeg(100), 'image/jpeg');
    const { job } = await api(tok, 'queue', { board: BOARD, brand: 'kadak', id: 'IG-70', platform: 'IG', kind: 'image', caption: 'Chai', media: ['media/kadak/IG-70/01.jpg'] });
    assert.equal(job.state, 'posted', job.error);
    assert.equal(job.story, false);
    assert.match(job.storyError, /rejected the story/);
    assert.equal((await statusDoc('kadak', 'IG-70')).status, 'posted');
  });
  await step('Schedule: reel with cover, shared MP4 with its YouTube twin, posted by tick', async () => {
    assert.equal(await put(tok, 'media/reels/misbaha-R01.mp4', Buffer.alloc(300000, 1), 'video/mp4'), 200);
    assert.equal(await put(tok, 'media/reels/misbaha-R01-cover.jpg', jpeg(800), 'image/jpeg'), 200);
    const at = Date.now() + 2 * 60000;
    let r = await api(tok, 'queue', { board: BOARD, brand: 'misbaha', id: 'IG-31', platform: 'IG', kind: 'reel', caption: 'Reel caption', media: ['media/reels/misbaha-R01.mp4'], cover: 'media/reels/misbaha-R01-cover.jpg', at });
    assert.equal(r.job.state, 'scheduled');
    assert.equal(r.job.at, at);
    assert.equal((await statusDoc('misbaha', 'IG-31')).status, 'scheduled');
    r = await api(tok, 'queue', { board: BOARD, brand: 'misbaha', id: 'YT-20', platform: 'YT', kind: 'short', caption: 'Short description', title: '33 taps (Short)', media: ['media/reels/misbaha-R01.mp4'], at });
    assert.equal(r.job.state, 'scheduled');
    assert.equal((await api(tok, '_tick')).due, 0, 'nothing due yet');
  });
  await step('Cancel a scheduled post keeps media its twin still needs', async () => {
    const cover = 'media/reels/x-cover.jpg';
    await put(tok, 'media/reels/x.mp4', Buffer.alloc(1000, 1), 'video/mp4');
    await api(tok, 'queue', { board: BOARD, brand: 'nasab', id: 'IG-41', platform: 'IG', kind: 'reel', caption: 'c', media: ['media/reels/misbaha-R01.mp4'], at: Date.now() + 3600000 });
    await api(tok, 'cancel', { board: BOARD, brand: 'nasab', id: 'IG-41' });
    assert.equal(await exists('media/reels/misbaha-R01.mp4'), true, 'still used by IG-31 and YT-20');
    assert.equal((await statusDoc('nasab', 'IG-41')).status, 'ready');
    const jobs = (await api(tok, 'jobs', { board: BOARD })).jobs;
    assert.equal(jobs.some(j => j.id === 'IG-41'), false);
    void cover;
  });
  await step('Failed post shows the reason, then Retry', async () => {
    await put(tok, 'media/nasab/IG-42/01.jpg', jpeg(100), 'image/jpeg');
    const { job } = await api(tok, 'queue', { board: BOARD, brand: 'nasab', id: 'IG-42', platform: 'IG', kind: 'image', caption: 'please FAIL', media: ['media/nasab/IG-42/01.jpg'] });
    assert.equal(job.state, 'failed');
    assert.match(job.error, /Fake Instagram rejected/);
    assert.equal(await exists('media/nasab/IG-42/01.jpg'), true, 'media kept for the retry');
    assert.equal((await statusDoc('nasab', 'IG-42')).status, 'ready');
    const again = await api(tok, 'retry', { board: BOARD, brand: 'nasab', id: 'IG-42' });
    assert.equal(again.job.state, 'failed', 'still fails: the caption still says FAIL');
  });
  await step('Brand with no Instagram account fails with a clear reason', async () => {
    await put(tok, 'media/splitup/IG-50/01.jpg', jpeg(100), 'image/jpeg');
    const { job } = await api(tok, 'queue', { board: BOARD, brand: 'splitup', id: 'IG-50', platform: 'IG', kind: 'image', caption: 'x', media: ['media/splitup/IG-50/01.jpg'] });
    assert.equal(job.state, 'failed');
    assert.match(job.error, /not connected for splitup/);
  });
  await step('Bad requests are refused', async () => {
    const base = { board: BOARD, brand: 'misbaha', id: 'IG-60', platform: 'IG', caption: 'x' };
    await assert.rejects(api(tok, 'queue', { ...base, kind: 'carousel', media: ['media/a.jpg'] }), /2 to 10/);
    await assert.rejects(api(tok, 'queue', { ...base, kind: 'image', media: ['../etc/passwd'] }), /not uploaded/);
    await assert.rejects(api(tok, 'queue', { ...base, platform: 'LI', kind: 'image', media: ['media/a.jpg'] }), /Only Instagram and YouTube/);
    await assert.rejects(api(tok, 'queue', { ...base, platform: 'YT', kind: 'reel', media: ['media/a.mp4'] }), /can't be a reel/);
  });
  await step('wait for the scheduled time, tick posts the reel and the Short', async () => {
    const jobs = (await api(tok, 'jobs', { board: BOARD })).jobs;
    const at = jobs.find(j => j.id === 'IG-31').at;
    const wait = at - Date.now() + 1500;
    process.stdout.write(`(waiting ${Math.ceil(wait / 1000)} s) `);
    await new Promise(r => setTimeout(r, Math.max(0, wait)));
    assert.equal((await api(tok, '_tick')).due, 2);
    const after = Object.fromEntries((await api(tok, 'jobs', { board: BOARD })).jobs.map(j => [j.id, j]));
    assert.equal(after['IG-31'].state, 'posted', after['IG-31'].error);
    assert.equal(after['YT-20'].state, 'posted', after['YT-20'].error);
    assert.equal(after['YT-20'].url, after['YT-20'].url.match(/^https:\/\/youtube\.com\/shorts\/yt\d+$/)[0]);
    const calls = await fakeCalls();
    const reel = calls.find(c => c.form.media_type === 'REELS');
    assert.equal(reel.video.bytes, 300000);
    assert.equal(reel.cover.ok, true);
    assert.equal(reel.form.share_to_feed, 'true');
    const reelStory = calls.filter(c => c.form.media_type === 'STORIES').pop();
    assert.equal(reelStory.video.bytes, 300000, 'the reel video goes to Story too');
    assert.equal(after['IG-31'].story, true);
    const yt = calls.find(c => c.path === '/upload/videos');
    assert.equal(yt.meta.snippet.title, '33 taps', '"(Short)" is dropped from the title');
    assert.equal(yt.meta.status.privacyStatus, 'unlisted');
    assert.equal(calls.find(c => c.path.startsWith('/upload/session/')).bytes, 300000);
    assert.equal(await exists('media/reels/misbaha-R01.mp4'), false, 'shared MP4 deleted once both are posted');
    assert.equal((await statusDoc('misbaha', 'YT-20')).status, 'posted');
    assert.equal((await api(tok, '_tick')).due, 0, 'nothing posts twice');
  });
  console.log('\nAll emulator tests passed.');
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
