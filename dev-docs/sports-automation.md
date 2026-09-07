# Sports on Manifold: automation proposal

Companion to the `/sports` redesign (`web/pages/sports.tsx`, `backend/api/src/sports-schedule.ts`, `common/src/sports-schedule.ts`). The page shows one row per game with its related markets underneath, and a "this week" feed of everything else closing soon. This document starts with the contract a market pipeline has to meet for the page to pick its markets up, then proposes how those games and markets should get created, kept live, and resolved without anyone clicking buttons, and what the finished version could look like.

## 0. The pipeline and the page

Mockups rendered against fixture data are in `dev-docs/sports-mockups/`: `today-no-pipeline-*.jpg` is what prod shows with no game markets (the week feed carries the page), `with-pipeline-*.jpg` is the same page once the Odds API jobs have created games.

The Odds API pipeline (`backend/shared/src/odds-markets.ts`, jobs `sports-odds-create` and `sports-odds-resolve`) and the redesigned page speak through fields on the contract. There is no registry beside the contracts: the event id is on the market, so dedupe is a lookup and the resolver knows what to poll from the field alone.

### What runs

| Piece                 | Where                                | What it does                                                                                                                                                                                                               |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sports calendar       | `common/src/sports-calendar.ts`      | Which competitions to create and resolve, with date windows per phase and The Odds API sport key. Plain data in the repo; status is computed from the dates. Changing it is a one-line PR.                                 |
| `sports-odds-create`  | daily 06:00 LA                       | For every competition in an active auto-create phase: fetch the next 14 days of games, skip the ones that already have a market, create the rest as @ManifoldSports. Also on demand, with a dry run, from `/admin/sports`. |
| `sports-odds-resolve` | every 5 min                          | For every unresolved game that has started: one `/scores` call per sport, write the live score onto the market while it is on, resolve from the final. No call while nothing is in play.                                   |
| `/sports`             | `backend/api/src/sports-schedule.ts` | Reads the markets below into game rows, attaches props, lists the rest of the week by close time.                                                                                                                          |

The key: both jobs and the admin endpoint read `THE_ODDS_API_KEY` from the environment, which `loadSecretsToEnv` fills from Google Secret Manager using the list in `common/src/secrets.ts`. Create a secret with that name in the prod project (and the dev project to test there); nothing else needs configuring, and without it both jobs log a line and exit.

Quota: `/scores` with `daysFrom` costs 2 credits, so a sport in play costs about 24 credits an hour at the 5-minute cadence. MLB and the NBA in season are the expensive ones; the 20k-credit plan covers a couple of sports at once, and the cadence in `backend/scheduler/src/jobs/index.ts` is the dial.

### The market a game becomes

| Field                                                                                                 | Value                                                                                                                                                                                                                                                                                              | Read by                                                                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| creator                                                                                               | @ManifoldSports (`MANIFOLD_SPORTS_USER_IDS` in `common/src/sports.ts`)                                                                                                                                                                                                                             | the schedule query; markets from any other account are never game rows |
| shape                                                                                                 | No-draw sports: **binary**, YES is the home team, NO the away team, a tie resolves at 50%. Soccer (or `tiesAllowed` on the calendar entry): **multiple choice** with answers home, away, `Draw`, summing to one, adding disabled. `buildOddsMarketParams` in `common/src/odds-markets.ts` decides. | `toOfficialGame`, the bet dialogs                                      |
| `sportsHomeTeam`, `sportsAwayTeam`                                                                    | the team names from the provider                                                                                                                                                                                                                                                                   | binary rows, prop matching by team name                                |
| `sportsEventId`                                                                                       | `odds:<sport key>:<event id>`, identical on every market about the game                                                                                                                                                                                                                            | dedupe, the resolver, attaching props and lines to their game          |
| `sportsStartTimestamp`                                                                                | kickoff as ISO 8601 UTC                                                                                                                                                                                                                                                                            | kickoff time, day grouping, the live window                            |
| `sportsLeague`                                                                                        | the label in `SPORT_LEAGUE_LABEL` (`NFL`, `College Football`, `Soccer`)                                                                                                                                                                                                                            | which sport chip the game sits under; the old dashboards filter by it  |
| `sportsMarketType`                                                                                    | `moneyline` on the game market; `spread`, `total` or `prop` on markets attached to it                                                                                                                                                                                                              | how a related market is filed under its game                           |
| `closeTime`                                                                                           | kickoff plus a per-sport buffer (`CLOSE_BUFFER_HOURS`)                                                                                                                                                                                                                                             | the schedule window                                                    |
| topics                                                                                                | `ms-official-<competition>` plus the sport's topics from `SPORT_CATEGORIES`                                                                                                                                                                                                                        | `/browse`, topic pages, the week feed                                  |
| `sportsLiveStatus`, `sportsHomeScore`, `sportsAwayScore`, `sportsLiveMinute`, `sportsLiveUpdatedTime` | written by the resolve job: `IN_PLAY` while the provider reports a score, `FINISHED` at the final; no clock from this provider. Broadcast on `contract/{id}/sports-live`.                                                                                                                          | LIVE badge, score, "Just finished"                                     |
| resolution                                                                                            | binary: YES, NO, or MKT at 50% for a tie. Three-way: the winning answer or Draw. Postponed games stay open for an admin (they show in the needs-attention list).                                                                                                                                   | Final and winner marks                                                 |

