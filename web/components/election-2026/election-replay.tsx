import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { PauseIcon, PlayIcon, RefreshIcon } from '@heroicons/react/solid'
import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import ShortToggle from 'web/components/widgets/short-toggle'
import { ElectionAsOfContext } from 'web/components/usa-map/election-as-of'
import { formatOdds } from 'web/components/usa-map/election-display'
import {
  formatRewindTime,
  liveAsOf,
} from 'web/components/usa-map/election-rewind-model'
import {
  electionContracts,
  LiveElectionExplorer,
  LiveElectionContracts,
  LiveElectionMapProps,
} from 'web/components/usa-map/live-election-map'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { buildShareUrl } from 'web/lib/util/share-url'
import {
  comparisonLabel,
  COMPARISON_SOURCES,
  comparisonsAt,
  MarketStatus,
  marketStatus,
  REPLAY_COMPARISONS,
  ReplayChamber,
  resolvedBy,
} from './replay-comparisons'
import {
  chamberGap,
  contractProbs,
  defaultFrame,
  frameAtSlider,
  LATEST_MILESTONE_ID,
  milestoneShortLabel,
  partySplit,
  playbackDelay,
  replayCountdown,
  ReplayMilestone,
  ReplaySnapshot,
  withLatestFrame,
  scrubKeyFrame,
  sliderMax,
  sliderValue,
  snapshotProb,
  stageOf,
} from './replay-model'
import {
  chamberName,
  ChamberScore,
  replayChamberMarket,
  ReplayChambers,
  replayStory,
  signedPoints,
} from './replay-scorecard'

// /election2026: the midterm map replayed from a week before the polls
// closed through election night, stage by stage, from a static snapshot of
// the odds (web/scripts/election-2026-replay-snapshot.ts), beside real-money
// odds on Senate and House control. Display only: betting stays on the live
// map.
export function ElectionReplay(
  props: LiveElectionMapProps & {
    scores: ChamberScore[]
    // When the page read the markets (getStaticProps, every few minutes):
    // the replay's Latest stop.
    latestAt: number
    // Under everything, whether or not the replay loads (the leaderboards).
    footer?: ReactNode
  }
) {
  const { snapshot: loaded, error, retry } = useReplaySnapshot()
  const contracts = useMemo(() => electionContracts(props), [props])
  // The snapshot ends when it was last rebuilt; its Latest is the markets
  // as this page loaded them.
  const snapshot = useMemo(
    () =>
      loaded &&
      withLatestFrame(loaded, liveProbsById(contracts), props.latestAt),
    [loaded, contracts, props.latestAt]
  )
  // Undefined until the reader moves: the default milestone.
  const [chosenFrame, setFrame] = useState<number>()
  const frame =
    chosenFrame ?? (snapshot ? defaultFrame(snapshot.milestones) : 0)
  const [playing, setPlaying] = useState(false)
  // Where playback started, so it doesn't pause on that milestone.
  const [startFrame, setStartFrame] = useState(0)
  // Off plays straight through, for a recording.
  const [holdAtMilestones, setHoldAtMilestones] = usePersistentInMemoryState(
    true,
    'election-2026-replay-milestone-pauses'
  )
  const last = snapshot ? snapshot.times.length - 1 : 0

  useEffect(() => {
    if (!playing || !snapshot) return
    if (frame >= last) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(
      () => setFrame(frame + 1),
      playbackDelay(snapshot.milestones, frame, startFrame, holdAtMilestones)
    )
    return () => clearTimeout(timer)
  }, [playing, frame, last, snapshot, startFrame, holdAtMilestones])

  const shown = useMemo(
    () => (snapshot ? liveAsOf(contracts, snapshot, frame) : undefined),
    [contracts, snapshot, frame]
  )

  const play = () => {
    if (playing) return setPlaying(false)
    const from = frame >= last ? 0 : frame
    track('election 2026 replay', { action: 'play', frame: from })
    setFrame(from)
    setStartFrame(from)
    setPlaying(true)
  }
  const jump = (to: number) => {
    setPlaying(false)
    setFrame(to)
  }
  const chambers: ReplayChambers = {
    senate: replayChamberMarket(props.senateControlContract),
    house: replayChamberMarket(props.houseControlContract),
  }

  return (
    <Col className="@container mx-auto w-full max-w-6xl gap-4 px-3 pb-12 pt-3 sm:px-4">
      <ReplayHero scores={props.scores} />
      {snapshot && shown ? (
        <>
          <ReplayPlayer
            snapshot={snapshot}
            frame={frame}
            playing={playing}
            onPlay={play}
            onJump={jump}
            holdAtMilestones={holdAtMilestones}
            setHoldAtMilestones={setHoldAtMilestones}
            chambers={chambers}
          />
          {/* The player has the chamber odds, so no control cards here. */}
          <ElectionAsOfContext.Provider value={snapshot.times[frame]}>
            <LiveElectionExplorer live={shown} hideControls />
          </ElectionAsOfContext.Provider>
          <MilestoneTable
            snapshot={snapshot}
            frame={frame}
            onJump={(to) => {
              jump(to)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            chambers={chambers}
          />
          <ReplayMethod
            rebuiltThrough={
              loaded?.times[loaded.times.length - 1] ?? snapshot.generatedAt
            }
            latestAt={snapshot.times[snapshot.times.length - 1]}
          />
        </>
      ) : (
        <div
          className="bg-canvas-50 text-ink-600 flex h-[60vh] items-center justify-center rounded-xl text-sm"
          role={error ? 'alert' : 'status'}
        >
          {error ? (
            <span>
              Couldn’t load the replay.{' '}
              <button className="text-primary-700 underline" onClick={retry}>
                Try again
              </button>
            </span>
          ) : (
            'Loading the replay…'
          )}
        </div>
      )}
      {props.footer}
    </Col>
  )
}

// Every map market's traded odds now, by contract id.
function liveProbsById(live: LiveElectionContracts) {
  const all = [
    ...Object.values(live.senate),
    ...Object.values(live.governor),
    live.house,
    ...Object.values(live.additionalHouse),
    ...Object.values(live.measures),
    live.houseControl,
    live.senateControl,
  ]
  return Object.fromEntries(
    all.flatMap((c) => (c ? [[c.id, contractProbs(c)] as const] : []))
  )
}

function useReplaySnapshot() {
  const [snapshot, setSnapshot] = useState<ReplaySnapshot>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setError(false)
    fetch('/data/election-2026-replay.json', { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json() as Promise<ReplaySnapshot>
      })
      .then(setSnapshot)
      .catch((e) => {
        if (abort.signal.aborted) return
        console.error('Election replay unavailable', e)
        setError(true)
      })
    return () => abort.abort()
  }, [attempt])
  return { snapshot, error, retry: () => setAttempt((a) => a + 1) }
}

