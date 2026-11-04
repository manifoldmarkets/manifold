import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { PauseIcon, PlayIcon, RefreshIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ElectionAsOfContext } from 'web/components/usa-map/election-as-of'
import { formatOdds } from 'web/components/usa-map/election-display'
import {
  formatRewindTime,
  liveAsOf,
} from 'web/components/usa-map/election-rewind-model'
import {
  electionContracts,
  LiveElectionExplorer,
  LiveElectionMapProps,
} from 'web/components/usa-map/live-election-map'
import { track } from 'web/lib/service/analytics'
import {
  comparisonLabel,
  COMPARISON_SOURCES,
  comparisonsAt,
  REPLAY_COMPARISONS,
  ReplayChamber,
} from './replay-comparisons'
import {
  chamberGap,
  defaultFrame,
  frameAtSlider,
  LATEST_MILESTONE_ID,
  partySplit,
  playbackDelay,
  replayCountdown,
  ReplayMilestone,
  ReplaySnapshot,
  scrubKeyFrame,
  sliderMax,
  sliderValue,
  snapshotProb,
} from './replay-model'

// /election2026: the midterm map replayed from a week before the polls
// closed through election night, stage by stage, from a static snapshot of
// the odds (web/scripts/election-2026-replay-snapshot.ts), beside real-money
// odds on Senate and House control. Display only: betting stays on the live
// map.
export function ElectionReplay(props: LiveElectionMapProps) {
  const { snapshot, error, retry } = useReplaySnapshot()
  const contracts = useMemo(() => electionContracts(props), [props])
  // Undefined until the reader moves: the default milestone.
  const [chosenFrame, setFrame] = useState<number>()
  const frame =
    chosenFrame ?? (snapshot ? defaultFrame(snapshot.milestones) : 0)
  const [playing, setPlaying] = useState(false)
  // Where playback started, so it doesn't pause on that milestone.
  const [startFrame, setStartFrame] = useState(0)
  const last = snapshot ? snapshot.times.length - 1 : 0

  useEffect(() => {
    if (!playing || !snapshot) return
    if (frame >= last) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(
      () => setFrame(frame + 1),
      playbackDelay(snapshot.milestones, frame, startFrame)
    )
    return () => clearTimeout(timer)
  }, [playing, frame, last, snapshot, startFrame])

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
  const chambers = {
    senate: {
      id: props.senateControlContract?.id,
      winner: winnerOf(props.senateControlContract),
    },
    house: {
      id: props.houseControlContract?.id,
      winner: winnerOf(props.houseControlContract),
    },
  }

  return (
    <Col className="mx-auto w-full max-w-6xl gap-6 px-3 pb-12 pt-4 sm:px-4">
      <ReplayHero />
      {snapshot && shown ? (
        <>
          <ReplayPlayer
            snapshot={snapshot}
            frame={frame}
            playing={playing}
            onPlay={play}
            onJump={jump}
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
          <ReplayMethod generatedAt={snapshot.generatedAt} />
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
    </Col>
  )
}

type Chambers = {
  [chamber in ReplayChamber]: { id?: string; winner?: 'D' | 'R' }
}

// A chamber-control market (YES = Republicans) that has resolved.
const winnerOf = (contract: Contract | null): 'D' | 'R' | undefined =>
  contract?.isResolved && contract.resolution === 'YES'
    ? 'R'
    : contract?.isResolved && contract.resolution === 'NO'
    ? 'D'
    : undefined

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

function ReplayHero() {
  return (
    <Col className="gap-2">
      <div className="text-primary-700 text-sm font-semibold uppercase tracking-wide">
        2026 US midterms
      </div>
      <h1 className="text-ink-1000 text-3xl font-semibold sm:text-4xl">
        Watch the midterms unfold
      </h1>
      <p className="text-ink-700 max-w-2xl text-base sm:text-lg">
        Manifold’s odds on every Senate, governor and House race and ballot
        measure, replayed from a week before the polls closed through election
        night.
      </p>
    </Col>
  )
}

const milestoneAt = (milestones: ReplayMilestone[], frame: number) =>
  milestones.find((m) => m.frame === frame)

const milestoneLabel = (m: ReplayMilestone) =>
  m.id === LATEST_MILESTONE_ID ? `Latest: ${formatRewindTime(m.time)}` : m.label

// Every line here has a fixed height and every comparison row is always
// drawn, so scrubbing never moves the page.
function ReplayPlayer(props: {
  snapshot: ReplaySnapshot
  frame: number
  playing: boolean
  onPlay: () => void
  onJump: (frame: number) => void
  chambers: Chambers
}) {
  const { snapshot, frame, playing, onPlay, onJump, chambers } = props
  const { milestones, times } = snapshot
  const time = times[frame]
  const milestone = milestoneAt(milestones, frame)
  const title =
    milestone && milestone.id !== LATEST_MILESTONE_ID
      ? milestone.label
      : replayCountdown(time)
  const atEnd = frame >= times.length - 1
  return (
    <section
      aria-label="Replay"
      className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-3 sm:p-4"
    >
      <Row className="items-center gap-3">
        <button
          className="bg-primary-500 hover:bg-primary-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
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
            <PauseIcon className="h-5 w-5" aria-hidden />
          ) : atEnd ? (
            <RefreshIcon className="h-5 w-5" aria-hidden />
          ) : (
            <PlayIcon className="h-5 w-5" aria-hidden />
          )}
        </button>
        {/* Quiet while playing, so screen readers aren't read every frame. */}
        <Col className="min-w-0 flex-1" aria-live={playing ? 'off' : 'polite'}>
          <div className="text-primary-700 truncate text-base font-semibold leading-6 sm:text-xl sm:leading-7">
            {title}
          </div>
          <div className="text-ink-600 truncate text-xs tabular-nums leading-5 sm:text-sm">
            {formatRewindTime(time)}
            {milestone?.note && ` · ${milestone.note}`}
          </div>
        </Col>
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

      {/* One scrolling row on phones, wrapped from sm up. The buttons never
          change size, so the rows don't change while scrubbing. */}
      <div
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
        role="group"
        aria-label="Jump to a milestone"
      >
        {milestones.map((m) => (
          <button
            key={m.id}
            aria-pressed={m.frame === frame}
            onClick={() => {
              track('election 2026 replay', { action: 'jump', to: m.id })
              onJump(m.frame)
            }}
            className={clsx(
              'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs',
              m.frame === frame
                ? 'border-primary-500 bg-primary-500 text-white'
                : m.frame < frame
                ? 'border-primary-300 text-primary-700 hover:bg-primary-50'
                : 'border-ink-300 text-ink-700 hover:bg-canvas-50'
            )}
          >
            {m.id === LATEST_MILESTONE_ID ? 'Latest' : m.label}
          </button>
        ))}
      </div>

      <div className="border-ink-200 grid gap-x-8 gap-y-3 border-t pt-3 sm:grid-cols-2">
        {(['senate', 'house'] as const).map((chamber) => (
          <ChamberComparison
            key={chamber}
            label={chamber === 'senate' ? 'Senate' : 'House'}
            rep={snapshotProb(snapshot, chambers[chamber].id, frame)}
            others={REPLAY_COMPARISONS.map((s) => ({
              source: s.source,
              rep: comparisonsAt([s], chamber, time)[0]?.republicanProb,
            }))}
            winner={chambers[chamber].winner}
          />
        ))}
      </div>
    </section>
  )
}