A user-made prop with no event id still attaches to its game by team name and time window; one that carries the game's `sportsEventId` attaches exactly.

### Still by hand

- **Opening prices for three-way markets.** Binary markets open at the devigged moneyline; three-way ones open level because answers cannot be seeded at creation. A first bet from @ManifoldSports would fix that.
- **College football.** The provider returns every FBS game, sixty to eighty a week, and the pipeline has no way to keep only ranked matchups yet, so the regular-season phases have auto-create off. The playoff phase is on.
- **Competitions the provider does not cover.** F1, the Tour de France, the Champions League (not in the catalogue as of August 2026) and the NWSL have calendar entries but no sport key; they show as pending on `/admin/sports`.
- **Postponements and cancellations.** Nothing resolves N/A automatically. The needs-attention list on `/admin/sports` is where they surface.

## 1. Where we are

Before the Odds API pipeline, two separate pipelines existed, and neither covered the US leagues end to end. Both are still in the tree.

|              | football-data.org pipeline                                                                                                     | TheSportsDB pipeline                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Leagues      | Soccer only. Only `WC` is registered in `TOURNAMENT_CONFIGS`; PL and CL configs exist but are unused (`common/src/sports.ts`). | NFL, NBA, NHL, EPL (`backend/api/src/get-sports-games.ts`)                                                               |
| Create       | Scheduler job daily at 07:00, 14 days ahead, as @ManifoldSports (`backend/scheduler/src/jobs/sports-create-markets.ts`)        | Admin clicks "Create Sports Markets" on `/admin` (`web/lib/admin/create-sports-markets.ts`). Creator is whoever clicked. |
| Live scores  | Every 10 s during a match window, broadcast on `contract/{id}/sports-live`                                                     | `backend/shared/src/get-sports-live-scores.ts` exists but nothing calls it                                               |
| Resolve      | Every 15 min from the final result, posts the score as a comment                                                               | `backend/shared/src/resolve-sports-markets.ts` exists but is not scheduled; markets are resolved by hand                 |
| Market types | Winner only (3-way with Draw in group stages)                                                                                  | Winner only (Draw for EPL)                                                                                               |
| Props        | None                                                                                                                           | None                                                                                                                     |

Consequences:

- Outside a soccer tournament the schedule is whatever an admin remembered to create. On prod in September 2026 there were no official games at all, one user-made "X vs Y" game market, and about a hundred sports markets closing within two weeks, nearly all props and lines with no game to hang under. The redesigned page therefore shows those by close time and attaches props heuristically, but the source of truth is thin until a pipeline runs.
- Nothing carries a spread or a total, which are the two markets every sportsbook and both Polymarket and Kalshi list next to the moneyline.
- `sportsEventId` values come from two providers with different formats (`fd-<id>` vs a bare TheSportsDB id), so nothing can join a game to another provider's data.

## 2. Proposed flow

The shape competitors converged on: ingest an official schedule, stamp a fixed template of markets per game a few days out, poll a live feed, settle from the official final within minutes, with explicit postponement rules. Manifold can do the same in four stages that each ship on their own.

### Stage 1: one event model, provider adapters

Add a `sports_events` table and a `SportsProvider` interface. Markets hang off events instead of off provider ids.

