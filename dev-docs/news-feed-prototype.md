# News feed prototype

Branch `feat/news-feed-prototype`. A `/news` page that shows the wire with
the open markets each story bears on, and the checkable claims quoted from
its article. Companion to the proposal in Notion ("Manifold News: story-first
news feed with markets", Oct 2026), which also holds the concept storyboard.

## What it does

Every ten minutes the API process gathers stories, embeds them with the
contracts' embedding model, pulls the nearest open markets out of
`contract_embeddings`, asks Gemini Flash which of those the story actually
bears on, then reads an outlet's article on the story for claims. It serves
the result from memory. Nothing is written to the database; the build is
cached on disk so a restart serves the last feed at once.

| Piece                                                | Where                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Types and categories                                 | `common/src/news-feed.ts`                                  |
| Sources: Wikipedia Current Events, Google News RSS   | `backend/shared/src/news-feed/sources.ts`                  |
| Embed, merge, candidates, verify, rank               | `backend/shared/src/news-feed/pipeline.ts`                 |
| Market candidates and prompt helpers                 | `backend/shared/src/news-feed/markets.ts`                  |
| Full text: outlet RSS index, page reader, GNews slot | `backend/shared/src/news-feed/articles.ts`                 |
| Claims: extract, verbatim check, match, draft        | `backend/shared/src/news-feed/claims.ts`                   |
| In-process state, disk cache, refresher              | `backend/shared/src/news-feed/state.ts`                    |
| `GET get-news-feed`, `POST refresh-news-feed`        | `backend/api/src/get-news-feed.ts`, `refresh-news-feed.ts` |
| `POST like-news-story`, `news-feedback`              | `backend/api/src/like-news-story.ts`, `news-feedback.ts`   |
| `POST attach-news-market`                            | `backend/api/src/attach-news-market.ts`                    |
| Page                                                 | `web/pages/news/index.tsx`, `web/components/news-feed/`    |
| What the page measures                               | `web/components/news-feed/news-events.ts`                  |

The feed only runs when the API starts with `NEWS_FEED_ENABLED=true`. In
production the endpoint answers `enabled: false` and the page says so.

Stories only show when they have at least one open market (the matcher's, a
claim's direct match, or one a reader attached); "With markets" in the
masthead switches to every story. Curated dashboards stay at `/news/<slug>`.

## The page

- **Folded card.** The article zone (headline, picture, outlet, time) opens
  the publisher in a new tab. Below it, a separate bar opens Manifold's
  context in place. The bar can carry one featured market ("Top forecast"):
  among the story's three strongest links, an established market (at least
  10 traders) weighted to trading and freshness. It sits in the bar with a
  label, never under the headline, so it does not read as a subtitle. When
  the question names no date, the bar adds its close date.
- **Related outlook.** Markets on what happens next. A caption says they
  forecast the future and do not confirm or dispute what the article
  reports. Each row shows the full question, price, traders, volume, close
  date, and "on N stories" when the same market serves several stories.
- **Claims in this article.** Short verbatim excerpts with who made the
  claim and a "Read in context" link (a text fragment that scrolls the
  article to the passage). Beside each, either the market whose resolution
  turns on exactly that claim ("Direct match"), or a suggested question and
  "+ Create market". Direct matches are boxed and labelled; related
  forecasts never sit beside a quote. Two claims show; the rest fold behind
  "Show N more". When the article has none, one line says so.
- **Early prices.** Markets with fewer than 10 traders show a muted price
  and a "Few traders" or "No trades yet" label.
- **Create from a claim.** A prefilled, editable draft: the quote and
  article as background, question, resolution criteria, definitions, close
  date, resolution timing, evidence, and where it goes ("Tests this claim
  directly" beside the quote, or "A broader or related forecast" under the
  outlook). Existing similar markets are offered with "Use this instead".
  Rewriting the question raises a warning and blocks publishing as a direct
  match until the reader confirms or moves it to the outlook. Readiness
  checks gate Publish. **Publishing is simulated**: nothing is created; the
  page shows the new market in place and keeps it for the browser session.
- **Report a match.** A small flag on every market opens a form: not about
  the story, does not test the claim, missing context, or something else,
  with an optional better market from search and a note. Reports go to the
  feed server (`news-feedback`), signed in or not.
- **Keeping the reader's place.** Filters, paging, open panels and
  published markets live in session storage. The list holds its order while
  the reader is here; arrivals wait behind a "N new stories" button. After a
  reload (a phone that discarded the tab, a same-tab click), the page
  scrolls back to the story that was at the top of the screen, using
  Manifold's iOS scroll container where there is one.

## Claims pipeline

1. **Article.** For each linked story, the story's own link when it is to
   an outlet we read (the Wikipedia portal cites outlets directly), else the
   nearest article in an index of outlet RSS feeds (BBC, Guardian, Al
   Jazeera, CNBC, CBS, NBC, Fox), matched by embedding at cosine 0.75 within
   two days. With `GNEWS_API_KEY` set, a GNews search is tried when neither
   finds one (untested without a key; paid plans return the full body).
2. **Body.** The page's NewsArticle JSON-LD body, else the paragraphs in
   `<article>`. Every fetch hop, redirects included, must stay on the
   outlet's hosts over https.
3. **Extract.** Gemini Flash (medium thinking) returns every forward-looking
   claim with its exact excerpt, speaker, role, kind, a proposition, whether
   it is resolvable on public evidence, and a draft. The model also says
   whether the article is the same story; if not, the article is rejected
   and the next best one is tried.
4. **Guards in code.** An excerpt must appear exactly once, word for word,
   in the body (quotes, dashes and spaces normalised). Drafts are kept only
   when the model says they ask the same thing as the claim (not narrower or
   broader), YES means the claim comes true, the question is about the world
   rather than the article, the close date is between 2 days and 3 years
   out, and at least one evidence source is named. A claim with neither a
   direct match nor a valid draft is dropped.
5. **Match.** Each claim's proposition is embedded; its 8 nearest open
   markets go to a second call that picks a direct match (same proposition,
   compatible threshold and deadline) and up to three similar markets for
   reuse.

Results live in the story memos (`claimsVersion` forces a re-read after a
prompt change). Up to 60 articles are read per refresh.

## Running it locally against prod

Linking only works against the real market pool, so the API runs against
prod. It reads markets and embeddings; the feed writes nothing. Everything
else the API can do is live, so bets placed through the local page are real.

Credentials are Application Default Credentials for the `mantic-markets`
project: `GOOGLE_APPLICATION_CREDENTIALS` pointing at a prod service-account
key is the tested path; `gcloud auth application-default login` with an
account that can read the project's secrets may also work. Never commit or
paste a key.

### On a normal checkout (macOS, Linux, or Windows)

```bash
git fetch origin && git checkout feat/news-feed-prototype
yarn install --frozen-lockfile
yarn --cwd backend/api compile   # Windows/Git Bash: see the worktree recipe below
```

API, then the web app, in two shells (PowerShell: set the same variables
with `$env:NAME = 'value'`):

```bash
cd backend/api
NEXT_PUBLIC_FIREBASE_ENV=PROD GOOGLE_CLOUD_PROJECT=mantic-markets \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-key.json \
PORT=8088 NEWS_FEED_ENABLED=true node lib/serve.js
```

```bash
cd web
NEXT_PUBLIC_FIREBASE_ENV=PROD NEXT_PUBLIC_API_URL=localhost:8088 \
npx next dev --webpack -p 3011
```

The API is ready when `curl localhost:8088/get-news-feed?limit=1` answers
with `"enabled":true`; `"refreshing":false` with a non-zero `total` means
the first build has landed (about five minutes from a cold start, two to
three when the disk cache is under a day old).

### In the nested worktree on the build machine

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
$env:GOOGLE_APPLICATION_CREDENTIALS = '<path to a prod service-account key .json>'
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

Then open http://localhost:3011/news. The first build takes a few minutes
(the page polls while it runs); claims for the first 60 linked stories with
an article follow in the same build. `POST /refresh-news-feed` (the Refresh
button, signed in) rebuilds on demand, at most once a minute.

Optional: `NEWS_FEED_CACHE_PATH` moves the disk cache (default
`%TEMP%\manifold-news-feed-cache.json`); `GNEWS_API_KEY` turns on the GNews
provider.

## Tuning knobs

- `pipeline.ts`: `MERGE_SIMILARITY` (same story from another outlet, 0.82),
  `CANDIDATES_PER_STORY` (12), `REVERIFY_AFTER_MS` (12h), `KEEP_STORIES_MS`
  (3 days), `MAX_STORIES` (1200), `FRESHNESS_HALF_LIFE_H` (36). The verifier
  prompt is in `verifyLinks`.
- `claims.ts`: `ARTICLE_MATCH_SIMILARITY` (0.75), `CLAIMS_PER_REFRESH` (60),
  the two prompts in `extractClaims` and `matchClaims`, `CLAIMS_VERSION`.
- `get-news-feed.ts`: featured market selection in `featuredFor`.
- `common/src/news-feed.ts`: `NEWS_FEW_TRADERS` (10).

## Known limits

- Full text comes from seven outlets' public feeds and pages, a stand-in for
  a licensed provider: about 15% of linked stories find an article. Google
  News links are encrypted redirects, so Google-only stories have no article
  and no picture.
- Publishing a market is simulated. The real call is `api('market', …)`
  with the draft's question, criteria and definitions as the description,
  then a link back to the claim like `attach-news-market` makes.
- Likes, reader attachments and reports live in the feed server's memory
  and disk cache, not the database.
- Markets embedded before June 2024 still carry ada-002 vectors and will not
  match; re-embedding open markets is phase 0 of the real build.
- No websocket push yet: the page polls every minute.