// Manifold's odds on a chamber over each other market's, bar for bar, and
// how far apart they were.
function ChamberComparison(props: {
  label: string
  rep: number | undefined
  others: { source: string; rep: number | undefined }[]
  winner?: 'D' | 'R'
}) {
  const { label, rep, others, winner } = props
  const first = others[0]
  const gap =
    rep !== undefined && first?.rep !== undefined
      ? chamberGap(rep, first.rep, winner)
      : undefined
  const otherName = first && comparisonLabel(first.source)
  return (
    <Col className="min-w-0 gap-1.5">
      <Row className="h-5 items-baseline justify-between gap-2">
        <span className="text-ink-600 shrink-0 text-xs font-semibold uppercase tracking-wide">
          {label} control
        </span>
        <span
          className={clsx(
            'truncate text-xs font-semibold',
            gap && gap.points > 0 ? 'text-primary-700' : 'text-ink-600'
          )}
        >
          {gap &&
            (gap.resolved
              ? gap.points > 0
                ? `Manifold ${gap.points} pts closer to the result`
                : `${otherName} ${-gap.points} pts closer to the result`
              : `Manifold had ${
                  gap.party === 'D' ? 'Democrats' : 'Republicans'
                } ${Math.abs(gap.points)} pts ${
                  gap.points > 0 ? 'higher' : 'lower'
                }`)}
        </span>
      </Row>
      <OddsBar name="Manifold" rep={rep} ours />
      {others.map((o) => (
        <OddsBar key={o.source} name={comparisonLabel(o.source)} rep={o.rep} />
      ))}
    </Col>
  )
}

function OddsBar(props: {
  name: string
  rep: number | undefined
  ours?: boolean
}) {
  const { name, rep, ours } = props
  const split =
    rep !== undefined && Number.isFinite(rep) ? partySplit(rep) : undefined
  return (
    <div className="grid grid-cols-[5.5rem_3.75rem_minmax(0,1fr)_3.75rem] items-center gap-2 text-sm tabular-nums">
      <span
        className={clsx(
          'truncate font-semibold',
          ours ? 'text-primary-700' : 'text-ink-800'
        )}
      >
        {name}
      </span>
      <span className="text-azure-700 dark:text-azure-400 text-right font-semibold">
        <span aria-hidden>D </span>
        <span className="sr-only">Democrats </span>
        {split ? formatOdds(split.dem) : '—'}
      </span>
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
  chambers: Chambers
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
          {compared && ', beside real-money prediction market odds'}. Select a
          milestone to see the map at that moment.
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
                {columns.map((c) => (
                  <td key={c.chamber} className="px-3 py-2 align-top">
                    <SplitOdds
                      rep={snapshotProb(
                        snapshot,
                        chambers[c.chamber].id,
                        m.frame
                      )}
                      source={compared ? 'Manifold' : undefined}
                    />
                    {comparisonsAt(REPLAY_COMPARISONS, c.chamber, m.time).map(
                      (other) => (
                        <SplitOdds
                          key={other.source}
                          rep={other.republicanProb}
                          source={comparisonLabel(other.source)}
                        />
                      )
                    )}
                  </td>
                ))}
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

// Named by source once the table has other markets' odds beside Manifold's.
function SplitOdds(props: { rep: number | undefined; source?: string }) {
  const { rep, source } = props
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
      {source && <span className="text-ink-600 text-xs">{source}</span>}
    </Row>
  )
}

function ReplayMethod(props: { generatedAt: number }) {
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
        has today’s odds. Replay data as of{' '}
        {formatRewindTime(props.generatedAt)}.
      </p>
    </section>
  )
}
