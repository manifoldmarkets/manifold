import {
  dateOffset,
  identifier,
  ids,
  isRow,
  LeaguePlan,
  Row,
  sample,
  timestamp,
} from './spec'

const college = ['ncaaf', 'ncaab', 'ncaaw', 'cbb']
const soccer = ['epl', 'laliga', 'seriea', 'ucl', 'bundesliga', 'ligue1', 'mls']
const intl = [
  'euroleague',
  'eurocup',
  'acb',
  'aba',
  'bsl',
  'bbl',
  'bcl',
  'bnxt',
  'gbl',
  'israel',
  'lba',
  'lkl',
  'lnb',
  'vtb',
  'cba',
]
const esports = ['cs', 'valorant', 'lol', 'dota']
const individual = ['f1', 'mma', 'atp', 'wta', 'pga', 'lpga']
const groups: Record<string, readonly string[]> = {
  'P-F1': ['ncaaf', 'f1'],
  'P-F2': ['ncaaf'],
  'P-F3': ['ncaaf'],
  'P-F4': ['ncaaf'],
  'P-F5': ['ncaaf'],
  'P-B1': ['ncaab'],
  'P-B2': ['ncaab'],
  'P-B3': ['ncaab'],
  'P-B4': ['ncaab'],
  'P-B5': ['ncaab'],
  'P-B6': ['ncaab'],
  'P-W1': ['ncaaw'],
  'P-C1': ['cbb'],
  'P-X1': college,
  'P-V1': individual,
  'P-M1': ['mma'],
  'P-M2': ['mma'],
  'P-M3': ['mma'],
  'P-T1': ['atp', 'wta'],
  'P-T2': ['atp', 'wta'],
  'P-T3': ['atp', 'wta'],
  'P-G1': ['pga'],
  'P-G2': ['pga'],
  'P-G3': ['pga'],
  'P-L1': ['lpga'],
  'P-US': ['nba', 'wnba', 'nfl', 'mlb', 'nhl'],
  'P-SOCCER': soccer,
  'P-INTL': intl,
  'P-ESPORTS': esports,
  'P-PLATFORM': ['cba', 'cbb', 'lpga', ...esports],
  'P-WORLD-CUP': ['fifa/worldcup'],
}
export const probeIds = Object.keys(groups)
export function probeMatchesLeague(probe: string, league: string) {
  if (probe.toLowerCase() === 'all') return true
  const [id, scoped] = probe.includes(':')
    ? probe.split(':').reverse()
    : [probe]
  if (!groups[id.toUpperCase()])
    throw new Error(
      'Unknown probe ' + probe + '; choose ' + probeIds.join(', ')
    )
  return (
    (!scoped || scoped === league) && groups[id.toUpperCase()].includes(league)
  )
}

