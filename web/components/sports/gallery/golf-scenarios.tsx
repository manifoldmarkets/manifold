import { useCallback, useState } from 'react'
import type { GolfField, GolfPlayer, GolfTournament } from 'common/bdl/golf'
import {
  currentGolfPick,
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
  ]
  const players: GolfPlayer[] = names.map((name, i) => ({
    playerId: i + 1,
    competitorId: i + 1001,
    name,
    state: scheduled ? 'entered' : 'active',
    fieldPresent: true,
    position: scheduled
      ? null
      : { rank: [1, 2, 2, 4, 5, 6][i], tied: i === 1 || i === 2 },
    toPar: scheduled ? null : [-12, -10, -10, -8, -7, -6][i],
    through: scheduled
      ? null
      : final
      ? 'F'
      : ['14', '13', '15', '11', '12', '15'][i],
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
      ? players.map((p) => p.playerId)
      : [...players.map((p) => p.playerId), null],
    answers: [],
  }
  source.answers = quotes.map((price, index) => ({
    id: source.id + '-' + index,
    contractId: source.id,
    index,
    text: players[index]?.name ?? 'Other',
    isOther: index === players.length,
    p: 0.5,
    poolNo: price,
    poolYes: 100 - price,
  }))
  return { field, source }
}

function GalleryPick({
  pick,
  field,
  market,
  clock,
  close,
}: {
  pick: GolfPick
  field: GolfField
  market: GolfMarket
  clock: () => number
  close: () => void
}) {
  const [amount, setAmount] = useState('10'),
    [receipt, setReceipt] = useState<number>()
  const at = useGolfMarketTime(
    now,
    market.closeTime,
    field.readStartedAt,
    clock
  )
  const active = currentGolfPick(field, market, pick, at)
  const stake = Number(amount),
    valid = !!active && Number.isSafeInteger(stake) && stake > 0
  return (
    <Modal
      open
      setOpen={(open) => {
        if (!open) close()
      }}
      ariaLabel={'Preview pick for ' + pick.name}
      className={MODAL_CLASS}
      size="sm"
    >
      <h3 className="text-ink-900 text-lg font-semibold">{pick.name}</h3>
      <p className="text-ink-600 text-sm">
        Gallery ticket · {formatSportsPrice(pick.probability)}
      </p>
      {receipt === undefined ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (
              valid &&
              currentGolfPick(field, market, pick, Math.max(at, clock()))
            )
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
          {!active && (
            <p role="status">This selection is no longer available.</p>
          )}
          <button
            type="submit"
            disabled={!valid}
            className="bg-primary-600 min-h-[44px] rounded-md px-4 font-semibold text-white disabled:opacity-50"
          >
            Confirm preview
          </button>
        </form>
      ) : (
        <p className="text-ink-800 mt-3" role="status">
          {formatMoney(receipt)} preview for {pick.name}
        </p>
      )}
    </Modal>
  )
}
export default function GolfScenarios() {
  const [scenario, setScenario] = useState<Scenario>('Live leaderboard'),
    [pick, setPick] = useState<GolfPick>()
  const [openedAt] = useState(Date.now)
  const clock = useCallback(() => now + (Date.now() - openedAt), [openedAt])
  const { field, source } = sample(scenario)
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
              if (next) {
                setPick(undefined)
                setScenario(next)
              }
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
      {scenario === 'Missing market' ? (
        <p className="text-ink-600 py-4">No linked Manifold market.</p>
      ) : (
        <FieldEvent
          key={scenario}
          field={field}
          market={source}
          now={now}
          clock={clock}
          onPick={setPick}
        />
      )}
      {pick && (
        <GalleryPick
          pick={pick}
          field={field}
          market={source}
          clock={clock}
          close={() => setPick(undefined)}
        />
      )}
    </section>
  )
}
