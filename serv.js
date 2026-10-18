'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

class RequestValidationError extends Error {}

function parseRange(header, size) {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || size === 0 || (!match[1] && !match[2])) throw new RangeError('Unsatisfiable range');
  let start, end;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('Invalid suffix');
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
      throw new RangeError('Unsatisfiable range');
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function memoryStore() {
  const progress = new Map();
  return {
    async get(title) { return progress.get(title) ?? 0; },
    async set(title, seconds) { progress.set(title, seconds); },
  };
}

function sqlStore(pool) {
  return {
    async get(title) {
      const [rows] = await pool.execute('SELECT VideoProgress FROM videoprogress WHERE VideoTitle = ? LIMIT 1', [title]);
      return rows.length ? Number(rows[0].VideoProgress) : 0;
    },
    async set(title, seconds) {
      await pool.execute('INSERT INTO videoprogress (VideoTitle, VideoProgress) VALUES (?, ?) ON DUPLICATE KEY UPDATE VideoProgress = VALUES(VideoProgress)', [title, seconds]);
    },
  };
}

function dbOptions(env) {
  const names = ['MEDIA_DB_HOST', 'MEDIA_DB_USER', 'MEDIA_DB_PASSWORD', 'MEDIA_DB_NAME'];
  if (!names.some(name => env[name] !== undefined)) return null;
  for (const name of names) {
    if (!env[name] || !env[name].trim()) throw new Error(`Set ${name} when enabling MySQL storage.`);
  }
  const port = Number(env.MEDIA_DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MEDIA_DB_PORT must be a valid port.');
  return { host: env.MEDIA_DB_HOST, user: env.MEDIA_DB_USER, password: env.MEDIA_DB_PASSWORD,
    database: env.MEDIA_DB_NAME, port, connectionLimit: 4 };
}

function videoTitle(body) {
  const raw = body && body.videoTitle;
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 200 || /[\x00-\x1f]/.test(raw)) {
    throw new RequestValidationError('videoTitle must be a nonempty string of at most 200 characters.');
  }
  const title = raw.startsWith('/') ? raw.slice(1) : raw;
  if (!title) throw new RequestValidationError('videoTitle must identify a video.');
  return title;
}

function createApp({ store = memoryStore(), videoPath = process.env.MEDIA_FILE || path.join(__dirname, 'media', 'demo.mp4') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  app.get('/videoPlayer.html', (req, res) => res.sendFile(path.join(__dirname, 'videoPlayer.html')));
  app.get('/healthz', (req, res) => res.json({ ok: true, mediaConfigured: fs.existsSync(videoPath) }));
  app.get('/testVidList', (req, res) => res.json({ Demo: { Title: 'Local demo', 'Episode Count': '1', Episodes: { e1: { title: 'Video 1', desc: 'Locally configured MP4' } } } }));
  app.get('/testvid', async (req, res, next) => {
    try {
      const stat = await fs.promises.stat(videoPath);
      if (!stat.isFile()) return res.status(404).send('No local MP4 configured.');
      let range;
      try { range = parseRange(req.headers.range, stat.size); }
      catch (error) { return res.status(416).set('Content-Range', `bytes */${stat.size}`).end(); }
      res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' });
      if (range) {
        res.status(206).set({ 'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`, 'Content-Length': String(range.end - range.start + 1) });
      } else {
        res.status(200).set('Content-Length', String(stat.size));
      }
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(videoPath, range || {});
      stream.on('error', next);
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).send('No local MP4 configured. Set MEDIA_FILE before playback.');
      next(error);
    }
  });
  app.put('/progressSubmit', async (req, res, next) => {
    try {
      const title = videoTitle(req.body);
      const seconds = req.body.videoProgress;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new RequestValidationError('videoProgress must be a finite nonnegative number.');
      await store.set(title, seconds);
      res.sendStatus(200);
    } catch (error) { next(error); }
  });
  app.put('/progressGet', async (req, res, next) => {
    try { res.type('text/plain').send(String(await store.get(videoTitle(req.body)))); }
    catch (error) { next(error); }
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof RequestValidationError) return res.status(400).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    res.status(500).json({ error: 'Request could not be completed.' });
  });
  return app;
}

if (require.main === module) {
  const options = dbOptions(process.env);
  const store = options ? sqlStore(require('mysql2/promise').createPool(options)) : memoryStore();
  const port = Number(process.env.PORT || 7196);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port.');
  createApp({ store }).listen(port, '127.0.0.1', () => console.log(`Local media demo: http://127.0.0.1:${port}`));
}

module.exports = { createApp, parseRange, memoryStore, sqlStore, dbOptions };