// The story, told only as far as the scores support it: the claims need
// Manifold closer on a resolved chamber (sawIt) and further toward the
// Democrats at every forecast milestone in both chambers.
function ReplayHero(props: { scores: ChamberScore[] }) {
  const { scores } = props
  const { sawIt, demsAheadEverywhere, winners } = replayStory(scores)
  const told = sawIt && demsAheadEverywhere
  const user = useUser()
  useSaveReferral(user)
  const referral = user?.username ? referralQuery(user.username) : undefined
  const shareUrl = buildShareUrl({
    domain: ENV_CONFIG.domain,
    pathname: '/election2026',
    search: '',
    referralQuery: referral,
  })
  return (
    <Col className="gap-1.5">
      <Row className="items-center justify-between gap-3">
        <h1 className="text-ink-1000 text-2xl font-semibold sm:text-3xl">
          {sawIt ? 'Manifold saw it coming' : 'Watch the midterms unfold'}
        </h1>
        <CopyLinkOrShareButton
          url={shareUrl}
          eventTrackingName="share election 2026 replay"
          tooltip="Share this replay"
          color="gray-outline"
          size="sm"
          className="shrink-0 gap-1.5"
        >
          Share
        </CopyLinkOrShareButton>
      </Row>
      {/* The scores sit beside the text when there's room for both. */}
      <div className="@2xl:grid-cols-[minmax(0,1fr)_18.5rem] @2xl:items-center @2xl:gap-5 grid gap-3">
        <Col className="gap-1.5">
          <p className="text-ink-700 text-sm sm:text-base">
            {told
              ? 'Before polls closed, Manifold had Democrats ahead of real-money markets, and reacted faster as the news dropped. We were more confident at every milestone we checked, and were the best source for predicting the 2026 Midterms.'
              : [
                  ...winners,
                  'Replay a week of Manifold’s odds on every Senate, governor and House race, beside the real-money markets.',
                ].join(' ')}
          </p>
          {told && (
            <p className="text-primary-700 text-sm font-semibold sm:text-base">
              Replay Election week and see for yourself.
            </p>
          )}
        </Col>
        {scores.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {sortBy(scores, (s) => (s.winner ? 0 : 1)).map((s) => (
              <ScoreCard key={s.chamber} score={s} />
            ))}
          </div>
        )}
      </div>
    </Col>
  )
}

