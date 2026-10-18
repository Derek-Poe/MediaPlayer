# MediaPlayer

A small HTML Canvas video-player prototype with custom playback controls, an Express byte-range streaming endpoint, and resumable progress. The original experiment combined animation and media controls; this source cleanup keeps the player and removes the bundled personal video and sprite artwork.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm test
npm start
```

Open **http://127.0.0.1:7196**. The server binds to loopback. Progress uses an in-memory store by default and resets when the process exits. No database or credentials are needed to start it.

For playback, put an MP4 you are permitted to use at `media/demo.mp4`, or set `MEDIA_FILE` to its absolute path before starting. The media directory and video files are ignored by Git. The player loads **Video 1** automatically; hover over the video to show its Canvas controls. Without a configured MP4 the page still opens, and the video endpoint returns a descriptive 404. `/healthz` reports whether a file is configured.

PowerShell example:

```powershell
$env:MEDIA_FILE = 'C:\path\to\your\demo.mp4'
npm start
```

## Optional MySQL progress storage

Create an empty local database and apply `schema.sql` to it. Set **all four** environment variables `MEDIA_DB_HOST`, `MEDIA_DB_USER`, `MEDIA_DB_PASSWORD`, and `MEDIA_DB_NAME`; optionally set `MEDIA_DB_PORT` (default 3306). Use a dedicated account with access only to that database. `.env.example` documents the options; `.env` files are not automatically loaded. `PORT` defaults to 7196.

The progress adapter uses bound parameters and exact video-title matches. Unknown titles start at zero. Submitted progress must be a finite, nonnegative number. This is one shared progress record per video, not a multi-user account system.

## Implementation and checks

- `videoPlayer.html`: original Canvas control and layout experiment; optional sprite-animation classes remain dormant without the removed artwork.
- `serv.js`: app factory, fixed configured media file, full responses and single byte ranges (closed, open-ended and suffix), 416 for unsatisfiable ranges, and memory/MySQL progress adapters.
- `test/server.test.js`: real loopback HTTP checks for exact streamed bytes, HEAD, missing media, validation and progress, plus SQL parameter-binding and configuration tests. Fixtures are generated temporary bytes; no database or personal media is accessed.

This remains a local prototype: it has no authentication, per-user progress, transcoding, or production deployment configuration. The automated tests cover server contracts; full playback depends on your browser and MP4 codec. Database integration and the original animation assets are not part of those tests.

On 2026-10-18, public branch history was rewritten to exclude identified historical sensitive data. Re-clone if you have an older checkout; merging its history back can reintroduce removed data. GitHub cached views or retained references, if present, need separate cleanup; external copies are not erased.

MIT License — Derek Poe.