```
sports_events
  id            text  -- 'nfl:2026-09-13:kc-buf' (stable, provider-independent)
  sport         text  -- SportKey from common/sports-schedule.ts
  league        text  -- 'NFL', 'Premier League'
  provider      text  -- 'api-sports' | 'football-data' | 'thesportsdb'
  provider_id   text
  start_time    timestamptz
  status        text  -- scheduled | live | finished | postponed | cancelled
  home / away   jsonb -- { name, shortName, badgeUrl, providerTeamId }
  home_score / away_score int
  period / clock text  -- 'Q3 4:21', "67'"
  last_polled   timestamptz
  data          jsonb -- raw provider payload
```

```ts
interface SportsProvider {
  fixtures(league: LeagueConfig, from: Date, to: Date): Promise<ProviderEvent[]>
  live(league: LeagueConfig): Promise<ProviderEvent[]> // in-play + just finished
  boxScore?(event: ProviderEvent): Promise<PlayerStats[]> // for props (stage 3)
}
```

Adapters, in the order they pay off:

| Adapter                       | Covers                                                      | Why                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `football-data` (exists)      | Soccer: EPL, UCL, WC, La Liga, Bundesliga, Serie A, Ligue 1 | Already throttled and proven; free tier is enough for schedules and finals                                                                  |
| `api-sports` (new)            | NFL, NBA, MLB, NHL, NCAAF, NCAAB, UFC, F1                   | One schema for eight sports, live scores, box scores for props, roughly $19-39 per sport per month, 100 requests a day free for prototyping |
| `thesportsdb` (exists)        | Badges, backup schedule/livescore                           | Keep for team images; $9 a month tier gives live scores as a fallback                                                                       |
| `the-odds-api` (new, stage 2) | Consensus moneyline / spread / total lines                  | Seeds the opening price and picks the spread and total numbers                                                                              |

Existing `sportsEventId` values stay valid: the migration maps `fd-<id>` and TheSportsDB ids onto `sports_events.id`.

### Stage 2: templated market creation

A `LeagueConfig` replaces today's `TournamentConfig` and the hard-coded group ids in `create-sports-markets.ts`:

```ts
{
  key: 'nfl', sport: 'nfl', provider: 'api-sports', providerLeagueId: 1,
  groupIds: [...], creatorId: MANIFOLD_SPORTS_USER_ID,
  leadDays: 7, closeOffsetMs: 4 * HOUR_MS, hasDraw: false,
  liquidityTier: 1_000, marqueeLiquidityTier: 10_000,
  markets: ['moneyline', 'spread', 'total'],
}
```

The daily create job (already exists for soccer) walks every league, upserts events, and for each event inside `leadDays` creates the missing markets from templates. Every market gets `sportsEventId`, `sportsLeague`, `sportsStartTimestamp`, and a new `sportsMarketType` (`'moneyline' | 'spread' | 'total' | 'prop'`) so the page can bucket them exactly instead of by regex.

| Template  | Question                             | Type                                                       | Resolves from          |
| --------- | ------------------------------------ | ---------------------------------------------------------- | ---------------------- |
| Moneyline | `Chiefs vs Bills (NFL)`              | Multiple choice: home, away, Draw where the sport allows   | Final result           |
| Spread    | `Chiefs -3.5 vs Bills?`              | Binary; the number is the consensus line from The Odds API | `(home - away) > line` |
| Total     | `Chiefs vs Bills: over 47.5 points?` | Binary; consensus total                                    | `home + away > line`   |

