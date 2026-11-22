# Sports markets on BALLDONTLIE

Manifold stores the link between an official market and its sporting event on the contract. The integration includes a switched-off moneyline creator for the NBA, NHL, WNBA, MLB and NFL. Formula 1 already has its own BALLDONTLIE (BDL) creation and settlement jobs. The Odds API and football-data.org continue to serve their own markets.

## Event and market identity

Use `sportsEventId` to identify the provider event and `sportsMarketType` to distinguish markets on that event. `sportsLeagueKey` identifies the league. `providerOf` reads an explicit `sportsProvider` first. For an older contract it classifies the provider by prefix alone. An unrecognized prefix returns `legacy`. The table shows canonical IDs. Validate the event separately with its parser, such as `parseBdlEventId` for non-F1 BDL events or `parseFixtureEventId` for fixtures. [Provider types](../common/src/sports-provider.ts) · [Event ID helpers](../common/src/sports-ids.ts)

| Source                       | Event ID shape                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| BDL team game                | `bdl:<league>:<game-id>`                                                            |
| BDL tennis match or MMA bout | `bdl:<league>:<event-id>:<lower-entrant-id>-<higher-entrant-id>`                    |
| BDL Formula 1                | `bdl-f1:<event-id>:<session-id>` or `bdl-f1-title:<season>:<drivers\|constructors>` |
| The Odds API                 | `odds:<sport-key>:<event-id>`                                                       |
| football-data.org            | `fd-<match-id>`                                                                     |
| Local fixture                | `fixture:<league>:<fixture-id>`                                                     |

The sorted pair keeps identity stable when entrants change listing order. The US-major creator separately stores the home and away provider IDs and presents answers in away, home order. A league can have a registered ID format well before it has a market creator. [League registry](../common/src/bdl/leagues.ts) · [Major-game creator](../backend/shared/src/bdl/create-major-markets.ts)

## Rollout and creation

`NEXT_PUBLIC_SPORTS_BDL_ENABLED` must be exactly `true` on the API and scheduler and at web build time to enable the new paths. The hourly `sports-bdl-create` job is registered only when enabled. Each new BDL calendar phase defaults off. Choose one creator for a competition window. The phase-switch check rejects enabling overlapping Odds and BDL phases for the same sport. The existing production F1 jobs use their dedicated client. On dev, F1 requires the master switch and an explicitly enabled F1 phase before a provider call. [Rollout switch](../common/src/bdl/rollout.ts) · [Scheduler registration](../backend/scheduler/src/jobs/index.ts) · [Calendar](../common/src/sports-calendar.ts) · [F1 client](../backend/shared/src/balldontlie-f1-client.ts)

For each eligible major league, the creator follows four steps.

1. Read the competition phases and league settings. The scheduler requires the matching phase to be enabled. A forced run specifies a league and competition. It can select a disabled matching phase if another BDL phase for that league is enabled and the game-stage and provider-overlap checks pass. Funded creation requires a base ante, start date, eligible topic groups and all three caps. A scheduled game needs identifiable opponents and a confirmed kickoff more than five minutes away, within the league’s lookahead and on or after its configured start date.
2. Join current moneyline quotes to the event and ordered entrant IDs. The selector removes the bookmaker margin and requires a complete usable line. It checks eligible exchange quotes against available bookmaker consensus, then falls back to that consensus. Without an eligible line the game is skipped. The resulting probabilities initialize Manifold’s market. [Opening-line selection](../common/src/bdl/opening-line.ts)
3. Check for an existing official market of the same event and type. When a forced run explicitly selects an event ID, the exact-match check ignores a prior `CANCEL` for that BDL moneyline. A replacement can then post another ante if the remaining duplicate and funding checks pass. The creator also checks for an open, typed Odds moneyline with the same normalized team pair and league label within six hours. Distinct BDL game IDs let both games of a doubleheader retain separate identities. [Market deduplication](../backend/shared/src/sports-market-dedupe.ts)
4. Under the funding lock, reread the competition switches, league settings, spending and bot balance, and check for a conflicting event identity. Compare the kickoff captured at discovery with the current clock and reevaluate the previously fetched quotes at that time. A provider change that moved the kickoff earlier after discovery can therefore be missed before funding. The budget uses posted creation antes, with a UTC daily league cap, a UTC monthly wave cap and a global cap covering unresolved markets, including closed ones. A dry run reports its decisions and simulates earlier proposed spending without funding a market. [Creation settings](../backend/shared/src/bdl/major-settings.ts) · [Budget accounting](../backend/shared/src/bdl/creation-budget.ts)

## Settlement and operator review

The integrated US-major job ends at creation. Automated BDL live scoring, settlement and post-resolution correction watching for those five leagues require a separate worker. A configured polling interval or a calendar entry marked `autoResolve` does not start one. For F1, the existing resolver waits for the session classification and its two-hour steward window. Season titles use final standings. The Odds API and football-data.org keep their existing resolution paths. [F1 rules](../common/src/f1-markets.ts) · [Odds resolver](sports-odds-resolver-deadline.md) · [Football-data resolver](../backend/scheduler/src/jobs/sports-resolve.ts)

With the rollout enabled, administrators can review stored incidents and overdue eligible markets on `/admin/sports`. The queue shows the reason, its time when known and a link to review the official market for resolution or N/A. An operator reviews the evidence and acts on the market. The inventory counts unresolved public MANA moneylines from official Odds accounts that map to a competition. This includes qualifying older multi-answer CPMM markets with an Odds event ID and no market type. It separates trading moneylines from closed moneylines awaiting resolution. Spreads, totals and props are outside both counts. An unmapped league has no count. [Attention query](../backend/shared/src/bdl/attention-queries.ts) · [Operator inventory](../backend/shared/src/bdl/operator-panel-queries.ts)

## Requests and telemetry

The shared server-side client checks league authorization before each attempt and bounds retries and pagination. Local fixture mode reads recorded response shapes from disk. Keep committed fixture prices synthetic and provider credentials on the server. Public sports views show market-linked information. [BDL client](../backend/shared/src/balldontlie-client.ts) · [Fixture transport](../backend/shared/src/balldontlie-fixture.ts)

Service calls aggregate classified HTTP responses in `sports_provider_request_stats` by provider, league, endpoint template and process role. Operators can see counts for success, unauthorized, rate-limited and other responses, plus the latest status, last successful HTTP request time and reported quota. A successful HTTP response establishes transport health only. Score freshness, vendor freshness and recorder activity require separate evidence. [Request accounting](../backend/shared/src/bdl/request-stats.ts)
