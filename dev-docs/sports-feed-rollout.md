# Sports feed rollout

The calendar registers 88 additional score-supported Odds API keys. All additions start off: 23 can be enabled after a fixture dry run, and 65 are locked pending settlement validation. The catalog records priority, bookmaker region and lock reason in `common/src/sports-feeds.ts`. Entries cover an operational year, not asserted season dates; review them annually.

Enable major existing feeds first: NHL, MLB, the additional major European soccer leagues, UCL league phase, NCAAF and NCAAB. The added WNCAAB and Europa League league phase feeds are priority 1. Follow with priority 2 eligible feeds, then demand-led priority 3. Do not bypass soccer knockout, tennis or handball locks. Locks prevent market creation; `autoResolve` is descriptive calendar metadata, not a runtime resolver switch. Scores coverage does not establish regulation-time, retirement or walkover settlement rules.

Europa League's league-phase window ends 28 January 2027; Conference League's ends 17 December 2026. These windows must not be extended into knockout rounds without additional settlement support. Sources: [Europa League](https://www.uefa.com/uefaeuropaleague/news/02a8-2174cafa5bb6-82bbc20c9b92-1000--2026-27-europa-league-all-the-league-phase-fixtures/), [Conference League](https://es.uefa.com/uefaconferenceleague/news/02a8-217720797b12-efe7d3aa394c-1000--conference-league-2026-27-calendario-fechas-y-horarios-d/).

Use `/admin/sports` to preview fixtures and enable competitions. New competition IDs are `feed-<provider key>`, with phase `Feed coverage` or `League Phase` for Europa/Conference League. Review existing season windows before activation. Primeira Liga, Allsvenskan, League of Ireland, 3. Liga and Chile remain locked until provider playoff coverage is checked and safe regular-season bounds are established. MLS's broad 2027 window needs regular-season bounds or regulation-time settlement before launch. A phase explicitly switched off overrides its calendar default and overlapping enabled windows.

## Score polling

One scores call covers all games on one provider key. With adaptive mode on, games without explicit overrides use 120 seconds for one active event, 60 seconds for two or three, and 30 seconds for four or more. Count distinct events, excluding future, closed, missing and live-disabled games. Explicit sport/game settings remain authoritative; use the admin **Use default** control to clear a sport override. On dev, the default live interval is zero, so adaptive mode does not enable polling; a positive explicit sport or game override is required. Adaptive mode is off by default and uses the existing settings table without a migration.

Final-result checks remain on their separate clock. Recommend 60 seconds near expected completion, with existing overdue and failure backoff. A completed-game query also returns live scores, so it replaces an otherwise-due live request. Provider refresh is approximately 30 seconds; do not poll faster. Keep the delayed-score disclosure at every speed. `sportsScoreUpdatedTime` is the provider observation time; `sportsLiveUpdatedTime` remains receipt time for ordering messages. Invalid or absent source times stay unavailable.

## Capacity

Live credits per month are approximately `30 × sum(active league-hours/day × 3600 / intervalSeconds)`. At 80 active league-hours/day, one-minute live polling costs 144,000 credits/month before finals and discovery. Concurrent games on the same key do not multiply that cost. A completed-game request costs 2 credits, versus 1 live-only; count the combined request once. Use one bookmaker region per creation feed. [Provider documentation](https://the-odds-api.com/liveapi/guides/v4/).

As of 22 October 2026, 100K credits cost $59 USD/month and 5M cost $119. The latter is recommended for broad coverage; upgrade before enabling frequent polling across many leagues. All plans cover the available sports. [Pricing](https://the-odds-api.com/), [coverage](https://the-odds-api.com/sports-odds-data/sports-apis.html).

Creation remains capped at 25 new markets per competition per run, with a 1,000-mana ante per market. College slates need an explicit creation-throughput and funding budget. Monitor provider quota headers, unresolved games and actual spend after a busy slate. Ledger writes are best effort and do not necessarily represent all account-wide key usage. Quota-based degradation and monthly-spend alerts are follow-up work.
