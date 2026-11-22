import { useCallback, useState } from 'react'
import type { GolfField, GolfPlayer, GolfTournament } from 'common/bdl/golf'
import {
  currentGolfPick,
  golfMarketLabel,
  golfPickLabel,
  type GolfMarket,
  type GolfPick,
} from 'common/bdl/golf-market'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { formatSportsPrice } from 'common/sports-price'
import { formatMoney } from 'common/util/format'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { FieldEvent, useGolfMarketTime } from '../golf-field-event'

const scenarios = [
  'Upcoming field',
  'Live leaderboard',
  'Independent top 10',
  'Round suspended',
  'Final leaderboard',
  'LPGA preview',
  'Missing market',
  'Partial leaderboard',
] as const
type Scenario = (typeof scenarios)[number]
const now = Date.UTC(2026, 10, 21, 15)
function sample(s: Scenario) {
  const lpga = s === 'LPGA preview',
    scheduled = s === 'Upcoming field',
    final = s === 'Final leaderboard' || lpga
  const tournament: GolfTournament = {
    tour: lpga ? 'lpga' : 'pga',
    id: lpga ? 31 : 6904,
    season: 2026,
    eventId: lpga ? 'bdl:lpga:31' : 'bdl:pga:6904',
    name: lpga ? 'The ANNIKA' : 'The RSM Classic',
    course: lpga ? 'Pelican Golf Club' : 'Sea Island Golf Club',
    state: scheduled
      ? 'scheduled'
      : final
      ? 'final'
      : s === 'Round suspended'
      ? 'suspended'
      : 'live',
    round: scheduled ? null : final ? 4 : 3,
    format: lpga ? 'Stroke Play' : 'STROKE_PLAY',
    startDate: null,
    endDate: null,
  }
  const names = [
    'Morgan Vale',
    'Alex Jordan',
    'Casey Lin',
    'Riley Brooks',
    'Jo Ellis',
    'Sam Calder',
    'Taylor Ames',
  ]
  const players: GolfPlayer[] = names.map((name, i) => ({
    playerId: i + 1,
    competitorId: i + 1001,
    name,
    state: scheduled ? 'entered' : 'active',
    fieldPresent: true,
    position: scheduled
      ? null
      : { rank: [1, 2, 2, 4, 5, 6, 7][i], tied: i === 1 || i === 2 },
    toPar: scheduled ? null : [-12, -10, -10, -8, -7, -6, -4][i],
    through: scheduled
      ? null
      : final
      ? 'F'
      : ['14', '13', '15', '11', '12', '15', '11'][i],
  }))
  const field: GolfField = {
    tournament,
    players,
    readStartedAt: now - 30000,
    hasResults: !scheduled,
    incomplete: false,
  }
  const top = s === 'Independent top 10',
    quotes = top ? [68, 56, 52, 48, 39, 33] : [28, 22, 15, 12, 8, 5, 10]
  const priced = players.slice(0, 6)
  const source: GolfMarket = {
    id: 'gallery-golf-' + (top ? 'top-ten' : 'winner'),
    creatorId: MANIFOLD_SPORTS_USER_IDS[0],
    visibility: 'public',
    token: 'MANA',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: !top,
    topN: top ? 10 : undefined,
    isResolved: final,
    closeTime: now + 3600000,
    sportsProvider: 'bdl',
    sportsLeagueKey: tournament.tour,
    sportsEventId: tournament.eventId,
    sportsMarketType: top ? 'top_n' : 'winner',
    sportsEntrantIds: top
      ? priced.map((p) => p.playerId)
      : [...priced.map((p) => p.playerId), null],
    answers: [],
  }
  source.answers = quotes.map((price, index) => ({
    id: source.id + '-' + index,
    contractId: source.id,
    index,
    text: priced[index]?.name ?? 'Other',
    isOther: index === priced.length,
    p: 0.5,
    poolNo: price,
    poolYes: 100 - price,
  }))
  if (s === 'Partial leaderboard') {
    field.incomplete = true
    field.players = players.filter((p) => p.playerId !== 4)
  }
  return { field, source }
}

