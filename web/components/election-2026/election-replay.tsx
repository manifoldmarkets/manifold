import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { uniq } from 'lodash'
import Link from 'next/link'
import { PauseIcon, PlayIcon, RefreshIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
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
  COMPARISON_METHODS,
  comparisonsAt,
  REPLAY_COMPARISONS,
  ReplayChamber,
  ReplayComparison,
} from './replay-comparisons'
import {
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
// the odds (web/scripts/election-2026-replay-snapshot.ts). Display only:
// betting stays on the live map.
export function ElectionReplay(props: LiveElectionMapProps) {
  const { snapshot, error, retry } = useReplaySnapshot()
  const contracts = useMemo(() => electionContracts(props), [props])
  const [frame, setFrame] = useState(0)
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
            senateId={props.senateControlContract?.id}
            houseId={props.houseControlContract?.id}
          />
          <ElectionAsOfContext.Provider value={snapshot.times[frame]}>
            <LiveElectionExplorer live={shown} />
          </ElectionAsOfContext.Provider>
          <MilestoneTable
            snapshot={snapshot}
            frame={frame}
            onJump={(to) => {
              jump(to)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            senateId={props.senateControlContract?.id}
            houseId={props.houseControlContract?.id}
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
      <Link
        href="/election"
        className="text-primary-700 w-fit text-sm font-semibold hover:underline"
      >
        See the live map →
      </Link>
    </Col>
  )
}

const milestoneAt = (milestones: ReplayMilestone[], frame: number) =>
  milestones.find((m) => m.frame === frame)

const milestoneLabel = (m: ReplayMilestone) =>
  m.id === LATEST_MILESTONE_ID ? `Latest: ${formatRewindTime(m.time)}` : m.label

function ReplayPlayer(props: {
  snapshot: ReplaySnapshot
  frame: number
  playing: boolean
  onPlay: () => void
  onJump: (frame: number) => void
  senateId: string | undefined
  houseId: string | undefined
}) {
  const { snapshot, frame, playing, onPlay, onJump, senateId, houseId } = props
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
      className="bg-canvas-0 border-ink-200 flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Quiet while playing, so screen readers aren't read every frame. */}
        <Col className="min-w-0 gap-1" aria-live={playing ? 'off' : 'polite'}>
          <div className="text-primary-700 text-2xl font-semibold sm:text-3xl">
            {title}
          </div>
          <div className="text-ink-700 text-sm tabular-nums sm:text-base">
            {formatRewindTime(time)}
          </div>
          {milestone?.note && (
            <div className="text-ink-600 text-sm">{milestone.note}</div>
          )}
        </Col>
        <Row className="gap-4 sm:gap-6">
          <ChamberOdds
            label="Senate"
            rep={snapshotProb(snapshot, senateId, frame)}
            others={
              milestone &&
              comparisonsAt(REPLAY_COMPARISONS, 'senate', milestone.id)
            }
          />
          <ChamberOdds
            label="House"
            rep={snapshotProb(snapshot, houseId, frame)}
            others={
              milestone &&
              comparisonsAt(REPLAY_COMPARISONS, 'house', milestone.id)
            }
          />
        </Row>
      </div>

      <Row className="items-center gap-3">
        <Button
          color="indigo"
          size="lg"
          className="shrink-0 gap-1.5 !rounded-full"
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
          <span>{playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}</span>
        </Button>
        <div className="relative flex-1">
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
              const to = scrubKeyFrame(
                milestones,
                frame,
                times.length - 1,
                e.key
              )
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
      </Row>

      {/* One scrolling row on phones; wrapped from sm up. */}
      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
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
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm',
              m.frame === frame
                ? 'border-primary-500 bg-primary-500 text-white'
                : m.frame < frame
                ? 'border-primary-300 text-primary-700 hover:bg-primary-50'
                : 'border-ink-300 text-ink-700 hover:bg-canvas-50'
            )}
          >
            {milestoneLabel(m)}
          </button>
        ))}
      </div>
    </section>
  )
}

// Manifold's odds for a chamber, and on a milestone, other markets' beside.
function ChamberOdds(props: {
  label: string
  rep: number | undefined
  others?: ReplayComparison[]
}) {
  const { label, others } = props
  const split =
    props.rep !== undefined && Number.isFinite(props.rep)
      ? partySplit(props.rep)
      : undefined
  return (
    <Col className="w-36 gap-1 sm:w-40">
      <div className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
        {label} control
      </div>
      <Row className="justify-between text-sm font-semibold tabular-nums">
        <span className="text-azure-700 dark:text-azure-400">
          D {split ? formatOdds(split.dem) : '—'}
        </span>
        <span className="text-sienna-700 dark:text-sienna-400">
          R {split ? formatOdds(split.rep) : '—'}
        </span>
      </Row>
      <div
        className={clsx(
          'flex h-2 overflow-hidden rounded-full',
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
      {others?.map((other) => {
        const theirs = partySplit(other.republicanProb)
        return (
          <div
            key={other.source}
            className="text-ink-600 flex justify-between text-xs tabular-nums"
          >
            <span>{other.source}</span>
            <span>
              D {formatOdds(theirs.dem)} · R {formatOdds(theirs.rep)}
            </span>
          </div>
        )
      })}
    </Col>
  )
}

function MilestoneTable(props: {
  snapshot: ReplaySnapshot
  frame: number
  onJump: (frame: number) => void
  senateId: string | undefined
  houseId: string | undefined
}) {
  const { snapshot, frame, onJump, senateId, houseId } = props
  const chambers: { chamber: ReplayChamber; label: string; id?: string }[] = [
    { chamber: 'senate', label: 'Senate', id: senateId },
    { chamber: 'house', label: 'House', id: houseId },
  ]
  const sources = uniq(REPLAY_COMPARISONS.map((c) => c.source))
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
          {sources.length > 0 &&
            `, beside real-money odds from ${sources.join(' and ')}`}
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
              {chambers.map((c) => (
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
                {chambers.map((c) => (
                  <td key={c.chamber} className="px-3 py-2 align-top">
                    <SplitOdds
                      rep={snapshotProb(snapshot, c.id, m.frame)}
                      source={
                        REPLAY_COMPARISONS.length ? 'Manifold' : undefined
                      }
                    />
                    {comparisonsAt(REPLAY_COMPARISONS, c.chamber, m.id).map(
                      (other) => (
                        <SplitOdds
                          key={other.source}
                          rep={other.republicanProb}
                          source={other.source}
                          href={other.url}
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
      {sources.length > 0 && (
        <ul className="text-ink-600 flex flex-col gap-1 text-xs">
          <li>
            Manifold: the market’s probability after the last trade before each
            milestone.
          </li>
          {sources.map(
            (source) =>
              COMPARISON_METHODS[source] && (
                <li key={source}>{COMPARISON_METHODS[source]}</li>
              )
          )}
        </ul>
      )}
    </section>
  )
}

// Named by source once the table has other markets' odds beside Manifold's.
function SplitOdds(props: {
  rep: number | undefined
  source?: string
  href?: string
}) {
  const { rep, source, href } = props
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
      {href ? (
        <a
          href={href}
          className="text-ink-600 text-xs hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {source}
        </a>
      ) : (
        source && <span className="text-ink-600 text-xs">{source}</span>
      )}
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
