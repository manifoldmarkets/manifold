import { CheckIcon, ChevronRightIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { Contract, contractPath } from 'common/contract'
import {
  EsportsEventView,
  EsportsSeries,
  OddsRow,
  StageState,
  SwissPairing,
  swissBuckets,
  TeamRef,
} from 'common/esports'
import { formatPercent, shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SportsAnswerBetDialog } from 'web/components/sports/sports-bet-panel'
import { RelatedMarketRow } from 'web/components/sports/game-related-markets'
import { EsportsMarket } from 'web/hooks/use-esports'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { TeamPlate, TitleMark } from './esports-marks'
import { SeriesCard } from './series-card'

const SHORT_STAGE: Record<string, string> = {
  Quarterfinals: 'QF',
  Semifinals: 'SF',
}

const NUMBERS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
]
// "series" is its own plural.
const count = (n: number, noun: string) =>
  `${NUMBERS[n] ?? n} ${noun}${n === 1 || noun.endsWith('series') ? '' : 's'}`

/** "Worlds 2026 · Swiss R5": where a series sits, for its card. */
export function seriesContext(view: EsportsEventView, s: EsportsSeries) {
  const pairing = view.pairings[s.answerId]
  if (pairing) return `${view.event.name} · Swiss R${pairing.round}`
  const round = view.bracket?.rounds.find((r) => r.series.includes(s))
  if (round) return `${view.event.name} · ${round.name}`
  return s.label ? `${view.event.name} · ${s.label}` : view.event.name
}

/**
 * A tournament, the way esports follows one: where it is in its stages, the
 * series still to play with what rides on each, the Swiss board or bracket,
 * and who the market thinks lifts the trophy.
 */
export function EsportsEventHero(props: {
  view: EsportsEventView
  markets: Record<string, EsportsMarket>
}) {
  const { view, markets } = props
  const { event, title, swiss, bracket, status } = view
  const advanceTo = swiss?.stage.advanceTo
  const open = view.openSeries
  const finished = status === 'finished'
  const bracketOn = !!bracket?.rounds.some((r) => r.series.length > 0)
  // Once there's a champion the band names them: final odds add nothing.
  const showOdds = view.odds.length > 0 && !(finished && view.champion)

  return (
    <section
      id={`event-${event.key}`}
      className="border-ink-200 bg-canvas-0 scroll-mt-32 overflow-hidden rounded-2xl border"
    >
      <StageBand view={view} />
      <div className="@container/event">
        <Col className="gap-4 px-3 pb-4 pt-4 sm:px-4">
          {open.length > 0 ? (
            // The round in one panel: what's at stake once, then its series.
            <Col className="border-ink-200 overflow-hidden rounded-xl border">
              <div className="bg-canvas-50 border-ink-100 border-b px-3 py-2.5 sm:px-4">
                <Headline view={view} />
              </div>
              <Col className="divide-ink-100 divide-y">
                {open.map((s) => (
                  <SeriesCard
                    key={s.answerId}
                    variant="row"
                    series={s}
                    market={markets[s.contractId]}
                    title={title}
                    context={seriesContext(view, s)}
                    pairing={view.pairings[s.answerId]}
                    advanceTo={advanceTo}
                  />
                ))}
              </Col>
            </Col>
          ) : finished ? null : (
            <Headline view={view} />
          )}

          {finished && <FinalSeries view={view} markets={markets} />}

          {/* Once the bracket has series it leads; the Swiss board is history. */}
          {bracketOn && <BracketBoard view={view} />}

          {(swiss || showOdds) && (
            <div
              className={clsx(
                'grid items-start gap-3',
                swiss && showOdds && '@[38rem]/event:grid-cols-2'
              )}
            >
              {swiss && <SwissBoard view={view} />}
              {showOdds && <TitleOdds view={view} markets={markets} />}
            </div>
          )}

          <SideMarkets view={view} markets={markets} />
          <Credit view={view} />
        </Col>
      </div>
    </section>
  )
}

// ─── The band: game, event, stages ────────────────────────────────────────────

