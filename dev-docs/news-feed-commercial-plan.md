# Manifold News: building it in tiers we can ship

Companion to `news-feed-prototype.md`. Written 2026-10-28 from the official
terms and pricing pages of each source (re-checked that day); prices move,
so treat the numbers as the state on that date. Updated the same evening,
when the licensed adapters were built.

## What changed on 30 and 31 October 2026

- The Guardian declined a commercial key: Manifold is a prediction market.
  Its adapter, the "Powered by The Guardian" credit and the 24-hour text
  rule are removed; `NEWS_ARTICLE_SOURCES` defaults to `tollbit`.
- A TollBit developer account exists (agent `manifold-markets-dev`). The
  key is in both projects' Secret Manager, and `common/src/secrets.ts` now
  loads `TOLLBIT_API_KEY`, `TOLLBIT_AGENT_ID` and `MEDIASTACK_API_KEY` as
  optional secrets; before this change the API never read them. TollBit
  counts as a source only with both its key and its AgentID set.
- The licence posture is in the code: at most 6 claims a story, resolvable
  ones first, excerpts of 6 to 40 words (the model is asked for 35), two
  shown and the rest behind "Show more". TollBit's standard licence covers
  one use of the text for a summary, citation or grounding: the page shows
  a few short attributed quotes beside their markets with a link to the
  passage, never the body, and the body is not stored.
- `MEDIASTACK_MIN_INTERVAL_MINUTES` spaces Mediastack calls, so a free
  (non-commercial, delayed) key on a dev box lasts the month at 480, one
  page per call; the timer is in memory, so a restart forgets it.
- First Mediastack call ever (2026-10-31, prod's key, from the dev box):
  100 items, 11 kept from 3 outlets; the outlet allowlist drops the rest
  (`MEDIASTACK_ANY_OUTLET=true` keeps them all).
- Still open: which outlets have rates (the properties endpoint lists the
  network; run it with the key in the local keys file), the exact licence
  text in the dashboard, the arbitration opt-out within 30 days of
  registering (developer terms, section 18), and `NEWS_FEED_ENABLED=true`
  in the API's container env for any GCP run.

## Status

Every tier is a configuration of one code path: `NEWS_SOURCES`,
`NEWS_ARTICLE_SOURCES`, `NEWS_IMAGES` (see the prototype doc). The server's
defaults are now the licensed set: Wikipedia and GDELT for stories, plus
Mediastack when its key is set; TollBit for article text when its key and
AgentID are set; Wikimedia Commons for pictures. The prototype's
sources (Google News RSS, outlet pages for claims, outlet thumbnails) run
only when a configuration names them.

| Piece                                        | State                                 | Needs                                                                                                  |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Wikipedia Current Events                     | built, running                        | `NEWS_FEED_CONTACT` set in production                                                                  |
| GDELT wire                                   | built; live test pending              | nothing; one request per 5 seconds, from one process                                                   |
| Mediastack wire                              | built; a key in prod's Secret Manager | `MEDIASTACK_API_KEY` (Standard plan, $24.99/mo; a free key is non-commercial and delayed, so dev only) |
| Guardian full text                           | dropped 2026-10-30                    | nothing: the Guardian declined a commercial key because Manifold is a prediction market                |
| TollBit full text                            | built; account open, unfunded         | `TOLLBIT_API_KEY` and `TOLLBIT_AGENT_ID` (Secret Manager, both projects), a prepaid balance            |
| Wikimedia Commons pictures                   | built                                 | nothing                                                                                                |
| Google News RSS, outlet pages, outlet images | prototype only                        | never in production                                                                                    |

## Why the prototype cannot ship as it is

- **Google News RSS** is personal-use only by the feed's own copyright
  notice, and `news.google.com/robots.txt` disallows `/rss`. No licensed
  channel exists.
- **The outlets whose pages the claims step reads** (BBC, Guardian,
  Al Jazeera, CNBC, CBS, NBC, Fox) all limit site and RSS use to personal,
  non-commercial purposes and bar scraping, text mining and AI use. Six name
  AI crawlers in robots.txt; CNBC also names prediction-market bots.
- **Hotlinked thumbnails** are publisher images we do not license.
- **Wikipedia** is the exception: CC BY-SA 4.0, commercial reuse allowed
  with attribution, bots welcome if they say who they are.

Headline plus link is the lowest-exposure shape (hyperlinks and very short
extracts are outside the EU press right; AP v. Meltwater makes excerpt
cards the risky part in the US).

## What the page needs from its sources

| Need                           | Used for                                                 |
| ------------------------------ | -------------------------------------------------------- |
| Headlines, links, time, outlet | every card; matching to markets by embedding             |
| Breadth and freshness          | the "Just in" wire; minutes, not hours                   |
| Body text                      | claims: verbatim excerpts, drafts, "create from a claim" |
| Images                         | thumbnails on cards                                      |

Matching and verification need only the headline. Everything on the page
except claims and pictures works from headlines.

## The tiers

### V0: Wikipedia only ($0)

`NEWS_SOURCES=wikipedia NEWS_ARTICLE_SOURCES=none NEWS_IMAGES=none`.

Measured on 2026-10-28 against the full prototype:

|                          | Prototype | V0   |
| ------------------------ | --------- | ---- |
| Stories kept (3 days)    | 570       | 30   |
| With a verified market   | 198       | 11   |
| With a market, last 24 h | 133       | 4    |
| Claims, thumbnails       | yes       | none |

Usable as "top stories", too thin as a wire: the portal records a day's
events in bullets, hours after the fact. Obligations: the CC BY-SA credit on
each card (done), a bot User-Agent with a contact (`NEWS_FEED_CONTACT`),
serial requests and caching. Wikimedia Enterprise's free tier (50,000
requests a month) is there if volume ever matters.