Opening price: when The Odds API returns a consensus, the create job seeds the pool so the market opens near the implied probability rather than at 50%. Without odds, fall back to 50% (today's behaviour).

Liquidity: marquee games (nationally televised, or the top N by consensus handle) get the higher tier; everything else the base tier.

### Stage 3: live feed and resolution for every league

Generalise the two soccer jobs:

- `sports-live` polls `provider.live()` per league while any of its events is within the game window, writes `status / scores / clock` to `sports_events` and to each linked contract's `sportsLiveStatus / sportsHomeScore / sportsAwayScore / sportsLiveMinute`, and broadcasts `contract/{id}/sports-live` exactly as today. The redesigned rows already render this.
- `sports-resolve` resolves every linked market when the event reaches `finished`: moneyline from the winner, spread and total from the final score, props from the box score. Confirm the final against a second source (TheSportsDB livescore, or ESPN's public scoreboard as a tie-break only) before resolving; if the sources disagree, mark the event `needs_attention` and leave it for an admin.
- Postponed: extend `closeTime` and keep the market open if the new date is within 48 hours (Kalshi's rule). Cancelled or postponed longer than that: resolve N/A, which is what the soccer pipeline does today and lets the fixture regenerate later.
- The @ManifoldSports final-score comment stays; the moneyline market also gets the comment on spread/total resolution.

### Stage 4: props

Only after stages 1-3 are stable. Per-league prop templates driven by `provider.boxScore()`:

| League | Props                                                                                | Source stat                                    |
| ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| NFL    | QB 300+ passing yards, RB 100+ rushing yards, anytime TD for the top 3 skill players | `passing.yards`, `rushing.yards`, `touchdowns` |
| NBA    | Star 30+ points, 10+ rebounds, 10+ assists, team to hit 15+ threes                   | box score                                      |
| MLB    | Starting pitcher 7+ strikeouts, home run by the lineup's top 2                       | box score                                      |
| NHL    | Goal by top 2 scorers, goalie 30+ saves                                              | box score                                      |
| Soccer | Both teams to score, clean sheet, first goalscorer (multiple choice from the lineup) | match events                                   |

Create props only for marquee games (liquidity concentrates there on Kalshi and Polymarket too), as binary markets with `sportsMarketType: 'prop'`, 24-48 hours before kickoff once lineups are known.

Community props keep flowing through the page's heuristic grouping. Two small additions make that exact rather than guessed:

1. The "Create a market on this game" button on the page already prefills the question; extend `/create` to accept `sportsEventId` and stamp it on the new market so it appears under the game immediately.
2. Let market creators pick "this is about: [game]" from an event search on the create form, which sets the same field.

### Admin

Extend `/admin/sports` from tournament-only to every `LeagueConfig`: fixtures preview with dry run, per-league pause switch, the existing "needs attention" list (unresolved 3 hours after close, or provider disagreement), and a manual override to resolve or N/A an event. Alerts go to the existing sports alert channel.

### Rollout order and cost

| Step                                                                           | Work                                                                             | Monthly cost                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------- |
| Schedule the existing TheSportsDB resolver and live poller for NFL/NBA/NHL/EPL | Small; wires code that already exists into `backend/scheduler/src/jobs/index.ts` | $9 (TheSportsDB v2 for live scores) |
| Register PL and CL in `TOURNAMENT_CONFIGS`                                     | Trivial; configs exist                                                           | $0                                  |
| Stage 1 + `api-sports` adapter for NFL and NBA                                 | About a week                                                                     | $40-80                              |
| Stage 2 spread/total with The Odds API seeding                                 | About a week                                                                     | $30-60                              |
| Stage 3 for all `api-sports` leagues                                           | A few days per league after the first                                            | included above                      |
| Stage 4 props for marquee games                                                | Two weeks                                                                        | included above                      |

Sportradar (what Polymarket and Kalshi use) is the gold standard but runs to five figures a month; revisit only if a data partnership appears.

## 3. What the finished version could look like

- **Every game, every day.** During the NFL, NBA, NHL and MLB seasons plus the big soccer leagues, the schedule is full a week out with no admin involvement. Each game opens with a moneyline, a spread and a total priced off the consensus line, so early traders are not fighting a 50% start.
- **Scores on the row.** Live rows show the clock and score for every league, not just soccer; a game moves from Upcoming to Live to Just finished on its own within a poll cycle, and the moneyline, spread and total resolve within minutes of the final.
- **A hierarchy people expect.** `/sports` (all) → `/sports/nfl` (league) → `/sports/nfl/chiefs-vs-bills-2026-09-13` (game page with tabs Popular / Game lines / Props / Community, the same panel the row expands into today) → the individual market. Team pages (`/sports/teams/nfl/chiefs`) become cheap once events carry team ids.
- **Props that resolve themselves** for marquee games, with community props sitting next to them under the game because creators linked them to the event at creation time.
- **One data model** for the page, the dashboards, the admin panel and the API: `sports_events` plus `sportsMarketType` on contracts. The regex grouping in `common/src/sports-schedule.ts` stays only as the fallback for old and unlinked markets.
- **Guardrails.** Two-source confirmation before resolving, an N/A policy for cancelled games, per-league pause switches, and a needs-attention queue so a bad feed never silently mis-resolves a market.
