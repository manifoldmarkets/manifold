# Manifold News: building it in tiers we can ship

Companion to `news-feed-prototype.md`. Written 2026-10-28 from the official
terms and pricing pages of each source (re-checked that day); prices move,
so treat the numbers as the state on that date.

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

Each tier is a configuration of the same code: `NEWS_SOURCES`,
`NEWS_ARTICLE_SOURCES`, `NEWS_IMAGES` (see the prototype doc).

### V0: Wikipedia only (built; $0)

`NEWS_SOURCES=wikipedia NEWS_ARTICLE_SOURCES=none NEWS_IMAGES=none`.

Measured on 2026-10-28 against the full prototype:

|                          | Prototype | V0   |
| ------------------------ | --------- | ---- |
| Stories kept (3 days)    | 570       | 30   |
| With a verified market   | 198       | 11   |
| With a market, last 24 h | 133       | 4    |
| Claims, thumbnails       | yes       | none |

What it gives: "Top stories today" with mini-features, a short "Just in"
list, categories, likes, create-from-story. What it lacks: breadth and
speed (the portal records a day's events in bullets, hours after the fact),
pictures, claims. Obligations: the CC BY-SA credit on each card (done), a
bot User-Agent with a contact (`NEWS_FEED_CONTACT`), serial requests and
caching. Wikimedia Enterprise's free tier (50,000 requests a month) is
there if volume ever matters.

### V1: V0 plus a licensed headline feed (~$0 to $250 a month)

Restores the wire: hundreds of stories a day, minutes fresh, with the
publisher's headline, link and time, which is all the matcher needs.

| Source        | Depth                                    | Display on a commercial site                      | Price                                               | Notes                                       |
| ------------- | ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| GDELT DOC 2.0 | title, URL, image URL, outlet, time      | yes, cite GDELT with a link                       | free                                                | 15-minute updates; query-based API, no body |
| Mediastack    | title, description, URL, image, category | yes, to end users                                 | $24.99/mo (10k calls), $99.99 (50k), $249.99 (250k) | simplest adapter                            |
| NewsAPI.org   | title, description, 200-char snippet     | yes on paid plans; no republishing                | $449/mo (250k req)                                  | developer plan is non-production            |
| Perigon       | metadata plus AI summaries               | summaries may be republished; body by review only | $250/mo startup (1-h delay), $1,250 real time       | the only vendor whose summaries we may show |

The headline itself is still the publisher's; display it short, link out,
never alter it. Engineering: one adapter in `sources.ts` per vendor (the
`RawStory` shape already fits), a category map, and the same dedupe,
embedding and verification as today. Pick Mediastack to start (cheapest
commercial tier, a day's work); GDELT if we want $0 and can live with a
query-driven API.

### V2: V1 plus licensed body text for claims (price on quote)

Claims need the article. Two routes exist for a company our size:

- **Guardian Open Platform, commercial key.** Full text; display requires a
  link to the article, a "Powered by The Guardian" logo on the page and
  refresh-or-delete within 24 hours; the free developer key bans machine
  learning and text mining, and the commercial key lists AI and TDM among
  negotiable use cases, so the extraction we do must be in the contract.
  Price "dependent on usage" (licensing@theguardian.com).
- **TollBit.** Publishers set a rate per 1,000 pages; a "Summarization
  License" covers summary, grounding or citation of one article, a "Full
  Display License" one full display. Self-serve developer account; the
  catalogue and rates are not public. The claims step reads at most 60 new
  articles per refresh and memoises them, so a few hundred licensed reads a
  day covers it.

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

## What else live needs, beyond sources

- Persistence: stories, links, likes, reader attachments and reports in
  tables rather than one process's memory and a temp file; the refresh as a
  scheduler job rather than a timer inside the API.
- A takedown contact and a per-outlet off switch.
- Cached favicons rather than hotlinks to Google's undocumented service.
- The bot's contact address set in production.

## Recommendation

Launch shape is V1: Wikipedia for the day's events, a licensed headline
feed for the wire, headline plus link plus our markets. Run V0 and V1 side
by side for a week and compare stories, links, click-outs and trades from
the page (the page already emits those events). Open the Guardian and
TollBit conversations in parallel so V2 can be tried on a subset of
stories without a rebuild; keep AP and Reuters for when the numbers argue
for them.
