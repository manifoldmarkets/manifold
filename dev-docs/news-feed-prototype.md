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

| Piece                                              | Where                                                      |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Types and categories                               | `common/src/news-feed.ts`                                  |
| Sources: Wikipedia, GDELT, Mediastack, Google News | `backend/shared/src/news-feed/sources.ts`                  |
| Embed, merge, candidates, verify, rank             | `backend/shared/src/news-feed/pipeline.ts`                 |
| Market candidates and prompt helpers               | `backend/shared/src/news-feed/markets.ts`                  |
| Full text: TollBit; RSS and GNews (proto)          | `backend/shared/src/news-feed/articles.ts`                 |
| Pictures: Wikimedia Commons, with credits          | `backend/shared/src/news-feed/images.ts`                   |
| Claims: extract, verbatim check, match, draft      | `backend/shared/src/news-feed/claims.ts`                   |
| In-process state, disk cache, refresher            | `backend/shared/src/news-feed/state.ts`                    |
| `GET get-news-feed`, `POST refresh-news-feed`      | `backend/api/src/get-news-feed.ts`, `refresh-news-feed.ts` |
| `POST like-news-story`                             | `backend/api/src/like-news-story.ts`                       |
| `POST attach-news-market` (members)                | `backend/api/src/attach-news-market.ts`                    |
| Page                                               | `web/pages/news/index.tsx`, `web/components/news-feed/`    |
| What the page measures                             | `web/components/news-feed/news-events.ts`                  |

The feed only runs when the API starts with `NEWS_FEED_ENABLED=true`. In
production the endpoint answers `enabled: false` and the page says so.

Stories only show when they have at least one open market (the matcher's, a
claim's direct match, or one a member linked); "With markets" in the
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
- **Link a market.** "Missing a market? Link one" at the foot of the panel
  searches open markets and puts the chosen one under the related outlook
  for every reader; "Use this instead" in the create dialog does the same
  for a claim. Both call `attach-news-market`, which is for members (any
  supporter tier, `canLinkNewsMarkets`): the page shows non-members the
  membership link in place of the controls, and the server answers them
  with a 403. There is no report or suggestion form and nothing is stored
  for review.
- **Keeping the reader's place.** Filters, paging, open panels and
  published markets live in session storage. The list holds its order while
  the reader is here; arrivals wait behind a "N new stories" button. After a
  reload (a phone that discarded the tab, a same-tab click), the page
  scrolls back to the story that was at the top of the screen, using
  Manifold's iOS scroll container where there is one.

## Claims pipeline

1. **Article.** For each linked story, in the order the article sources are
   configured: one of the story's own links that TollBit will license (the
   publisher's page, priced first); else a search of each provider on the
   headline's words within two days (TollBit's licensed search, GNews in
   the prototype), each result checked against
   the story by embedding at cosine 0.75. The prototype's outlet RSS index
   and own-link page reads run only when `rss` is configured.
2. **Body.** TollBit's markdown as text; for the prototype's pages, the
   NewsArticle JSON-LD body, else the paragraphs in `<article>`, every
   fetch hop staying on the outlet's hosts over https. The body is read
   once, for the claims, and not stored.
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
`%TEMP%\manifold-news-feed-cache.json`).

### Configuration: which sources run

Three variables pick the sources. The defaults are the licensed set; the
prototype's unlicensed sources run only when named. A vendor source counts
only when its key is set. The commercial plan
(`news-feed-commercial-plan.md`) says what each costs and permits.

| Variable               | Values                                            | Default                      |
| ---------------------- | ------------------------------------------------- | ---------------------------- |
| `NEWS_SOURCES`         | `wikipedia`, `gdelt`, `mediastack`, `google-news` | `wikipedia,gdelt,mediastack` |
| `NEWS_ARTICLE_SOURCES` | `tollbit`, `gnews`, `rss`, `none`                 | `tollbit`                    |
| `NEWS_IMAGES`          | `wikimedia`, `outlets`, `none`                    | `wikimedia`                  |

Keys: `MEDIASTACK_API_KEY`; `TOLLBIT_API_KEY` with `TOLLBIT_AGENT_ID` (the
agent's registered name, `manifold-markets-dev` in dev; TollBit is off
without both); `GNEWS_API_KEY` (prototype only, never loaded in GCP). In GCP
the Mediastack and TollBit names are optional secrets
(`common/src/secrets.ts`). Knobs:
`NEWS_FEED_CONTACT` (the bot's contact address, in every User-Agent),
`MEDIASTACK_PAGES`, `MEDIASTACK_SOURCES`, `MEDIASTACK_COUNTRIES` and
`MEDIASTACK_MIN_INTERVAL_MINUTES` (space the calls; 480 makes a free key's
100 calls a month last, at one page per call; a failed call counts, and a
restart forgets the timer),
`GDELT_SCOPE=any` (drop the outlet filter from GDELT's queries),
`TOLLBIT_MAX_PRICE_USD` (0.02) and `TOLLBIT_READS_PER_DAY` (150),
`NEWS_ARTICLE_SEARCHES_PER_REFRESH` (40). The response's `config` tells the
page what ran, so it credits the right sources and hides claims when there
is no article source. The prototype's configuration is
`NEWS_SOURCES=wikipedia,google-news NEWS_ARTICLE_SOURCES=rss NEWS_IMAGES=outlets`;
give each configuration its own `NEWS_FEED_CACHE_PATH`.

## Tuning knobs

- `pipeline.ts`: `MERGE_SIMILARITY` (same story from another outlet, 0.82),
  `CANDIDATES_PER_STORY` (12), `REVERIFY_AFTER_MS` (12h), `KEEP_STORIES_MS`
  (3 days), `MAX_STORIES` (1200), `FRESHNESS_HALF_LIFE_H` (36). The verifier
  prompt is in `verifyLinks`.
- `claims.ts`: `ARTICLE_MATCH_SIMILARITY` (0.75), `CLAIMS_PER_REFRESH` (60),
  the two prompts in `extractClaims` and `matchClaims`, `CLAIMS_VERSION`.
- `sources.ts`: `OUTLET_NAMES` (the outlets the wire is drawn from),
  `GDELT_BEATS` and `GDELT_DOMAIN_GROUPS` (the eight queries),
  `MEDIASTACK_CATEGORY`.
- `get-news-feed.ts`: featured market selection in `featuredFor`.
- `common/src/news-feed.ts`: `NEWS_FEW_TRADERS` (10).

## Known limits

- Full text needs a TollBit account (key and AgentID); without one there
  are no claims. The Guardian declined a commercial key on 2026-10-30. The prototype's
  stand-in, seven outlets' public feeds and pages, found an article for
  about 15% of linked stories and runs only when `rss` is named.
- Pictures are of the story's subject (its Wikipedia article's lead
  photograph), not of the event; abstract stories get none.
- Publishing a market is simulated. The real call is `api('market', …)`
  with the draft's question, criteria and definitions as the description,
  then a link back to the claim like `attach-news-market` makes.
- Likes and the markets members link live in the feed server's memory and
  disk cache, not the database.
- Markets embedded before June 2024 still carry ada-002 vectors and will not
  match; re-embedding open markets is phase 0 of the real build.
- No websocket push yet: the page polls every minute.