// One chamber's forecast-window score: how far ahead of real money
// Manifold was on average, a week out to polls close.
function ScoreCard(props: { score: ChamberScore }) {
  const { chamber, winner, averagePoints } = props.score
  const good = !!winner && averagePoints > 0
  const caption = winner
    ? averagePoints > 0
      ? 'ahead of real money'
      : averagePoints < 0
      ? 'behind real money'
      : 'level with real money'
    : 'more on Democrats than real money'
  const size = Math.abs(averagePoints)
  return (
    <Col className="bg-canvas-0 border-ink-200 min-w-0 rounded-lg border px-3 py-1.5 sm:py-2">
      <div className="text-ink-600 truncate text-[11px] font-semibold uppercase tracking-wide">
        {chamberName(chamber)} control
      </div>
      <div
        className={clsx(
          'flex items-baseline gap-1 tabular-nums',
          good ? 'text-teal-700' : 'text-primary-700'
        )}
      >
        <span className="text-2xl font-bold leading-8 sm:text-3xl sm:leading-9">
          {winner ? '' : 'D '}
          {averagePoints > 0 ? '+' : averagePoints < 0 ? '−' : ''}
          {size}
        </span>
        <span className="text-sm font-semibold">
          {size === 1 ? 'pt' : 'pts'}
        </span>
      </div>
      <div className="text-ink-700 truncate text-xs">{caption}</div>
    </Col>
  )
}

// Manifold's edge over the other market at one moment: "+4 pts" closer to
// the result once the chamber resolved, "D +6 pts" before.
function EdgeBadge(props: { gap: ReturnType<typeof chamberGap> }) {
  const { gap } = props
  const good = !!gap && gap.points > 0
  return (
    <span
      className={clsx(
        'shrink-0 text-xs font-semibold tabular-nums leading-5',
        gap?.resolved && good
          ? 'text-teal-700'
          : gap && !gap.resolved
          ? 'text-primary-700'
          : 'text-ink-500'
      )}
    >
      {!gap
        ? 'Even'
        : `${gap.resolved ? '' : `${gap.party} `}${signedPoints(gap.points)}`}
    </span>
  )
}

const milestoneAt = (milestones: ReplayMilestone[], frame: number) =>
  milestones.find((m) => m.frame === frame)

const milestoneLabel = (m: ReplayMilestone) =>
  m.id === LATEST_MILESTONE_ID ? `Latest: ${formatRewindTime(m.time)}` : m.label