### V1: a headline wire ($0 with GDELT, $24.99 a month with Mediastack)

Restores the wire: hundreds of stories a day, minutes fresh, with the
publisher's headline, link and time, which is all the matcher needs. The
headline itself is still the publisher's: shown short, linked out, never
altered; the standfirst a feed carries is read by the matcher and never
shown or sent to the page.

| Source        | Depth                                    | Display on a commercial site                      | Price                                               | Notes                                       |
| ------------- | ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| GDELT DOC 2.0 | title, URL, image URL, outlet, time      | yes, cite GDELT with a link                       | free                                                | 15-minute updates; one request per 5 s      |
| Mediastack    | title, description, URL, image, category | yes, to end users                                 | $24.99/mo (10k calls), $99.99 (50k), $249.99 (250k) | simplest adapter                            |
| NewsAPI.org   | title, description, 200-char snippet     | yes on paid plans; no republishing                | $449/mo (250k req)                                  | developer plan is non-production            |
| Perigon       | metadata plus AI summaries               | summaries may be republished; body by review only | $250/mo startup (1-h delay), $1,250 real time       | the only vendor whose summaries we may show |

Built:

- **GDELT** (`sources.ts`, `fetchGdelt`). The API must be asked for
  something and refuses queries much over 400 characters, so the wire is
  drawn with four broad "beat" queries (politics and world; money and tech;
  science and the big powers; sport and culture), each over two groups of
  six outlets (`GDELT_DOMAIN_GROUPS`, all in `OUTLET_NAMES` and on the
  favicon allowlist): eight queries of about 230 characters, newest first,
  250 records each, over the time since the last refresh (six hours on a
  cold start), ten seconds apart. The API throttles an address that asks
  faster than one request per five seconds, and keeps throttling it for a
  while, so a 429 ends the round and the adapter stays away for 15 minutes,
  doubling up to two hours while it continues; one process should talk to
  GDELT, not every API instance. Titles lose the outlet suffix ("… - BBC
  News"); every story is `category: other` until the verifier names one.
  Cards carry "via GDELT" linking the project, which is the citation its
  terms ask for. Image URLs are not used.
- **Mediastack** (`fetchMediastack`). One call per refresh for the 100 newest
  English items from US and UK sources, sorted by publication (about 4,300
  calls a month at a 10-minute refresh, inside the Standard plan's 10,000),
  kept when the outlet is on the allowlist (`MEDIASTACK_ANY_OUTLET=true` to
  keep all). `MEDIASTACK_PAGES`, `MEDIASTACK_SOURCES` and
  `MEDIASTACK_COUNTRIES` pass the plan's filters through. The description
  becomes the story's private context for embedding and verification.

### V1.5: pictures from Wikimedia Commons ($0)

`NEWS_IMAGES=wikimedia` (the default). The verifier names the English
Wikipedia article on what the story is mainly about (a person, team, body
or event); the portal's bullets already link theirs. The lead picture of
that article is fetched with `pilicense=free`, so only files under a free
licence come back, together with the author and licence from Commons, which
the card shows under the picture with a link to the file page. Logos,
seals, flags, maps and diagrams are skipped: a photograph or nothing. These
are pictures of the subject, not of the event, which is what Wikipedia
itself shows; many abstract stories get none.

### V2: licensed body text for claims (price on quote, or per page)

Claims need the article. Of the two routes a company our size could take,
one is left (`articles.ts`, `claims.ts`):

- **The Guardian Open Platform** was the other: its search returns the body
  as plain text under a commercial key. Asked on 2026-10-28, the Guardian
  declined on 2026-10-30 because Manifold is a prediction market. Expect
  the same from any publisher that vets buyers one by one.
- **TollBit** (`tollbitRates`, `readTollbit`, `searchTollbit`). Publishers
  in TollBit's network set a rate per page; a one-time `ON_DEMAND_LICENSE`
  (partial use: a summary, grounding or citation of the article) is bought
  per read. The story's own links are priced first (rates are free to ask
  for); failing that, TollBit's licensed search on the headline, checked by
  embedding. Caps: `TOLLBIT_MAX_PRICE_USD` per page (default $0.02) and
  `TOLLBIT_READS_PER_DAY` (default 150), so the worst day costs $3; the
  prototype linked about 130 stories a day, and at the cent-a-page rates
  TollBit's own examples use, a month is tens of dollars. Which publishers
  participate: `GET /dev/v2/properties?readyToLicense=true` lists the
  network with its directory rates, and the rates endpoints price a URL.
  Publishers set a rate and sell to any registered developer; they can
  withdraw afterwards, so the feed copes with an outlet disappearing.

What it unlocks: excerpts, drafts and "create from a claim" for the
publishers covered; other outlets stay headline-only. Measure before paying
more: how many linked stories get a claim, and how many claims lead to a
market being created.

### V3: a wire licence (AP or Reuters; sales-led)

Full text, pictures and AI use under one contract for every story the wire
carries. Both sell only through sales, with no public prices, and Reuters
markets "AI Training & RAG" explicitly. This is the "works how we want"
tier; it is worth a conversation once V1 shows the page earns its keep.

## Vendors that look like full text but do not license it

GNews (€49.99/mo, "full article content", commercial use allowed), NewsData
($199.99/mo) and Diffbot ($299/mo) return article bodies they extracted from
publishers' pages and leave the rights question with the buyer; NewsCatcher
is internal-use only; Webz.io lets end users see snippets only. None of
them is a licence to display a publisher's text. They can serve as
discovery or internal analysis, not as the source of what we show.

## What to sign up for, to see the best version

The order is cheapest and quickest first. Each key goes in the environment
of the API process (locally, `news-keys.ps1` beside the run scripts).

1. **Nothing** gives Wikipedia, the GDELT wire and Commons pictures: the
   page with hundreds of linked stories a day and no claims. Set
   `NEWS_FEED_CONTACT` to a monitored address.
2. **Mediastack, Standard plan, $24.99 a month** (mediastack.com; an
   apilayer product). Sign up, choose Standard (live news and commercial
   use start there; the free plan is non-commercial and delayed, 100 calls
   a month), copy the access key into `MEDIASTACK_API_KEY`. Gives a
   cleaner, categorised wire than GDELT with a standfirst for the matcher
   to read. Self-serve; minutes. A key went into prod's Secret Manager on
   2026-10-30; a free key belongs on a dev box only, with
   `MEDIASTACK_MIN_INTERVAL_MINUTES=480` so its 100 calls last the month
   (one page per call; a restart forgets the timer).
3. **TollBit developer account** (hack.tollbit.com): opened 2026-10-30,
   agent `manifold-markets-dev`. The AgentID is the agent's _name_ (the
   name field of a User-Agent string), not the dashboard's record id. The
   key is in both projects' Secret Manager as `TOLLBIT_API_KEY`;
   `TOLLBIT_AGENT_ID` goes beside it (`manifold-markets-dev` in dev; a prod
   agent is still to register). Fund the account under Billing; search,
   rates and properties are free calls, only a content token charges.
   Gives claims on stories whose outlets are in TollBit's network, at the
   publishers' rates within our caps.