function StageBand(props: { view: EsportsEventView }) {
  const { view } = props
  const { event, title, status, champion } = view
  return (
    <div className="relative isolate overflow-hidden bg-[#0b0f17] px-4 pb-4 pt-3 text-white sm:px-5">
      {/* The game's colour as stage light, over faint broadcast scanlines. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{ backgroundColor: title.color }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 9px)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${title.color}, transparent 70%)`,
        }}
      />
      <Row className="items-center gap-2">
        <TitleMark title={title} size="md" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
          {title.name}
        </span>
        <StatusPill status={status} color={title.color} />
      </Row>
      <h2 className="mt-2 text-3xl font-black leading-none tracking-tight [text-wrap:balance] sm:text-4xl">
        {event.name}
      </h2>
      {status === 'finished' && champion ? (
        <p className="mt-2 text-sm text-white/80">
          <span aria-hidden>🏆 </span>
          <span className="font-bold text-white">{champion}</span> are the
          champions
        </p>
      ) : (
        <StageTrack view={view} />
      )}
    </div>
  )
}

function StatusPill(props: {
  status: EsportsEventView['status']
  color: string
}) {
  const { status, color } = props
  if (status === 'in-progress')
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full"
          style={{ backgroundColor: color }}
        />
        In progress
      </span>
    )
  return (
    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
      {status === 'upcoming' ? 'Upcoming' : 'Final'}
    </span>
  )
}

type Step = { key: string; label: string; short: string; state: StageState }

function stageSteps(view: EsportsEventView): Step[] {
  return view.stages.flatMap(({ stage, state }): Step[] => {
    if (stage.kind === 'bracket') {
      const rounds = view.bracket?.rounds ?? []
      // The round being played: the first with a series still to settle or a
      // slot still to fill.
      const at =
        state === 'current'
          ? Math.max(
              0,
              rounds.findIndex(
                (r) => r.open > 0 || r.series.some((s) => s.status !== 'final')
              )
            )
          : -1
      return stage.rounds.map((name, i) => ({
        key: `${stage.key}-${i}`,
        label: name,
        short: SHORT_STAGE[name] ?? name,
        state:
          state !== 'current'
            ? state
            : i < at
            ? 'done'
            : i === at
            ? 'current'
            : 'next',
      }))
    }
    if (stage.kind === 'swiss') {
      const round = view.swiss?.standings.round ?? 0
      const label =
        state === 'current' && round > 0 ? `Swiss · Round ${round}` : 'Swiss'
      const short =
        state === 'current' && round > 0 ? `Swiss R${round}` : 'Swiss'
      return [{ key: stage.key, label, short, state }]
    }
    return [{ key: stage.key, label: stage.name, short: stage.name, state }]
  })
}

function StageTrack(props: { view: EsportsEventView }) {
  const { view } = props
  const steps = stageSteps(view)
  if (steps.length === 0) return null
  const color = view.title.color
  return (
    <ol
      aria-label="Stages"
      className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]"
    >
      {steps.map((step, i) => (
        <li key={step.key} className="flex shrink-0 items-center gap-1.5">
          {i > 0 && (
            <span
              aria-hidden
              className={clsx(
                'h-px w-3 sm:w-5',
                step.state === 'next' ? 'bg-white/20' : ''
              )}
              style={
                step.state === 'next' ? undefined : { backgroundColor: color }
              }
            />
          )}
          <span
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-1 whitespace-nowrap rounded-full text-[11px] font-bold',
              step.state === 'current'
                ? 'px-2.5 py-1 text-[#0b0f17]'
                : step.state === 'done'
                ? 'text-white/60'
                : 'text-white/40'
            )}
            style={
              step.state === 'current' ? { backgroundColor: color } : undefined
            }
          >
            {step.state === 'done' && (
              <CheckIcon className="h-3 w-3" aria-label="done" />
            )}
            <span className="sm:hidden">{step.short}</span>
            <span className="hidden sm:inline">{step.label}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

// ─── What's happening, in a line ──────────────────────────────────────────────

function Headline(props: { view: EsportsEventView }) {
  const { view } = props
  const { swiss, status, openSeries, event, odds } = view
  let text: ReactNode = null
  if (status === 'finished') {
    text = view.champion
      ? `${view.champion} won ${event.name}.`
      : `${event.name} is over.`
  } else if (status === 'upcoming') {
    const top = odds[0]
    text = !top
      ? 'Not started yet.'
      : top.isOther
      ? `Not started yet, and wide open: teams not listed add up to ${formatPercent(
          top.prob
        )}.`
      : `Not started yet. Top pick: ${top.text}, ${formatPercent(top.prob)}.`
  } else if (swiss && !swiss.standings.complete) {
    const { pending, round } = swiss.standings
    const deciders = pending.filter((p) => p.stakes === 'decider').length
    const through = swiss.standings.records.filter(
      (r) => r.status === 'through'
    ).length
    const { advanceAt, eliminateAt, advanceTo, teams } = swiss.stage
    const spots =
      Math.round((teams.length * advanceAt) / (advanceAt + eliminateAt)) -
      through
    const formats = [...new Set(pending.map((p) => p.series.bestOf))]
    const bo = formats.length === 1 && formats[0] ? `Bo${formats[0]} ` : ''
    text =
      pending.length > 0 && deciders === pending.length ? (
        <>
          <b className="text-ink-1000">
            Round {round}: {count(deciders, `${bo}decider`)}.
          </b>{' '}
          Every team here is {advanceAt - 1}–{eliminateAt - 1}: win and you're
          through to {advanceTo}, lose and you're out.
          {deciders === spots && ` These are the last ${count(spots, 'spot')}.`}
        </>
      ) : (
        <>
          <b className="text-ink-1000">Swiss round {round}.</b>{' '}
          {count(pending.length, 'series')} to play. {advanceAt} wins and you're
          through, {eliminateAt} losses and you're out.
        </>
      )
  } else if (view.bracket && openSeries.length > 0) {
    // The round being played, and the one its winners go on to.
    const rounds = view.bracket.rounds
    const at = rounds.findIndex((r) =>
      r.series.some((x) => x.status === 'open')
    )
    const round = rounds[at]
    const next = rounds[at + 1]
    const formats = [...new Set(openSeries.map((x) => x.bestOf))]
    const bo = formats.length === 1 && formats[0] ? `Bo${formats[0]} ` : ''
    text = (
      <>
        <b className="text-ink-1000">
          {round?.name ?? 'Knockouts'}:{' '}
          {count(openSeries.length, `${bo}series`)} to play.
        </b>{' '}
        {next
          ? `Win and you're in the ${next.name.toLowerCase()}; lose and you're out.`
          : 'Win it and lift the trophy.'}
      </>
    )
  } else if (openSeries.length > 0) {
    text = `${capitalize(count(openSeries.length, 'series'))} open.`
  } else {
    text = 'Waiting for the next series to be added.'
  }
  return <p className="text-ink-700 text-sm [text-wrap:pretty]">{text}</p>
}

// ─── Swiss board ──────────────────────────────────────────────────────────────

function SwissBoard(props: { view: EsportsEventView }) {
  const { view } = props
  const { standings, stage } = view.swiss!
  const buckets = swissBuckets(standings.records)
  // Teams in a series still to play, by code: the board pairs them up.
  const pendingByCode = new Map<string, EsportsSeries>()
  for (const p of standings.pending) {
    pendingByCode.set(p.series.a.code, p.series)
    pendingByCode.set(p.series.b.code, p.series)
  }
  const through = standings.records.filter((r) => r.status === 'through')
  const slots = Math.round(
    (stage.teams.length * stage.advanceAt) /
      (stage.advanceAt + stage.eliminateAt)
  )
  const deciders = standings.pending.filter(
    (p) => p.stakes === 'decider' || p.stakes === 'qualification'
  )

  return (
    <Col className="border-ink-200 min-w-0 gap-2 rounded-xl border p-3">
      <Row className="items-baseline justify-between gap-2">
        <h3 className="text-ink-900 text-xs font-black uppercase tracking-wider">
          Swiss board
        </h3>
        <span className="text-ink-500 text-[11px]">
          {stage.advanceAt} wins through · {stage.eliminateAt} losses out
        </span>
      </Row>
      <Col className="divide-ink-100 divide-y">
        {buckets.map((b) => {
          const shown = new Set<string>()
          return (
            <Row key={b.key} className="items-center gap-3 py-1.5">
              <span
                className={clsx(
                  'w-9 shrink-0 text-sm font-black tabular-nums',
                  b.status === 'through'
                    ? 'text-teal-600'
                    : b.status === 'out'
                    ? 'text-ink-400'
                    : 'text-ink-900'
                )}
              >
                {b.wins}–{b.losses}
              </span>
              <Row className="min-w-0 flex-1 flex-wrap items-center gap-1">
                {b.records.map((r) => {
                  if (shown.has(r.team.code)) return null
                  const s = pendingByCode.get(r.team.code)
                  if (s && b.status === 'alive') {
                    shown.add(s.a.code)
                    shown.add(s.b.code)
                    return (
                      <a
                        key={s.answerId}
                        href={`#series-${s.answerId}`}
                        className="border-ink-200 hover:border-ink-400 flex items-center gap-0.5 rounded-lg border border-dashed p-0.5"
                        title={`${s.a.name} vs ${s.b.name}`}
                      >
                        <TeamPlate team={s.a} size="xs" />
                        <span className="text-ink-400 px-0.5 text-[9px] font-bold">
                          v
                        </span>
                        <TeamPlate team={s.b} size="xs" />
                      </a>
                    )
                  }
                  shown.add(r.team.code)
                  return (
                    <TeamPlate
                      key={r.team.code}
                      team={r.team}
                      size="xs"
                      muted={b.status === 'out'}
                    />
                  )
                })}
              </Row>
              {b.status === 'through' && (
                <CheckIcon
                  className="h-4 w-4 shrink-0 text-teal-600"
                  aria-label="through"
                />
              )}
              {b.status === 'out' && (
                <XIcon
                  className="text-ink-400 h-4 w-4 shrink-0"
                  aria-label="out"
                />
              )}
            </Row>
          )
        })}
      </Col>
      {/* The next stage's places: who has one, and who plays for the rest. */}
      <Col className="bg-canvas-50 gap-1.5 rounded-lg p-2">
        <span className="text-ink-600 text-[11px] font-semibold">
          {capitalize(stage.advanceTo.replace(/^the /, ''))}: {through.length}{' '}
          of {slots} set
        </span>
        <Row className="flex-wrap gap-1">
          {through.map((r) => (
            <TeamPlate key={r.team.code} team={r.team} size="xs" />
          ))}
          {deciders.map((p) => (
            <span
              key={p.series.answerId}
              className="border-ink-300 text-ink-500 flex h-5 items-center rounded-md border border-dashed px-1 text-[9px] font-bold"
              title={`Winner of ${p.series.a.name} vs ${p.series.b.name}`}
            >
              {p.series.a.code}/{p.series.b.code}
            </span>
          ))}
        </Row>
      </Col>
      {standings.problems.length > 0 && (
        <p className="text-ink-500 text-[11px]">
          Some series couldn't be placed, so the board may be missing a result.
          The market has every answer.
        </p>
      )}
    </Col>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ─── Title odds ───────────────────────────────────────────────────────────────

const ODDS_SHOWN = 6

function TitleOdds(props: {
  view: EsportsEventView
  markets: Record<string, EsportsMarket>
}) {
  const { view, markets } = props
  const user = useUser()
  const [all, setAll] = useState(false)
  const [betOn, setBetOn] = useState<OddsRow>()
  const winnerId = view.event.winnerMarketId
  const finished = view.status === 'finished'
  const stakesByCode = new Map<string, SwissPairing['stakes']>()
  for (const p of Object.values(view.pairings)) {
    stakesByCode.set(p.series.a.code, p.stakes)
    stakesByCode.set(p.series.b.code, p.stakes)
  }
  // Teams still in first, then Other, then the ones that are out.
  const inRows = view.odds.filter((o) => o.standing !== 'out' && !o.isOther)
  const other = view.odds.filter((o) => o.isOther)
  const outRows = view.odds.filter((o) => o.standing === 'out')
  const rows = [
    ...(all ? inRows : inRows.slice(0, ODDS_SHOWN)),
    ...(all || inRows.length <= ODDS_SHOWN ? other : []),
  ]
  const hidden = inRows.length - Math.min(inRows.length, ODDS_SHOWN)
  const top = Math.max(...view.odds.map((o) => o.prob), 0.01)

  const onBet = (row: OddsRow) => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location: 'esports title odds' })
    setBetOn(row)
  }

  return (
    <Col className="border-ink-200 min-w-0 gap-2 rounded-xl border p-3">
      <Row className="items-baseline justify-between gap-2">
        <h3 className="text-ink-900 text-xs font-black uppercase tracking-wider">
          {finished ? 'Final title odds' : 'To win it all'}
        </h3>
        {winnerId && <MarketLink market={markets[winnerId]} label="Market" />}
      </Row>
      <Col className="gap-1">
        {rows.map((o) => (
          <button
            key={o.answerId}
            type="button"
            disabled={finished}
            onClick={() => onBet(o)}
            className="hover:bg-canvas-50 focus-visible:ring-primary-500 group flex min-h-[36px] items-center gap-2 rounded-lg px-1 text-left focus-visible:ring-2 disabled:cursor-default disabled:hover:bg-transparent"
            aria-label={`${o.text} to win, ${formatPercent(o.prob)}`}
          >
            {o.team ? (
              <TeamPlate team={o.team} size="xs" />
            ) : (
              <span className="text-ink-400 flex h-5 min-w-[2rem] items-center justify-center text-[9px] font-bold">
                —
              </span>
            )}
            <Col className="min-w-0 flex-1 gap-1">
              <Row className="min-w-0 items-center gap-1.5">
                <span className="text-ink-900 truncate text-xs font-semibold">
                  {o.team?.known ? o.team.name : o.text}
                </span>
                <StandingTag
                  standing={o.standing}
                  stakes={o.team && stakesByCode.get(o.team.code)}
                />
              </Row>
              <div className="bg-ink-100 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (o.prob / top) * 100)}%`,
                    backgroundColor: view.title.color,
                  }}
                />
              </div>
            </Col>
            <span className="text-ink-1000 group-hover:text-primary-700 w-11 shrink-0 text-right text-sm font-bold tabular-nums">
              {formatPercent(o.prob)}
            </span>
          </button>
        ))}
      </Col>
      {(hidden > 0 || outRows.length > 0) && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="text-ink-500 hover:text-primary-700 self-start text-[11px] font-semibold"
        >
          {all
            ? 'Show fewer'
            : [
                hidden > 0 ? `${hidden} more` : null,
                other.length > 0 && hidden > 0 ? 'Other' : null,
              ]
                .filter(Boolean)
                .join(' and ') || null}
          {!all && outRows.length > 0 && (
            <>
              {hidden > 0 ? ' · ' : ''}
              {outRows.length} out
            </>
          )}
        </button>
      )}
      {all && outRows.length > 0 && (
        <Row className="flex-wrap items-center gap-1">
          <span className="text-ink-500 mr-1 text-[11px]">Out:</span>
          {outRows.map((o) => (
            <span
              key={o.answerId}
              className="text-ink-500 text-[11px] tabular-nums"
              title={`${o.text}: still priced at ${formatPercent(o.prob)}`}
            >
              {o.team?.code ?? o.text} {formatPercent(o.prob)}
            </span>
          ))}
        </Row>
      )}
      {betOn && winnerId && (
        <SportsAnswerBetDialog
          contractId={winnerId}
          answerId={betOn.answerId}
          onClose={() => setBetOn(undefined)}
        />
      )}
    </Col>
  )
}

