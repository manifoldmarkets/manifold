import Link from 'next/link'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { contractPath, CPMMMultiContract, isMultiCpmm } from 'common/contract'
import { f1Season, RaceChampionship } from 'common/race-weekends'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { MarketLoadError } from 'web/components/sports/game-related-markets'
import { SportsAnswerBetDialog } from 'web/components/sports/sports-bet-panel'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

const TITLE_LEADERS = 5

const TITLE_LABEL: Record<RaceChampionship['kind'], string> = {
  drivers: "Drivers' championship",
  constructors: "Constructors' championship",
}

/**
 * The F1 page's title fight: the season's drivers' and constructors'
 * championship markets (picked by the API), each with its leaders to bet on.
 */
export function RaceChampionships(props: {
  championships: RaceChampionship[]
}) {
  const { championships } = props
  const ids = championships.map((c) => c.id)
  const { data, error, refresh } = useAPIGetter(
    'markets-by-ids',
    { ids },
    undefined,
    `f1-championships-${ids.join(',')}`,
    ids.length > 0
  )
  if (ids.length === 0) return null
  const byId = new Map((data ?? []).map((c) => [c.id, c]))
  const titles = championships.flatMap((c) => {
    const contract = byId.get(c.id)
    return contract && isMultiCpmm(contract)
      ? [{ kind: c.kind, contract: contract as CPMMMultiContract }]
      : []
  })
  if (data && titles.length === 0) return null
  return (
    <section
      aria-labelledby="f1-championship-heading"
      className="border-ink-200 bg-canvas-0 rounded-xl border px-4 py-3"
    >
      <Row className="items-center gap-2">
        <span aria-hidden>🏆</span>
        <h2
          id="f1-championship-heading"
          className="text-ink-900 text-sm font-semibold"
        >
          {f1Season(Date.now())} World Championship
        </h2>
      </Row>
      {error && !data ? (
        <MarketLoadError refresh={refresh} />
      ) : !data ? (
        <div
          role="status"
          className="mt-3 grid animate-pulse gap-6 sm:grid-cols-2"
        >
          <span className="sr-only">Loading the championship</span>
          {championships.map((c) => (
            <div key={c.id} aria-hidden className="space-y-2">
              <div className="bg-ink-100 h-3 w-1/2 rounded" />
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="bg-ink-100 h-6 rounded" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {titles.map((t) => (
            <TitleRace
              key={t.contract.id}
              kind={t.kind}
              contract={t.contract}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** One title market: its leaders as bars; a leader opens a bet on them. */
function TitleRace(props: {
  kind: RaceChampionship['kind']
  contract: CPMMMultiContract
}) {
  const { kind } = props
  const contract = useLiveContract(props.contract)
  const user = useUser()
  const [betAnswerId, setBetAnswerId] = useState<string>()
  const closed =
    !!contract.resolution ||
    (!!contract.closeTime && contract.closeTime < Date.now())
  const leaders = sortBy(
    contract.answers.filter((a) => !a.resolution),
    (a) => -(Number.isFinite(a.prob) ? a.prob : 0)
  ).slice(0, TITLE_LEADERS)
  const openBet = (answerId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location: 'sports f1 championship' })
    setBetAnswerId(answerId)
  }
  return (
    <Col className="min-w-0 gap-1">
      <Row className="items-baseline justify-between gap-2">
        <Link
          href={contractPath(contract)}
          className="text-ink-600 hover:text-primary-700 text-[11px] font-semibold uppercase tracking-wide"
        >
          {TITLE_LABEL[kind]}
        </Link>
        <span className="text-ink-400 text-[11px] tabular-nums">
          Ṁ{shortFormatNumber(contract.volume)} ·{' '}
          {shortFormatNumber(contract.uniqueBettorCount)} traders
        </span>
      </Row>
      {leaders.map((a) => {
        const pct = Math.round(
          (Number.isFinite(a.prob) ? Math.min(1, Math.max(0, a.prob)) : 0) * 100
        )
        return (
          <button
            key={a.id}
            type="button"
            disabled={closed}
            onClick={() => openBet(a.id)}
            aria-label={`Bet on ${a.text} (${pct}%)`}
            className="hover:bg-canvas-50 focus-visible:ring-primary-500 flex min-h-[36px] min-w-0 items-center gap-2 rounded-md px-1 text-left focus-visible:ring-2 disabled:cursor-default"
          >
            <span className="text-ink-900 w-28 shrink-0 truncate text-sm sm:w-36">
              {a.text}
            </span>
            <span className="bg-canvas-100 relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
              <span
                className="bg-primary-500 absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-ink-900 w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
              {pct}%
            </span>
          </button>
        )
      })}
      {contract.answers.length > leaders.length && (
        <Link
          href={contractPath(contract)}
          className="text-primary-700 self-end text-xs font-medium"
        >
          All {contract.answers.length} →
        </Link>
      )}
      {betAnswerId && (
        <SportsAnswerBetDialog
          contractId={contract.id}
          answerId={betAnswerId}
          onClose={() => setBetAnswerId(undefined)}
        />
      )}
    </Col>
  )
}
