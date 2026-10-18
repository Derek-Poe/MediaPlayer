'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, parseRange, memoryStore, sqlStore, dbOptions } = require('../serv');

async function withServer(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-player-test-'));
  const videoPath = path.join(directory, 'fixture.mp4');
  fs.writeFileSync(videoPath, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  const server = createApp({ videoPath, ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.unlinkSync(videoPath);
    fs.rmdirSync(directory);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function put(base, route, body) {
  return fetch(base + route, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('range parser supports closed, open, suffix and clamped ranges', () => {
  assert.equal(parseRange(undefined, 10), null);
  for (const [header, start, end] of [['bytes=2-5', 2, 5], ['bytes=7-', 7, 9], ['bytes=-3', 7, 9], ['bytes=7-99', 7, 9], ['bytes=-99', 0, 9]]) {
    assert.deepEqual(parseRange(header, 10), { start, end });
  }
  for (const header of ['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6', 'bytes=a-2', 'bytes=9007199254740992-', 'items=0-1']) {
    assert.throws(() => parseRange(header, 10), RangeError);
  }
  assert.throws(() => parseRange('bytes=0-', 0), RangeError);
});

test('HTTP serves exact full/ranged bytes and HEAD metadata', async t => {
  const base = await withServer(t);
  const full = await fetch(base + '/testvid');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-length'), '10');
  assert.deepEqual([...new Uint8Array(await full.arrayBuffer())], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const [range, expected] of [['bytes=2-5', [2, 3, 4, 5]], ['bytes=8-', [8, 9]], ['bytes=-3', [7, 8, 9]], ['bytes=8-50', [8, 9]]]) {
    const response = await fetch(base + '/testvid', { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${expected[0]}-${expected.at(-1)}/10`);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], expected);
  }
  const head = await fetch(base + '/testvid', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const invalid = await fetch(base + '/testvid', { headers: { Range: 'bytes=10-' } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), 'bytes */10');
});

test('missing configured media returns a clear 404', async t => {
  const base = await withServer(t, { videoPath: path.join(os.tmpdir(), 'media-player-missing-fixture', 'absent.mp4') });
  assert.equal((await fetch(base + '/testvid')).status, 404);
  assert.deepEqual(await (await fetch(base + '/healthz')).json(), { ok: true, mediaConfigured: false });
});

test('progress round trips and treats titles literally', async t => {
  const base = await withServer(t);
  assert.equal(await (await put(base, '/progressGet', { videoTitle: '/new' })).text(), '0');
  const title = "/example' OR 1=1 --";
  assert.equal((await put(base, '/progressSubmit', { videoTitle: title, videoProgress: 12.5 })).status, 200);
  assert.equal(await (await put(base, '/progressGet', { videoTitle: title })).text(), '12.5');
  assert.equal(await (await put(base, '/progressGet', { videoTitle: '/example' })).text(), '0');
});

test('invalid progress/title/JSON are rejected', async t => {
  const base = await withServer(t);
  for (const body of [{ videoTitle: '/testvid', videoProgress: -1 }, { videoTitle: '/testvid', videoProgress: '12' }, { videoTitle: '/', videoProgress: 0 }, { videoTitle: 'x'.repeat(201), videoProgress: 0 }, { videoTitle: 7, videoProgress: 0 }]) {
    assert.equal((await put(base, '/progressSubmit', body)).status, 400);
  }
  const response = await fetch(base + '/progressGet', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
});

test('storage failures return generic errors', async t => {
  const base = await withServer(t, { store: { async get() { throw new TypeError('private backend detail'); } } });
  const response = await put(base, '/progressGet', { videoTitle: '/testvid' });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Request could not be completed.' });
});

test('SQL adapter binds literal titles and values', async () => {
  const calls = [];
  const store = sqlStore({ async execute(query, values) { calls.push({ query, values }); return [[{ VideoProgress: 42 }]]; } });
  const title = "literal' OR 1=1 --";
  assert.equal(await store.get(title), 42);
  await store.set(title, 12);
  assert.match(calls[0].query, /WHERE VideoTitle = \?/);
  assert.deepEqual(calls[0].values, [title]);
  assert.deepEqual(calls[1].values, [title, 12]);
  for (const call of calls) assert.equal(call.query.includes(title), false);
  assert.equal(await sqlStore({ async execute() { return [[]]; } }).get('missing'), 0);
});

test('database configuration is optional but complete when enabled', () => {
  assert.equal(dbOptions({}), null);
  assert.throws(() => dbOptions({ MEDIA_DB_HOST: '127.0.0.1' }), /MEDIA_DB_USER/);
  const env = { MEDIA_DB_HOST: '127.0.0.1', MEDIA_DB_USER: 'demo', MEDIA_DB_PASSWORD: 'local-example', MEDIA_DB_NAME: 'demo' };
  assert.equal(dbOptions(env).port, 3306);
  assert.throws(() => dbOptions({ ...env, MEDIA_DB_PORT: 'invalid' }), /MEDIA_DB_PORT/);
});

test('in-memory stores are isolated', async () => {
  const first = memoryStore(), second = memoryStore();
  await first.set('testvid', 9);
  assert.equal(await first.get('testvid'), 9);
  assert.equal(await second.get('testvid'), 0);
});