function StandingTag(props: {
  standing: OddsRow['standing']
  /** What the team's open series is for, if it has one. */
  stakes?: SwissPairing['stakes']
}) {
  const { standing, stakes } = props
  if (standing === 'through')
    return (
      <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-teal-600">
        Through
      </span>
    )
  if (standing === 'champion')
    return (
      <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-amber-600">
        Champion
      </span>
    )
  if (standing === 'alive' && stakes)
    return (
      <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400">
        {stakes === 'decider' ? 'In a decider' : 'Playing'}
      </span>
    )
  return null
}

// ─── Bracket ──────────────────────────────────────────────────────────────────

function BracketBoard(props: { view: EsportsEventView }) {
  const { view } = props
  const rounds = view.bracket!.rounds
  return (
    <Col className="border-ink-200 min-w-0 gap-2 rounded-xl border p-3">
      <h3 className="text-ink-900 text-xs font-black uppercase tracking-wider">
        {view.bracket!.stage.name}
      </h3>
      <div className="grid grid-flow-col gap-3 overflow-x-auto">
        {rounds.map((r) => (
          <Col key={r.name} className="min-w-[8rem] gap-1.5">
            <span className="text-ink-500 text-[10px] font-bold uppercase tracking-wider">
              {r.name}
            </span>
            {r.series.map((s) => (
              <BracketMatch key={s.answerId} series={s} />
            ))}
            {Array.from({ length: r.open }, (_, i) => (
              <div
                key={i}
                className="border-ink-200 text-ink-400 flex h-[52px] items-center justify-center rounded-lg border border-dashed text-[10px]"
              >
                To be decided
              </div>
            ))}
          </Col>
        ))}
      </div>
    </Col>
  )
}