function GalleryPick({
  pick,
  field,
  market,
  at,
  readNow,
  close,
}: {
  pick: GolfPick
  field: GolfField
  market: GolfMarket
  at: number
  readNow: () => number
  close: () => void
}) {
  const [amount, setAmount] = useState('10'),
    [receipt, setReceipt] = useState<number>()
  const active = currentGolfPick(field, market, pick, at)
  const proposition = golfMarketLabel(pick.kind)
  const choice = golfPickLabel(pick)
  const excluded = pick.excludedPlayerIds
    ? field.players
        .filter((p) => pick.excludedPlayerIds?.includes(p.playerId))
        .map((p) => p.name)
        .sort()
    : []
  const context = field.tournament.name + ' · ' + proposition
  const stake = Number(amount),
    valid = !!active && Number.isSafeInteger(stake) && stake > 0
  return (
    <Modal
      open
      setOpen={(open) => {
        if (!open) close()
      }}
      ariaLabel={'Preview pick for ' + choice + ' · ' + context}
      className={MODAL_CLASS}
      size="sm"
    >
      <p className="text-ink-600 text-sm">{context}</p>
      <h3 className="text-ink-900 text-lg font-semibold">{choice}</h3>
      <p className="text-ink-600 text-sm">
        Gallery ticket · {formatSportsPrice(pick.probability)}
      </p>
      {excluded.length > 0 && (
        <details className="text-ink-700 text-sm">
          <summary className="min-h-[44px] cursor-pointer py-3 font-medium">
            Excluded golfers
          </summary>
          <p>{excluded.join(', ')}</p>
        </details>
      )}
      {receipt === undefined ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && currentGolfPick(field, market, pick, readNow()))
              setReceipt(stake)
          }}
        >
          <label className="text-ink-800 text-sm">
            Demo stake
            <input
              type="number"
              step="1"
              min="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] w-full rounded-md border px-3"
            />
          </label>
          <p
            role="status"
            className={active ? 'sr-only' : 'text-ink-700 text-sm'}
          >
            {!active && 'This selection is no longer available.'}
          </p>
          <button
            type="submit"
            aria-disabled={!valid}
            className="bg-primary-600 text-ink-0 min-h-[44px] rounded-md px-4 font-semibold aria-disabled:opacity-60"
          >
            Confirm preview
          </button>
        </form>
      ) : (
        <p className="text-ink-800 mt-3" role="status">
          {formatMoney(receipt)} preview for {choice} · {context}
        </p>
      )}
    </Modal>
  )
}
function ScenarioField({ scenario }: { scenario: Scenario }) {
  const [pick, setPick] = useState<GolfPick>()
  const [returnFocusTo, setReturnFocusTo] = useState<string>()
  const [openedAt] = useState(Date.now)
  const clock = useCallback(() => now + (Date.now() - openedAt), [openedAt])
  const { field, source } = sample(scenario)
  const observed = useGolfMarketTime(
    now,
    source.closeTime,
    field.readStartedAt,
    clock
  )
  return (
    <>
      <FieldEvent
        field={field}
        market={scenario === 'Missing market' ? undefined : source}
        now={observed.now}
        clock={clock}
        returnFocusTo={returnFocusTo}
        onPick={(selected) => {
          setReturnFocusTo(selected.answerId)
          setPick(selected)
        }}
      />
      {pick && (
        <GalleryPick
          pick={pick}
          field={field}
          market={source}
          at={observed.now}
          readNow={observed.readNow}
          close={() => {
            observed.readNow()
            setPick(undefined)
          }}
        />
      )}
    </>
  )
}
export default function GolfScenarios() {
  const [scenario, setScenario] = useState<Scenario>('Live leaderboard')
  return (
    <section aria-label="Golf gallery" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink-900 text-lg font-semibold">Golf</h2>
        <label className="text-ink-700 text-sm">
          Scenario{' '}
          <select
            value={scenario}
            className="bg-canvas-0 border-ink-300 min-h-[44px] max-w-full rounded-md border py-2 pl-2 pr-9"
            onChange={(e) => {
              const next = scenarios.find((s) => s === e.target.value)
              if (next) setScenario(next)
            }}
          >
            {scenarios.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-ink-600 text-sm">
        Sample field and Manifold prices. Picks stay in this gallery.
      </p>
      <ScenarioField key={scenario} scenario={scenario} />
    </section>
  )
}