// Every line here has a fixed height and every comparison row is always
// drawn, so scrubbing never moves the page.
// Top to bottom: the controls on one small line (play, milestone jumps,
// milestone pauses), then the progress bar, the countdown and the odds, so
// a recording can crop the controls off and keep the rest.
function ReplayPlayer(props: {
  snapshot: ReplaySnapshot
  frame: number
  playing: boolean
  onPlay: () => void
  onJump: (frame: number) => void
  holdAtMilestones: boolean
  setHoldAtMilestones: (on: boolean) => void
  chambers: ReplayChambers
}) {
  const {
    snapshot,
    frame,
    playing,
    onPlay,
    onJump,
    holdAtMilestones,
    setHoldAtMilestones,
    chambers,
  } = props
  const { milestones, times } = snapshot
  const time = times[frame]
  const milestone = milestoneAt(milestones, frame)
  const title = milestone ? milestone.label : replayCountdown(time)
  const atEnd = frame >= times.length - 1
  // Keep the current stage's button in view when the line scrolls, without
  // scrolling the page.
  const strip = useRef<HTMLDivElement>(null)
  const stage = stageOf(milestones, frame)
  useEffect(() => {
    const el = strip.current
    const chip = el?.children[stage]
    if (!el || !chip) return
    const box = el.getBoundingClientRect()
    const at = chip.getBoundingClientRect()
    if (at.left < box.left) el.scrollLeft -= box.left - at.left + 8
    else if (at.right > box.right) el.scrollLeft += at.right - box.right + 8
  }, [stage])
  return (
    <section
      aria-label="Replay"
      className="bg-canvas-0 border-ink-200 @container flex flex-col gap-2 rounded-xl border p-2.5 sm:p-3"
    >
      <Row className="items-center gap-2">
        <button
          className="bg-primary-500 hover:bg-primary-600 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          onClick={onPlay}
          aria-label={
            playing
              ? 'Pause the replay'
              : atEnd
              ? 'Replay from the start'
              : 'Play the replay'
          }
        >
          {playing ? (
            <PauseIcon className="h-4 w-4" aria-hidden />
          ) : atEnd ? (
            <RefreshIcon className="h-4 w-4" aria-hidden />
          ) : (
            <PlayIcon className="h-4 w-4" aria-hidden />
          )}
        </button>
        {/* Scrolls sideways when the line is too narrow for every button. */}
        <div
          ref={strip}
          className="scrollbar-hide flex min-w-0 flex-1 gap-1 overflow-x-auto"
          role="group"
          aria-label="Jump to a milestone"
        >
          {milestones.map((m) => (
            <button
              key={m.id}
              aria-pressed={m.frame === frame}
              aria-label={milestoneLabel(m)}
              onClick={() => {
                track('election 2026 replay', { action: 'jump', to: m.id })
                onJump(m.frame)
              }}
              className={clsx(
                'h-6 shrink-0 whitespace-nowrap rounded-full border px-1.5 text-[11px] leading-none',
                m.frame === frame
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : m.frame < frame
                  ? 'border-primary-300 text-primary-700 hover:bg-primary-50'
                  : 'border-ink-300 text-ink-700 hover:bg-canvas-50'
              )}
            >
              {milestoneShortLabel(m)}
            </button>
          ))}
        </div>
        {/* The switch carries its own name; the text is for sight. */}
        <Row className="text-ink-600 shrink-0 items-center gap-1.5 text-[11px]">
          <span aria-hidden>Pauses</span>
          <ShortToggle
            size="sm"
            on={holdAtMilestones}
            setOn={(on) => {
              track('election 2026 replay', { action: 'milestone pauses', on })
              setHoldAtMilestones(on)
            }}
            ariaLabel="Pause at milestones"
          />
        </Row>
      </Row>

      <div className="relative">
        <input
          type="range"
          className="accent-primary-600 relative z-10 w-full cursor-pointer"
          min={0}
          max={sliderMax(milestones)}
          step={1}
          value={sliderValue(milestones, frame)}
          aria-label="Replay time"
          aria-valuetext={`${title}, ${formatRewindTime(time)}`}
          onChange={(e) =>
            onJump(frameAtSlider(milestones, Number(e.target.value)))
          }
          onKeyDown={(e) => {
            const to = scrubKeyFrame(milestones, frame, times.length - 1, e.key)
            if (to === undefined) return
            e.preventDefault()
            onJump(to)
          }}
        />
        {/* A tick per milestone: every stage is the same width. */}
        <div className="pointer-events-none absolute inset-x-[7px] top-1/2 h-0">
          {milestones.map((m, i) => (
            <span
              key={m.id}
              className={clsx(
                'absolute -top-[5px] h-[10px] w-[2px] -translate-x-1/2 rounded',
                m.frame <= frame ? 'bg-primary-500' : 'bg-ink-300'
              )}
              style={{
                left: `${(i / Math.max(1, milestones.length - 1)) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Quiet while playing, so screen readers aren't read every frame. */}
      <Col className="min-w-0" aria-live={playing ? 'off' : 'polite'}>
        <div className="text-primary-700 truncate text-lg font-semibold leading-7 sm:text-3xl sm:leading-9">
          {title}
        </div>
        <div className="text-ink-600 truncate text-xs tabular-nums leading-5 sm:text-sm">
          {formatRewindTime(time)}
          {milestone?.note && ` · ${milestone.note}`}
        </div>
      </Col>

      <div className="border-ink-200 @lg:grid-cols-2 grid gap-x-6 gap-y-2 border-t pt-2">
        {(['senate', 'house'] as const).map((chamber) => (
          <ChamberComparison
            key={chamber}
            label={chamberName(chamber)}
            rep={snapshotProb(snapshot, chambers[chamber].id, frame)}
            resolved={resolvedBy(chambers[chamber].resolvedAt, time)}
            others={REPLAY_COMPARISONS.map((s) => {
              const quote = comparisonsAt([s], chamber, time)[0]
              return {
                source: s.source,
                rep: quote?.republicanProb,
                status: quote && marketStatus(quote),
              }
            })}
            winner={chambers[chamber].winner}
          />
        ))}
      </div>
    </section>
  )
}

// Manifold's odds on a chamber over each other market's, bar for bar, and
// how far apart they were until either market resolved.
function ChamberComparison(props: {
  label: string
  rep: number | undefined
  // Manifold's market had resolved by this moment.
  resolved: boolean
  others: { source: string; rep: number | undefined; status?: MarketStatus }[]
  winner?: 'D' | 'R'
}) {
  const { label, rep, resolved, others, winner } = props
  const theirs = others[0]?.rep
  const gap =
    rep !== undefined &&
    theirs !== undefined &&
    !resolved &&
    others[0]?.status !== 'Resolved'
      ? { value: chamberGap(rep, theirs, winner) }
      : undefined
  return (
    <Col className="min-w-0 gap-1">
      <Row className="h-5 items-center justify-between gap-2">
        <span className="text-ink-600 shrink-0 text-xs font-semibold uppercase tracking-wide">
          {label} control
        </span>
        {gap && (
          <Row className="min-w-0 items-center gap-1.5">
            <span className="text-ink-600 truncate text-xs">
              Manifold’s edge
            </span>
            <EdgeBadge gap={gap.value} />
          </Row>
        )}
      </Row>
      <OddsBar
        name="Manifold"
        rep={rep}
        ours
        status={resolved ? 'Resolved' : undefined}
      />
      {others.map((o) => (
        <OddsBar
          key={o.source}
          name={comparisonLabel(o.source)}
          rep={o.rep}
          status={o.status}
        />
      ))}
    </Col>
  )
}

// Once a market closed or resolved, its status takes the bar's place. A
// closed market's row dims: its odds are its last price before the close.
function OddsBar(props: {
  name: string
  rep: number | undefined
  ours?: boolean
  status?: MarketStatus
}) {
  const { name, rep, ours, status } = props
  const split =
    rep !== undefined && Number.isFinite(rep) ? partySplit(rep) : undefined
  return (
    <div
      className={clsx(
        'grid grid-cols-[5.25rem_3.25rem_minmax(0,1fr)_3.25rem] items-center gap-1.5 text-sm tabular-nums',
        status === 'Closed' && 'opacity-60'
      )}
    >
      <span
        className={clsx(
          'truncate font-semibold',
          ours ? 'text-primary-700' : 'text-ink-800'
        )}
      >
        {name}
        {status && <span className="sr-only"> ({status.toLowerCase()})</span>}
      </span>
      <span className="text-azure-700 dark:text-azure-400 text-right font-semibold">
        <span aria-hidden>D </span>
        <span className="sr-only">Democrats </span>
        {split ? formatOdds(split.dem) : '—'}
      </span>
      {status ? (
        <span
          className="text-ink-600 truncate text-center text-xs font-semibold leading-5"
          aria-hidden
        >
          {status}
        </span>
      ) : (
        <div
          className={clsx(
            'flex h-2.5 overflow-hidden rounded-full',
            split ? 'bg-sienna-600' : 'bg-ink-200'
          )}
          aria-hidden
        >
          {split && (
            <div
              className="bg-azure-600 h-full"
              style={{ width: `${split.dem * 100}%` }}
            />
          )}
        </div>
      )}
      <span className="text-sienna-700 dark:text-sienna-400 font-semibold">
        <span aria-hidden>R </span>
        <span className="sr-only">Republicans </span>
        {split ? formatOdds(split.rep) : '—'}
      </span>
    </div>
  )
}

function MilestoneTable(props: {
  snapshot: ReplaySnapshot
  frame: number
  onJump: (frame: number) => void
  chambers: ReplayChambers
}) {
  const { snapshot, frame, onJump, chambers } = props
  const columns: { chamber: ReplayChamber; label: string }[] = [
    { chamber: 'senate', label: 'Senate' },
    { chamber: 'house', label: 'House' },
  ]
  const compared = REPLAY_COMPARISONS.length > 0
  return (
    <section className="flex flex-col gap-3" aria-labelledby="milestone-odds">
      <Col className="gap-1">
        <h2
          id="milestone-odds"
          className="text-primary-700 text-xl font-semibold sm:text-2xl"
        >
          Odds at each milestone
        </h2>
        <p className="text-ink-600 text-sm">
          Manifold’s chance of each party winning control of Congress
          {compared &&
            ', beside real-money prediction market odds, with Manifold’s edge'}
          . Select a milestone to see the map at that moment.
        </p>
      </Col>
      <div className="border-ink-200 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="bg-canvas-50 text-ink-600 text-left text-xs uppercase tracking-wide">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Milestone
              </th>
              {columns.map((c) => (
                <th key={c.chamber} scope="col" className="px-3 py-2">
                  {c.label} control
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.milestones.map((m) => (
              <tr
                key={m.id}
                className={clsx(
                  'border-ink-200 border-t',
                  m.frame === frame && 'bg-primary-50'
                )}
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <button
                    className="text-primary-700 font-semibold hover:underline"
                    onClick={() => onJump(m.frame)}
                    aria-label={`Show the map at ${milestoneLabel(m)}`}
                  >
                    {m.id === LATEST_MILESTONE_ID ? 'Latest' : m.label}
                  </button>
                  <div className="text-ink-600 text-xs tabular-nums">
                    {formatRewindTime(m.time)}
                  </div>
                </th>
                {columns.map((c) => {
                  const market = chambers[c.chamber]
                  const ours = snapshotProb(snapshot, market.id, m.frame)
                  const oursResolved = resolvedBy(market.resolvedAt, m.time)
                  const others = comparisonsAt(
                    REPLAY_COMPARISONS,
                    c.chamber,
                    m.time
                  )
                  const first = others[0]
                  return (
                    <td key={c.chamber} className="px-3 py-2 align-top">
                      <SplitOdds
                        rep={ours}
                        source={compared ? 'Manifold' : undefined}
                        status={oursResolved ? 'Resolved' : undefined}
                        badge={
                          ours !== undefined &&
                          first &&
                          !oursResolved &&
                          !first.resolved && (
                            <EdgeBadge
                              gap={chamberGap(
                                ours,
                                first.republicanProb,
                                market.winner
                              )}
                            />
                          )
                        }
                      />
                      {others.map((other) => (
                        <SplitOdds
                          key={other.source}
                          rep={other.republicanProb}
                          source={comparisonLabel(other.source)}
                          status={marketStatus(other)}
                        />
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compared && (
        <ul className="text-ink-600 flex flex-col gap-1 text-xs">
          <li>
            Manifold: the market’s probability after the last trade before each
            moment.
          </li>
          <li>
            Edge: how many percentage points more Manifold put on the winner
            than real money did, once the chamber’s market resolved; until then,
            how many more it put on the Democrats. Shown until either market had
            resolved.
          </li>
          {REPLAY_COMPARISONS.map(
            (s) =>
              COMPARISON_SOURCES[s.source] && (
                <li key={s.source}>{COMPARISON_SOURCES[s.source].method}</li>
              )
          )}
        </ul>
      )}
    </section>
  )
}

// Named by source once the table has other markets' odds beside Manifold's,
// with what the market had done by then (resolved, or closed).
function SplitOdds(props: {
  rep: number | undefined
  source?: string
  status?: MarketStatus
  badge?: ReactNode
}) {
  const { rep, source, status, badge } = props
  if (rep === undefined || !Number.isFinite(rep))
    return <div className="text-ink-500">—</div>
  const split = partySplit(rep)
  return (
    <Row className="items-baseline gap-2 tabular-nums">
      <span className="text-azure-700 dark:text-azure-400 font-semibold">
        D {formatOdds(split.dem)}
      </span>
      <span className="text-sienna-700 dark:text-sienna-400 font-semibold">
        R {formatOdds(split.rep)}
      </span>
      {(source || status) && (
        <span className="text-ink-600 text-xs">
          {source}
          {source && status && ' · '}
          {status && (
            <span className="text-ink-800 font-semibold">{status}</span>
          )}
        </span>
      )}
      {badge}
    </Row>
  )
}

function ReplayMethod(props: { rebuiltThrough: number; latestAt: number }) {
  return (
    <section className="text-ink-600 flex max-w-3xl flex-col gap-2 text-sm">
      <h2 className="text-ink-900 text-base font-semibold">
        How the replay works
      </h2>
      <p>
        Manifold records the price before and after every trade, so the odds at
        any moment are the price after the last trade before it. Each frame of
        the replay is rebuilt that way from every trade on the map’s markets. A
        race shows as called from the moment its market resolved.
      </p>
      <p>
        Trading is off in the replay. The{' '}
        <Link href="/election" className="text-primary-700 hover:underline">
          live map
        </Link>{' '}
        has today’s odds. The replay is rebuilt from trades through{' '}
        {formatRewindTime(props.rebuiltThrough)}; Latest is every market as of{' '}
        {formatRewindTime(props.latestAt)}, refreshed every few minutes.
      </p>
    </section>
  )
}
