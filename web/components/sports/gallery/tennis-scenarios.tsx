import { useState } from 'react'
import type { TennisMatch, TennisSide } from 'common/bdl/tennis'
import type { TennisMarketSource, TennisPick } from 'common/bdl/tennis-market'
import { tennisDraw } from 'common/bdl/tennis'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { formatSportsPrice } from 'common/sports-price'
import { formatMoney } from 'common/util/format'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { TennisDraw, TennisMatchCard } from '../tennis-draw'

const states = [
  'Scheduled',
  'Live',
  'Suspended',
  'Final',
  'Score under review',
  'Retired',
  'No linked market',
  'Draw',
] as const
type Scenario = (typeof states)[number]
const now = Date.UTC(2026, 6, 8, 13, 1)
function example(state: Scenario): TennisMatch {
  const final = state === 'Final',
    active = state === 'Live',
    held = state === 'Suspended'
  const sides: [TennisSide, TennisSide] = [
    {
      id: 101,
      name: 'Ari Marin',
      sets: [],
      points: active ? '30' : null,
      serving: false,
    },
    {
      id: 102,
      name: 'Jamie Laurent',
      sets: [],
      points: active ? '15' : null,
      serving: active,
    },
  ]
  if (final || active || held) {
    sides[0].sets = [
      { games: 6, tiebreak: null },
      { games: final ? 7 : 2, tiebreak: final ? 7 : null },
    ]
    sides[1].sets = [
      { games: 4, tiebreak: null },
      { games: final ? 6 : 3, tiebreak: final ? 4 : null },
    ]
  }
  return {
    tour: 'atp',
    id: 1001,
    eventId: 'bdl:atp:1001:101-102',
    tournament: { id: 40, season: 2026, name: 'Clay Court Masters' },
    round: 'QF',
    eligibleRound: true,
    bestOf: 3,
    timing: {
      venueDay: '2026-07-08',
      startKnown: state !== 'No linked market',
      earliestStart: now + (active || held ? -3600000 : 3600000),
      safetyClose: now + 7200000,
    },
    status: active
      ? 'live'
      : held
      ? 'suspended'
      : final || state === 'Score under review'
      ? 'final'
      : state === 'Retired'
      ? 'unavailable'
      : 'scheduled',
    attention:
      state === 'Score under review'
        ? 'scores'
        : state === 'Retired'
        ? 'retired'
        : null,
    winnerId: final ? 101 : null,
    sides,
  }
}
function previewMarket(m: TennisMatch): TennisMarketSource {
  const [a, b] = m.sides,
    contractId = 'gallery-tennis-' + m.id
  return {
    id: contractId,
    creatorId: MANIFOLD_SPORTS_USER_IDS[0],
    visibility: 'public',
    mechanism: 'cpmm-multi-1',
    token: 'MANA',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    closeTime: now + 7200000,
    isResolved: m.status === 'final',
    sportsProvider: 'bdl',
    sportsLeagueKey: m.tour,
    sportsEventId: m.eventId,
    sportsMarketType: 'moneyline',
    sportsEntrantIds: [b.id, a.id],
    answers: [b, a].map((side, index) => ({
      id: contractId + '-' + side.id,
      index,
      contractId,
      text: side.name,
      poolYes: index === 0 ? 58 : 42,
      poolNo: index === 0 ? 42 : 58,
      p: 0.5,
    })),
  }
}
function PreviewTicket({
  pick,
  close,
}: {
  pick: TennisPick
  close: () => void
}) {
  const [amount, setAmount] = useState('10'),
    [receipt, setReceipt] = useState<number>()
  const stake = Number(amount),
    valid = Number.isSafeInteger(stake) && stake > 0
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
      {receipt == null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) setReceipt(stake)
          }}
          className="mt-4 grid gap-3"
        >
          <label className="text-ink-800 text-sm">
            Demo stake
            <input
              type="number"
              min="1"
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] w-full rounded-md border px-3"
            />
          </label>
          <button
            type="submit"
            disabled={!valid}
            className="bg-primary-600 min-h-[44px] rounded-md px-4 font-semibold text-white disabled:opacity-50"
          >
            Preview pick
          </button>
        </form>
      ) : (
        <p role="status" className="text-ink-800 mt-3 font-medium">
          {formatMoney(receipt)} previewed on {pick.name}.
        </p>
      )}
    </Modal>
  )
}
const ticket = (m: TennisMatch) => ({
  market: previewMarket(m),
  onPick: (pick: TennisPick, close: () => void) => (
    <PreviewTicket key={pick.answerId} pick={pick} close={close} />
  ),
})
export default function TennisScenarios() {
  const [state, setState] = useState<Scenario>('Live'),
    match = example(state)
  const next: TennisMatch = {
    ...example('Scheduled'),
    id: 1002,
    eventId: 'bdl:atp:1002:103-104',
    round: 'SF',
    sides: [
      { ...example('Scheduled').sides[0], id: 103, name: 'Sol Ayala' },
      { ...example('Scheduled').sides[1], id: 104, name: 'Rin Becker' },
    ],
  }
  return (
    <section aria-label="Tennis gallery" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink-900 text-lg font-semibold">Tennis</h2>
        <label className="text-ink-700 text-sm">
          Scenario{' '}
          <select
            value={state}
            className="bg-canvas-0 border-ink-300 min-h-[44px] rounded-md border py-2 pl-2 pr-9"
            onChange={(e) => {
              const value = states.find((s) => s === e.target.value)
              if (value) setState(value)
            }}
          >
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {state === 'Draw' ? (
        <TennisDraw
          rounds={tennisDraw([example('Final'), next], 'atp', 40, 2026)}
          readStartedAt={now}
          now={now}
          tickets={new Map([[next.eventId, ticket(next)]])}
        />
      ) : (
        <TennisMatchCard
          key={state}
          match={match}
          readStartedAt={now - 60000}
          now={now}
          ticket={state === 'No linked market' ? undefined : ticket(match)}
        />
      )}
    </section>
  )
}
