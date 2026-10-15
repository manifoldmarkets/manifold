# News feed prototype

Branch `feat/news-feed-prototype`. A `/news` page that shows the wire with
the open markets each story bears on. Companion to the proposal in Notion
("Manifold News: story-first news feed with markets", Oct 2026).

## What it does

Every ten minutes the API process gathers stories, embeds them with the
contracts' embedding model, pulls the nearest open markets out of
`contract_embeddings`, asks Gemini Flash which of those the story actually
bears on, and serves the result from memory. Nothing is written to the
database; the build is cached on disk so a restart serves the last feed at
once.

| Piece                                              | Where                                                      |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Types and categories                               | `common/src/news-feed.ts`                                  |
| Sources: Wikipedia Current Events, Google News RSS | `backend/shared/src/news-feed/sources.ts`                  |
| Embed, merge, candidates, verify, rank             | `backend/shared/src/news-feed/pipeline.ts`                 |
| In-process state, disk cache, refresher            | `backend/shared/src/news-feed/state.ts`                    |
| `GET /get-news-feed`, `POST /refresh-news-feed`    | `backend/api/src/get-news-feed.ts`, `refresh-news-feed.ts` |
| Page                                               | `web/pages/news/index.tsx`, `web/components/news-feed/`    |

The feed only runs when the API starts with `NEWS_FEED_ENABLED=true`. In
production the endpoint answers `enabled: false` and the page says so.

Stories only show when they have at least one verified market ("Unlinked
too" on the rail shows the rest). Curated dashboards stay at `/news/<slug>`
and are linked from the feed as collections.

## Running it locally against prod

Linking only works against the real market pool, so the API runs against
prod. It reads markets and embeddings; the feed writes nothing. Everything
else the API can do is live, so bets placed through the local page are real.

Build (Windows, from the worktree; `yarn compile` does not work in Git Bash):

```bash
cd backend/api && node C:/Projects/manifold/node_modules/typescript/bin/tsc -b
for p in common backend/shared backend/api; do (cd ../../$p 2>/dev/null || cd $p; node C:/Projects/manifold/node_modules/tsc-alias/dist/bin/index.js -p tsconfig.json); done
```

Run the API (PowerShell), then the web app:

```powershell
cd backend\api
$env:NEXT_PUBLIC_FIREBASE_ENV = 'PROD'
$env:GOOGLE_CLOUD_PROJECT = 'mantic-markets'
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\Projects\secretmanifoldkey\mantic-markets-5745edd3c5be.json'
$env:PORT = '8088'
$env:NEWS_FEED_ENABLED = 'true'
node lib/serve.js
```

```powershell
cd web
$env:NEXT_PUBLIC_FIREBASE_ENV = 'PROD'
$env:NEXT_PUBLIC_API_URL = 'localhost:8088'
node C:\Projects\manifold\node_modules\next\dist\bin\next dev --webpack -p 3011
```

Then open http://localhost:3011/news. The first build takes a couple of
minutes (the page polls while it runs). `POST /refresh-news-feed` (the
Refresh button, signed in) rebuilds on demand, at most once a minute.

Optional: `NEWS_FEED_CACHE_PATH` moves the disk cache (default
`%TEMP%\manifold-news-feed-cache.json`).

## Tuning knobs

All in `pipeline.ts`: `MERGE_SIMILARITY` (same story from another outlet,
0.86), `CANDIDATE_FLOOR` (0.35), `CANDIDATES_PER_STORY` (12),
`REVERIFY_AFTER_MS` (12h), `KEEP_STORIES_MS` (3 days), `MAX_STORIES` (400),
and the freshness half-life in `scoreStory` (18h). The verifier prompt is in
`verifyLinks`.

## Known limits

- Google News links are Google redirect URLs, so those stories get no
  thumbnail; Wikipedia-sourced stories do.
- Publisher RSS and Google News are fine for a prototype, not for production
  (see the licensing section of the proposal).
- Markets embedded before June 2024 still carry ada-002 vectors and will not
  match; re-embedding open markets is phase 0 of the real build.
- No websocket push yet: the page polls every minute.