export function addProbes(p: LeaguePlan, probe: string) {
  const experimental = (
    label: string,
    statuses: readonly number[] = [400, 404, 422]
  ) => {
    const step = p.steps.find((s) => s.label === label)
    if (!step) throw new Error('Unknown probe step ' + label)
    step.rejectedStatuses = statuses
  }
  const selected =
    probe.toLowerCase() === 'all'
      ? probeIds.filter((id) => probeMatchesLeague(id, p.league))
      : [probe.split(':').pop()!.toUpperCase()]
  for (const id of selected) {
    const title = (detail: string) => id + ' ' + detail
    const { now, season, previous, league } = p
    const when = (day: number) => dateOffset(now, day)
    const dates = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => when(start + i))
    const bowls = () =>
      p.add(
        title('prior postseason games'),
        'games',
        { start_date: previous + '-12-01', end_date: season + '-01-25' },
        true
      )
    const tournaments = () =>
      p.add(title('tournament directory'), 'tournaments', { season }, true)
    const ufc = (r: Row) =>
      isRow(r.league) &&
      /\b(ufc|ultimate fighting championship)\b/i.test(
        [r.league.name, r.league.abbreviation].join(' ')
      )
    const cards = (year: number) =>
      p.add(title('cards ' + year), 'events', { year }, true)
    const first = (r: Row[]) => ids(r).slice(0, 1)
    if (id === 'P-US') {
      const games = p.add(
        title('season lifecycle, doubleheaders and postseason weeks'),
        'games',
        { seasons: [season, previous] },
        true
      )
      for (const side of ['past', 'upcoming'] as const)
        for (const name of ['odds', 'odds/opening'])
          p.bound(
            title(side + ' vendor coverage and lead times ' + name),
            name,
            'game_ids',
            [games],
            sample(now, side, 10),
            {},
            true
          )
      if (league === 'nhl')
        p.bound(
          title('regular-season shootout play evidence'),
          'plays',
          'game_id',
          [games],
          (r) =>
            ids(
              r.filter((x) => x.postseason === false && Number(x.period) >= 5)
            ).slice(0, 5),
          {},
          true
        )
    } else if (id === 'P-F1' && league === 'f1') {
      const events = p.add(title('recent events'), 'events', { season }, true)
      const sessions = p.bound(
        title('sessions'),
        'sessions',
        'event_ids',
        [events],
        sample(now, 'past'),
        {},
        true
      )
      p.bound(
        title('validate session filter'),
        'session_results',
        'session_ids',
        [sessions],
        first,
        {},
        true
      )
      p.add(title('observed market types'), 'odds/futures', {})
    } else if (id === 'P-F1') bowls()
    else if (id === 'P-F2' || id === 'P-F5') {
      const games = bowls()
      if (id === 'P-F2')
        for (const name of ['odds', 'odds/opening'])
          p.bound(
            title(name),
            name,
            'game_ids',
            [games],
            (r) => ids(r).slice(0, 5),
            {},
            true
          )
      else {
        p.bound(
          title('game statistics'),
          'player_stats',
          'game_ids',
          [games],
          first,
          {},
          true
        )
        p.bound(
          title('opening props'),
          'odds/player_props/opening',
          'game_id',
          [games],
          first
        )
      }
    } else if (id === 'P-F3')
      p.add(
        title('future postseason slate'),
        'games',
        { start_date: season + '-12-01', end_date: season + 1 + '-01-31' },
        true
      )
    else if (id === 'P-F4') {
      const rankings = p.add(title('latest AP poll'), 'rankings', {
        season: previous,
      })
      experimental(
        p.bound(
          title('next poll week'),
          'rankings',
          'week',
          [rankings],
          (r) => {
            const weeks = r
              .map((x) => x.week)
              .filter(
                (v): v is number => typeof v === 'number' && Number.isInteger(v)
              )
            return weeks.length ? [Math.max(...weeks) + 1] : []
          },
          { season: previous }
        )
      )
    } else if (['P-B1', 'P-B2', 'P-W1'].includes(id)) {
      const bracket = p.add(
        title('bracket'),
        'bracket',
        { season: id === 'P-B2' ? season : previous },
        true
      )
      if (id !== 'P-B2')
        experimental(
          p.bound(
            title('cross-check bracket game_id'),
            'games/{id}',
            '{id}',
            [bracket],
            (r) =>
              r
                .map((x) => x.game_id)
                .filter(identifier)
                .slice(0, 5)
          ),
          [404]
        )
      if (id === 'P-W1')
        p.add(
          title('Sunday vendors'),
          'odds',
          { dates: [when(-now.getUTCDay())] },
          true
        )
    } else if (id === 'P-B3')
      p.add(
        title('live games; repeat during play for clock evidence'),
        'games',
        { dates: [when(0)] },
        true
      )
    else if (id === 'P-B4' || id === 'P-B5')
      p.add(
        title('dated odds'),
        id === 'P-B4' ? 'odds' : 'odds/opening',
        { dates: id === 'P-B4' ? dates(1, 14) : dates(-7, 7) },
        true
      )
    else if (id === 'P-B6' || id === 'P-C1') {
      const start =
        (id === 'P-B6' ? season : now.getUTCFullYear()) +
        (id === 'P-B6' ? '-03-15' : '-06-12')
      const end = start.slice(0, 4) + (id === 'P-B6' ? '-04-07' : '-06-23')
      const games = p.add(
        title('tournament postseason games'),
        'games',
        { start_date: start, end_date: end },
        true
      )
      if (id === 'P-C1')
        p.bound(
          title('CWS markets'),
          'odds',
          'game_ids',
          [games],
          ids,
          {},
          true
        )
    } else if (id === 'P-X1')
      p.add(
        title(
          'historical storm and lifecycle states; compare rescheduled IDs across snapshots'
        ),
        'games',
        { seasons: [previous - 1, previous] },
        true
      )
    else if (id === 'P-V1') {
      if (league === 'mma')
        p.bound(
          title('upcoming UFC vendors'),
          'odds',
          'event_id',
          [cards(season)],
          (r) => sample(now, 'upcoming')(r.filter(ufc))
        )
      else if (league === 'f1') p.add(title('vendors'), 'odds/futures')
      else if (league === 'pga' || league === 'lpga')
        p.bound(
          title('tournament vendors'),
          'futures',
          'tournament_ids',
          [tournaments()],
          sample(now, 'upcoming')
        )
      else p.add(title('season vendors'), 'odds', { season }, true)
    } else if (['P-M1', 'P-M2', 'P-M3'].includes(id)) {
      const sources = (id === 'P-M1' ? [previous, season] : [season]).map(cards)
      if (id === 'P-M1')
        p.bound(
          title('UFC methods, final null winners and segment times'),
          'fights',
          'event_ids',
          sources,
          (r) => ids(r.filter(ufc)),
          {},
          true
        )
      else if (id === 'P-M2')
        p.bound(
          title(
            'opponent replacements; repeat daily for 7 days in separate snapshots'
          ),
          'fights',
          'event_ids',
          sources,
          (r) => sample(now, 'upcoming')(r.filter(ufc)),
          {},
          true
        )
      else
        p.bound(
          title('prop labels'),
          'odds/markets',
          'event_id',
          sources,
          (r) => sample(now, 'upcoming')(r.filter(ufc)),
          { types: ['method_of_victory', 'distance', 'finish_round'] },
          true
        )
    } else if (id === 'P-T1' || id === 'P-T3') {
      const tours = tournaments()
      p.bound(
        title(
          id === 'P-T1'
            ? 'active draw start times and null players'
            : 'result latency; repeat with tournament --watch and compare on-court finish'
        ),
        'matches',
        'tournament_ids',
        [tours],
        (r) => {
          const active = r.filter(
            (x) =>
              timestamp(x) <= now.getTime() &&
              Date.parse(String(x.end_date)) >= Date.parse(when(0))
          )
          return active.length ? first(active) : sample(now, 'upcoming')(r)
        },
        { season },
        true
      )
    } else if (id === 'P-T2')
      p.add(
        title('historical walkovers, retirements and defaults'),
        'matches',
        { season: previous },
        true
      )
    else if (id === 'P-G1')
      p.add(
        title('tour mix and status'),
        'tournaments',
        { season, include_format: 'true' },
        true
      )
    else if (id === 'P-G2' || id === 'P-G3')
      p.bound(
        title(
          id === 'P-G2'
            ? 'field availability; repeat daily from Monday'
            : 'recent playoff and finishing positions'
        ),
        id === 'P-G2' ? 'tournament_competitors' : 'tournament_results',
        'tournament_id',
        [tournaments()],
        sample(now, id === 'P-G2' ? 'upcoming' : 'past'),
        {},
        true
      )
    else if (id === 'P-L1')
      p.bound(
        title('recent entries and playoff statuses'),
        'entries',
        'tournament_id',
        [tournaments()],
        sample(now, 'past', 10),
        {},
        true
      )
    else if (id === 'P-SOCCER') {
      p.add(
        title('fixture horizon and status pairs'),
        'matches',
        { season },
        true
      )
      const prior = p.add(
        title('prior season and knockout candidates'),
        'matches',
        { season: previous },
        true
      )
      if (['ucl', 'mls'].includes(league))
        p.bound(
          title(
            'extra-time and shootout scoring; verify against independent 90-minute results'
          ),
          'match_events',
          'match_ids',
          [prior],
          (r) =>
            ids(
              r.filter((x) =>
                /AET|PEN|extra time|penalt/i.test(
                  String(x.status) + ' ' + String(x.status_detail)
                )
              )
            ).slice(0, 3),
          {},
          true
        )
      p.add(
        title('vendor coverage and duplicate rows'),
        'odds',
        { dates: dates(0, 14) },
        true
      )
      p.add(
        title('opening lead times'),
        'odds/opening',
        { dates: dates(-30, 30) },
        true
      )
      p.add(
        title('UTC filter and REST IDs; compare with captured webhook'),
        'matches',
        { dates: [when(0)] },
        true
      )
      p.add(title('team IDs across competitions'), 'teams', { season }, true)
      if (league === 'ucl')
        experimental(
          p.add(
            title('extra documented filters vs returned dates'),
            'matches',
            { 'seasons[]': [season], start_date: when(0), end_date: when(1) },
            false,
            true
          )
        )
    } else if (id === 'P-INTL') {
      p.add(
        title('team directory'),
        'teams',
        p.has('teams', 'season') ? { season } : {},
        true
      )
      p.add(
        title('120-day tip horizon and placeholder times'),
        'games',
        { start_date: when(0), end_date: when(120) },
        true
      )
      p.add(
        title('historical games, level finals and forfeits'),
        'games',
        { seasons: [previous] },
        true
      )
      p.add(
        title('historical depth'),
        'games',
        { seasons: [previous - 1, previous - 2] },
        true
      )
      if (p.has('games', 'status'))
        for (const status of ['postponed', 'cancelled'])
          p.add(
            title(status + '; repeat after one week'),
            'games',
            { status },
            true
          )
      const week = p.add(
        title('corrections; repeat this date window after 24h and 72h'),
        'games',
        { start_date: when(-7), end_date: when(0) },
        true
      )
      const ot = p.add(
        title('OT box scores'),
        'team_stats',
        { period: 5 },
        true
      )
      const games = (r: Row[]) =>
        r
          .map((x) => x.game_id)
          .filter(identifier)
          .slice(0, 1)
      p.bound(
        title('OT scoring progression'),
        'scoring',
        'game_id',
        [ot],
        games,
        {},
        true
      )
      for (const name of [
        'team_stats',
        p.has('stats') ? 'stats' : 'player_stats',
      ])
        p.bound(title('OT ' + name), name, 'game_ids', [ot], games, {}, true)
      if (league === 'cba')
        for (const season_type of [
          'regular',
          'preseason',
          'playoffs',
          'all_star',
          'relegation',
        ])
          p.add(
            title('raw states ' + season_type),
            'games',
            { seasons: [previous], season_type },
            true
          )
      if (league === 'euroleague') {
        p.add(
          title('seven-day BDL slate for offline Odds API name comparison'),
          'games',
          { start_date: when(0), end_date: when(7) },
          true
        )
        p.bound(
          title(
            'live scoring; compare with independent game clock using repeat captures'
          ),
          'scoring',
          'game_id',
          [week],
          sample(now, 'past'),
          {},
          false
        )
      }
    } else if (id === 'P-ESPORTS') {
      const directory = p.add(
        title('tournament pagination and order'),
        'tournaments',
        {},
        true
      )
      const dual = league === 'lol' || league === 'dota'
      const upcoming = p.add(
        title('upcoming horizon and null teams'),
        'matches',
        { 'dates[]': dates(0, 14) },
        !dual,
        dual
      )
      if (dual) {
        experimental(upcoming)
        experimental(
          p.add(
            title('singular date spelling comparison'),
            'matches',
            { dates: when(0) },
            false,
            true
          )
        )
        for (const field of ['tournament_ids[]', 'tournament_id'])
          experimental(
            p.bound(
              title('test ' + field),
              'matches',
              field,
              [directory],
              first,
              {},
              false,
              true
            )
          )
      }
      const history = p.add(
        title('historical forfeits and series format'),
        'matches',
        { 'dates[]': dates(-30, 30) },
        !dual,
        dual
      )
      if (dual) experimental(history)
      p.bound(
        title(
          'forfeit and best-of-two maps; compare known forfeits independently'
        ),
        'match_maps',
        p.has('match_maps', 'match_ids') ? 'match_ids' : 'match_id',
        [history],
        (r) =>
          ids(
            r.filter(
              (x) =>
                Number(x.bo_type) === 2 ||
                /forfeit|walkover/i.test(String(x.status))
            )
          ).slice(0, 10)
      )
      p.bound(
        title('map latency; watch 2-3 events against the match clock'),
        'match_maps',
        p.has('match_maps', 'match_ids') ? 'match_ids' : 'match_id',
        [upcoming],
        (r) => ids(r).slice(0, 3)
      )
      p.bound(
        title('map corrections; repeat same inputs after 24h and 72h'),
        'match_maps',
        p.has('match_maps', 'match_ids') ? 'match_ids' : 'match_id',
        [history],
        (r) => ids(r.filter((x) => x.status_state === 'final')).slice(0, 50)
      )
      if (league === 'valorant') {
        for (const status of ['scheduled', 'live', 'completed'])
          experimental(
            p.add(title('status filter ' + status), 'matches', {
              statuses: [status],
            })
          )
        p.bound(
          title('prize placements after final'),
          'tournament_prizes',
          'tournament_id',
          [directory],
          sample(now, 'past')
        )
        p.bound(
          title('stage best-of format'),
          'tournament_stages',
          'tournament_id',
          [directory],
          sample(now, 'past')
        )
      }
    } else if (id === 'P-WORLD-CUP') {
      const matches = p.add(
        title('knockout clocks, penalties and REST IDs'),
        'matches',
        { seasons: [season] },
        true
      )
      for (const name of ['odds', 'odds/opening'])
        p.bound(
          title(name),
          name,
          'match_ids',
          [matches],
          sample(now, 'past', 10),
          {},
          true
        )
    } else if (id === 'P-PLATFORM') {
      // Passive header evidence only; never induce a rate-limit violation.
      const name =
        league === 'cba'
          ? 'player_stats'
          : league === 'cbb'
          ? 'player_batting_stats'
          : league === 'lpga'
          ? 'futures'
          : 'matches'
      p.add(title('entitlement and passive rate-limit headers'), name)
    }
  }
}