4. **Guardian Open Platform, commercial key: declined.** Requested
   2026-10-28 with the use described in full; the Guardian said no on
   2026-10-30 because Manifold is a prediction market. TollBit's publishers
   sell to any registered developer at a posted rate and can only withdraw
   afterwards, so the feed must cope with an outlet disappearing.
5. **The real best version** is a wire licence: AP (ap.org, "AP Content
   Services") or Reuters (Reuters Connect or the Reuters News API). Ask for
   text, pictures and AI/TDM use together. No public price; sales-led; start
   the conversation when the numbers from steps 1 to 4 argue for it.

Not on the list: Perigon ($250 a month, one-hour delay, AI summaries we may
show) would be a richer wire than Mediastack, with entities for the picture
lookup; not built. Any licensed photo feed (AP Images, Reuters Pictures,
Getty) is sales-led and dear; Commons pictures are the answer until then.

## What else live needs, beyond sources

- Persistence: stories, links, likes, reader attachments and reports in
  tables rather than one process's memory and a temp file; the refresh as a
  scheduler job rather than a timer inside the API.
- `NEWS_FEED_ENABLED=true` in the API's container env: the deploy script
  passes a fixed list of variables, so it needs adding there (or the
  scheduler job above takes over).
- A takedown contact and a per-outlet off switch.
- Cached favicons rather than hotlinks to Google's undocumented service.
- The bot's contact address set in production.
- GDELT's five-second rule means one process should talk to it: the
  scheduler job, not every API instance.

## Recommendation

Launch shape is V1 with pictures: Wikipedia for the day's events, GDELT or
Mediastack for the wire, Commons pictures, headline plus link plus our
markets. Run it beside the prototype for a week and compare stories, links,
click-outs and trades from the page (the page already emits those events).
TollBit is open (the Guardian declined), so V2 runs on the subset of
stories whose outlets are in its network without a rebuild; keep AP and
Reuters for when the numbers argue for them.