function BracketMatch(props: { series: EsportsSeries }) {
  const { series } = props
  const line = (side: 'a' | 'b', team: TeamRef) => {
    const won = series.winner === side
    const lost = !!series.winner && !won
    return (
      <Row className="items-center gap-1.5">
        <TeamPlate team={team} size="xs" muted={lost} />
        <span
          className={clsx(
            'min-w-0 flex-1 truncate text-[11px]',
            won ? 'text-ink-1000 font-bold' : 'text-ink-700'
          )}
        >
          {team.name}
        </span>
        <span className="text-ink-600 text-[11px] tabular-nums">
          {series.status === 'open'
            ? formatPercent(side === 'a' ? series.prob : 1 - series.prob)
            : won
            ? '✓'
            : ''}
        </span>
      </Row>
    )
  }
  return (
    <a
      href={`#series-${series.answerId}`}
      className="border-ink-200 hover:border-ink-400 flex flex-col gap-1 rounded-lg border p-1.5"
    >
      {line('a', series.a)}
      {line('b', series.b)}
    </a>
  )
}

// ─── Finished events: the final ───────────────────────────────────────────────

function FinalSeries(props: {
  view: EsportsEventView
  markets: Record<string, EsportsMarket>
}) {
  const { view, markets } = props
  const final = view.finalSeries
  if (!final) return null
  return (
    <SeriesCard
      series={final}
      market={markets[final.contractId]}
      title={view.title}
      context={`${view.event.name} · Grand final`}
    />
  )
}

// ─── The rest of the event's markets ──────────────────────────────────────────

function SideMarkets(props: {
  view: EsportsEventView
  markets: Record<string, EsportsMarket>
}) {
  const { view, markets } = props
  const side = (view.event.sideMarketIds ?? [])
    .map((id) => markets[id])
    .filter((m): m is EsportsMarket => !!m && !m.isResolved)
  if (side.length === 0) return null
  return (
    <Col className="border-ink-200 gap-1 rounded-xl border">
      <h3 className="text-ink-900 px-3 pb-1 pt-3 text-xs font-black uppercase tracking-wider">
        More on {view.event.name}
      </h3>
      <Col className="divide-ink-100 divide-y pb-1">
        {side.map((c) => (
          <RelatedMarketRow key={c.id} contract={c as Contract} />
        ))}
      </Col>
    </Col>
  )
}

function MarketLink(props: {
  market: EsportsMarket | undefined
  label: string
}) {
  const { market, label } = props
  if (!market) return null
  return (
    <Link
      href={contractPath(market)}
      className="text-ink-500 hover:text-primary-700 flex items-center gap-0.5 text-[11px]"
    >
      {label}
      <ChevronRightIcon className="h-3 w-3" aria-hidden />
    </Link>
  )
}

function Credit(props: { view: EsportsEventView }) {
  const { view } = props
  const { creators } = view
  return (
    <p className="text-ink-500 text-[11px] [text-wrap:pretty]">
      Community markets
      {creators.length > 0 && (
        <>
          {' '}
          by{' '}
          {creators.map((c, i) => (
            <span key={c}>
              {i > 0 && (i === creators.length - 1 ? ' and ' : ', ')}
              <Link
                href={`/${c}`}
                className="hover:text-primary-700 font-medium"
              >
                @{c}
              </Link>
            </span>
          ))}
        </>
      )}
      . Ṁ{shortFormatNumber(view.volume)} traded across them.
      {view.event.matchMarkets.length > 0 &&
        ' Each series is an answer in the matches market; a result counts here once it resolves.'}
    </p>
  )
}
