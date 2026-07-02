import { useEffect, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { SelectorIcon } from '@heroicons/react/solid'
import { useUnfilledBetsAndBalanceByUserId } from 'client-common/hooks/use-bets'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Modal } from 'web/components/layout/modal'
import { useUser } from 'web/hooks/use-user'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { formatMoney } from 'common/util/format'
import { EXPIRATION_OPTIONS } from 'web/components/bet/order-expiration-options'
import { getContract, getAnswersForContracts } from 'common/supabase/contracts'
import { CPMMMultiContract } from 'common/contract'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Input } from 'web/components/widgets/input'
import { ProbabilitySlider } from 'web/components/widgets/probability-input'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { OrderBookPanel } from 'web/components/bet/order-book'
import { MultiBetDialog } from 'web/components/bet/bet-dialog'
import { getLimitBetReturns } from 'client-common/lib/bet'
import { SportsMatch, MatchOutcome, SPORTS_COLORS } from './sports-match-card'

const expirationOptions = EXPIRATION_OPTIONS.filter((o) => o.value !== -1)

// Knockout markets have no Draw answer, so they're plain binary-multi "versus"
// markets — bet on them with Manifold's standard versus modal (MultiBetDialog →
// BinaryMultiAnswersPanel) instead of the custom three-way sports panel below.
// Loads the contract by id the same way SportsBetPanel does.
export function SportsVersusBetDialog({
  contractId,
  onClose,
}: {
  contractId: string | undefined
  onClose: () => void
}) {
  const [contract, setContract] = useState<CPMMMultiContract | null>(null)

  useEffect(() => {
    if (!contractId) return
    let cancelled = false
    getContract(db, contractId)
      .then(async (c) => {
        if (cancelled || !c || c.mechanism !== 'cpmm-multi-1') return
        const answerMap = await getAnswersForContracts(db, [c.id])
        if (cancelled) return
        const multi = c as CPMMMultiContract
        setContract({
          ...multi,
          answers: answerMap[c.id] ?? multi.answers ?? [],
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [contractId])

  if (!contract) return null
  return (
    <MultiBetDialog
      contract={contract}
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
    />
  )
}

export function SportsBetPanel({
  match,
  initialOutcome,
  onClose,
}: {
  match: SportsMatch
  initialOutcome: MatchOutcome
  onClose: () => void
}) {
  const user = useUser()
  const [contract, setContract] = useState<CPMMMultiContract | null>(null)

  useEffect(() => {
    if (!match.contractId) return
    let cancelled = false
    getContract(db, match.contractId)
      .then(async (c) => {
        if (cancelled || !c || c.mechanism !== 'cpmm-multi-1') return
        const answerMap = await getAnswersForContracts(db, [c.id])
        if (cancelled) return
        const multi = c as CPMMMultiContract
        setContract({
          ...multi,
          answers: answerMap[c.id] ?? multi.answers ?? [],
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [match.contractId])

  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    match.contractId ?? '',
    (params) => api('bets', params),
    (params) => api('users/by-id/balance', params),
    useIsPageVisible
  )

  // The draw outcome isn't selectable on no-draw markets, so correct it up front.
  const initialSelected: MatchOutcome =
    initialOutcome === 'draw' && match.hasDraw === false
      ? 'teamA'
      : initialOutcome
  const [selected, setSelected] = useState<MatchOutcome>(initialSelected)
  const [betMode, setBetMode] = useState<'quick' | 'limit'>('quick')
  const [amount, setAmount] = useState<number | undefined>(10)
  const [error, setError] = useState<string | undefined>()
  const [limitProbInt, setLimitProbInt] = useState<number | undefined>(
    initialSelected === 'teamA'
      ? match.teamA.prob
      : initialSelected === 'teamB'
      ? match.teamB.prob
      : match.draw.prob
  )
  const [selectedExpiration, setSelectedExpiration] =
    usePersistentLocalState<number>(0, 'limit-order-expiration')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [betSide, setBetSide] = useState<'YES' | 'NO'>('YES')

  const outcomes: {
    key: MatchOutcome
    label: string
    prob: number
    color: string
    answerId: string | undefined
  }[] = [
    {
      key: 'teamA',
      label: `${match.teamA.flag} ${match.teamA.name}`.trim(),
      prob: match.teamA.prob,
      color: SPORTS_COLORS.teamA,
      answerId: match.teamAAnswerId,
    },
    ...(match.hasDraw !== false
      ? [
          {
            key: 'draw' as MatchOutcome,
            label: 'Draw',
            prob: match.draw.prob,
            color: SPORTS_COLORS.draw,
            answerId: match.drawAnswerId,
          },
        ]
      : []),
    {
      key: 'teamB',
      label: `${match.teamB.flag} ${match.teamB.name}`.trim(),
      prob: match.teamB.prob,
      color: SPORTS_COLORS.teamB,
      answerId: match.teamBAnswerId,
    },
  ]

  const current = outcomes.find((o) => o.key === selected) ?? outcomes[0]
  const betAmount = amount ?? 0
  const limitProb = limitProbInt ?? current.prob

  // Real CPMM preview — slippage- and arbitrage-aware, the same helper the
  // standard bet panels use. Requires the loaded contract + selected answer;
  // until then (or with no amount) we show placeholders instead of fake numbers.
  const answerToBuy = contract?.answers.find((a) => a.id === current.answerId)
  const betResult =
    contract && answerToBuy && betAmount > 0
      ? getLimitBetReturns(
          betSide,
          betAmount,
          unfilledBets,
          balanceByUserId,
          contract,
          { answers: contract.answers, answerToBuy },
          betMode === 'limit' ? limitProb / 100 : undefined,
          false
        )
      : undefined

  const payout = betResult ? Math.round(betResult.currentPayout) : undefined
  const returnPct = betResult
    ? (betResult.currentReturn * 100).toFixed(1)
    : undefined
  const probBeforePct = betResult
    ? Math.round(betResult.prob * 100)
    : current.prob
  const probAfterPct = betResult
    ? Math.round(betResult.probAfter * 100)
    : current.prob
  const calcError = betResult?.calculationError
  const filledNow = betResult ? Math.round(betResult.amount) : undefined
  const totalOrder = betResult ? Math.round(betResult.orderAmount) : undefined

  // Don't let the user try to bet on a market that's already resolved or past
  // its trading window — the server would reject it; surface it up front.
  const tradingClosed =
    !!contract &&
    (contract.isResolved ||
      (!!contract.closeTime && contract.closeTime < Date.now()))

  const setLimitProbClamped = (val: number | undefined) =>
    setLimitProbInt(
      val === undefined ? undefined : Math.min(99, Math.max(1, Math.round(val)))
    )

  const expiresMillisAfter =
    selectedExpiration > 0 && selectedExpiration !== -1
      ? selectedExpiration
      : undefined

  const expirationItems = expirationOptions.map((opt) => ({
    name: opt.label,
    onClick: () => setSelectedExpiration(opt.value),
  }))

  async function handleBet() {
    if (!user) {
      firebaseLogin()
      return
    }
    if (!match.contractId || !current.answerId) {
      if (match.marketUrl) window.open(match.marketUrl, '_blank')
      return
    }
    if (!betAmount || betAmount < 1) {
      toast.error('Enter a bet amount')
      return
    }
    if (
      betMode === 'limit' &&
      (!limitProbInt || limitProbInt < 1 || limitProbInt > 99)
    ) {
      toast.error('Enter a valid probability (1–99)')
      return
    }
    setIsSubmitting(true)
    try {
      await api('bet', {
        contractId: match.contractId,
        answerId: current.answerId,
        outcome: betSide,
        amount: betAmount,
        ...(betMode === 'limit'
          ? {
              limitProb: limitProb / 100,
              ...(expiresMillisAfter ? { expiresMillisAfter } : {}),
            }
          : {}),
      })
      toast.success(
        betMode === 'limit'
          ? `Limit order placed: Ṁ${betAmount} ${betSide} on ${current.label} at ${limitProb}%`
          : `Bet placed: Ṁ${betAmount} ${betSide} on ${current.label}`
      )
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to place bet')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLive = match.liveScore != null
  const liveMinute =
    isLive && match.liveScore!.minute != null
      ? match.liveScore!.minute === 'HT'
        ? 'HT'
        : `${match.liveScore!.minute}'`
      : null
  const hasLiveScore =
    isLive && match.liveScore!.home != null && match.liveScore!.away != null

  return (
    <Modal
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
      size="md"
    >
      <Col className="bg-canvas-0 text-ink-1000 w-full overflow-hidden rounded-xl">
        <Col className="items-center px-6 pb-4 pt-5 text-center">
          {match.marketUrl ? (
            <a
              href={match.marketUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-1000 hover:text-primary-600 text-xl font-semibold transition-colors"
            >
              {match.teamA.name} vs {match.teamB.name}
            </a>
          ) : (
            <span className="text-ink-1000 text-xl font-semibold">
              {match.teamA.name} vs {match.teamB.name}
            </span>
          )}
          {isLive && match.liveScore ? (
            <>
              <span
                className="mt-1 text-sm font-medium"
                style={{ color: '#16a34a' }}
              >
                ● {liveMinute ?? 'Live'}
              </span>
              {hasLiveScore && (
                <Row className="mt-1 items-center gap-3">
                  <span className="text-ink-1000 text-lg font-bold tabular-nums">
                    {match.liveScore.home}
                  </span>
                  <span className="text-ink-400 text-base">—</span>
                  <span className="text-ink-1000 text-lg font-bold tabular-nums">
                    {match.liveScore.away}
                  </span>
                </Row>
              )}
            </>
          ) : (
            <span className="text-ink-500 mt-0.5 text-sm">
              {match.closeDateLabel} · Kickoff {match.closeTime}
            </span>
          )}
        </Col>

        <Col className="border-ink-100 w-full items-center border-b px-6 py-4">
          <Col className="w-full gap-2">
            <Row className="bg-canvas-100 w-full items-stretch rounded-lg">
              {outcomes.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    setSelected(o.key)
                    setLimitProbClamped(o.prob)
                    setBetSide('YES')
                  }}
                  className={clsx(
                    'min-w-0 flex-1 truncate rounded-lg px-2 py-2.5 text-sm font-medium transition-colors',
                    selected === o.key
                      ? 'text-white'
                      : 'text-ink-500 hover:text-ink-700'
                  )}
                  style={
                    selected === o.key
                      ? { backgroundColor: o.color }
                      : undefined
                  }
                >
                  {o.label}
                </button>
              ))}
            </Row>
            <Row className="w-full">
              {outcomes.map((o) => (
                <div key={o.key} className="min-w-0 flex-1">
                  {selected === o.key && (
                    <Row className="gap-1 px-1">
                      <button
                        onClick={() => setBetSide('YES')}
                        className={clsx(
                          'flex-1 rounded border py-1 text-xs font-medium transition-colors',
                          betSide === 'YES'
                            ? 'border-teal-500 text-teal-500'
                            : 'border-ink-300 text-ink-400'
                        )}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setBetSide('NO')}
                        className={clsx(
                          'flex-1 rounded border py-1 text-xs font-medium transition-colors',
                          betSide === 'NO'
                            ? 'border-scarlet-600 text-scarlet-600'
                            : 'border-ink-300 text-ink-400'
                        )}
                      >
                        No
                      </button>
                    </Row>
                  )}
                </div>
              ))}
            </Row>
          </Col>
        </Col>

        <Col className="gap-5 px-6 pb-6 pt-5">
          <Row className="items-center justify-between">
            <span className="text-ink-600 text-sm">Bet amount</span>
            <Row className="gap-3">
              {(['quick', 'limit'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setBetMode(mode)}
                  className={clsx(
                    'text-sm capitalize transition-colors',
                    betMode === mode
                      ? 'text-ink-1000 font-bold'
                      : 'text-ink-400 hover:text-ink-600 font-medium'
                  )}
                >
                  {mode === 'quick' ? 'Quick' : 'Limit'}
                </button>
              ))}
            </Row>
          </Row>

          <BuyAmountInput
            parentClassName="!max-w-full"
            amount={amount}
            onChange={setAmount}
            error={error}
            setError={setError}
            disabled={isSubmitting}
            showSlider
            binaryOutcome="YES"
          />

          {betMode === 'limit' && (
            <>
              <Col className="gap-1">
                <Row className="items-baseline justify-between">
                  <span className="text-ink-600 text-sm">Probability (%)</span>
                  <span className="text-ink-600 text-xs">
                    Current: {probBeforePct}%
                  </span>
                </Row>
                <label className="relative w-full">
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    className="h-[60px] w-full !text-xl"
                    value={limitProbInt ?? ''}
                    onChange={(e) =>
                      setLimitProbClamped(
                        e.target.value === ''
                          ? undefined
                          : Number(e.target.value)
                      )
                    }
                  />
                  <Row className="absolute right-2 top-3.5 gap-1.5">
                    {([-5, -1, 1, 5] as const).map((delta) => (
                      <button
                        key={delta}
                        className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm"
                        onClick={() =>
                          setLimitProbClamped(
                            (limitProbInt ?? current.prob) + delta
                          )
                        }
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </Row>
                </label>
                <ProbabilitySlider
                  prob={limitProbInt}
                  onProbChange={setLimitProbClamped}
                  disabled={isSubmitting}
                />
              </Col>

              <DropdownMenu
                buttonContent={
                  <Row className="items-center gap-1">
                    <span>
                      {expirationOptions.find(
                        (o) => o.value === selectedExpiration
                      )?.label ?? expirationOptions[0].label}
                    </span>
                    <SelectorIcon className="text-ink-400 h-4 w-4" />
                  </Row>
                }
                closeOnClick
                items={expirationItems}
                buttonClass="text-ink-600 hover:text-ink-900 p-0 bg-transparent text-sm"
                menuWidth="w-48"
              />
            </>
          )}

          <Col className="gap-1.5">
            {betMode === 'quick' ? (
              <>
                <Row className="items-baseline justify-between">
                  <span className="text-ink-600 text-sm">New probability</span>
                  <Row className="items-baseline gap-1.5">
                    <span className="text-ink-1000 text-base font-semibold">
                      {betResult ? `${probAfterPct}%` : '—'}
                    </span>
                    {betResult && probAfterPct !== probBeforePct && (
                      <span
                        className={clsx(
                          'text-sm',
                          probAfterPct > probBeforePct
                            ? 'text-teal-500'
                            : 'text-scarlet-500'
                        )}
                      >
                        {probAfterPct > probBeforePct
                          ? `↑${probAfterPct - probBeforePct}%`
                          : `↓${probBeforePct - probAfterPct}%`}
                      </span>
                    )}
                  </Row>
                </Row>
                <Row className="items-baseline justify-between">
                  <span className="text-ink-600 text-sm">To win</span>
                  <Row className="items-baseline gap-1.5">
                    <span className="text-ink-1000 text-base font-semibold">
                      {payout !== undefined
                        ? `Ṁ${payout.toLocaleString()}`
                        : '—'}
                    </span>
                    {returnPct !== undefined && (
                      <span className="text-sm text-teal-500">
                        +{returnPct}%
                      </span>
                    )}
                  </Row>
                </Row>
              </>
            ) : (
              <>
                {filledNow !== undefined && totalOrder !== undefined && (
                  <Row className="items-baseline justify-between">
                    <span className="text-ink-600 text-sm">
                      <span
                        className={clsx(
                          'font-medium',
                          betSide === 'YES'
                            ? 'text-yes-500'
                            : 'text-scarlet-600'
                        )}
                      >
                        {betSide}
                      </span>{' '}
                      filled now
                    </span>
                    <span className="text-ink-1000 text-sm font-medium">
                      Ṁ{filledNow.toLocaleString()} of Ṁ
                      {totalOrder.toLocaleString()}
                    </span>
                  </Row>
                )}
                <Row className="items-baseline justify-between">
                  <span className="text-ink-600 text-sm">Max payout</span>
                  <Row className="items-baseline gap-1.5">
                    <span className="text-ink-1000 text-base font-semibold">
                      {payout !== undefined
                        ? `Ṁ${payout.toLocaleString()}`
                        : '—'}
                    </span>
                    {returnPct !== undefined && (
                      <span className="text-sm text-teal-500">
                        +{returnPct}%
                      </span>
                    )}
                  </Row>
                </Row>
              </>
            )}
            {calcError && (
              <span className="text-sm text-red-500">{calcError}</span>
            )}
          </Col>

          {contract && (
            <OrderBookPanel
              contract={contract}
              limitBets={unfilledBets.filter(
                (b) => b.answerId === current.answerId
              )}
              answer={contract.answers.find((a) => a.id === current.answerId)}
            />
          )}

          <button
            onClick={handleBet}
            disabled={
              isSubmitting ||
              !betAmount ||
              betAmount < 1 ||
              !!error ||
              !!calcError ||
              tradingClosed
            }
            className="w-full rounded-lg py-3 text-base font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: current.color }}
          >
            {tradingClosed
              ? 'Trading closed'
              : isSubmitting
              ? 'Placing bet…'
              : user
              ? betMode === 'quick'
                ? payout !== undefined
                  ? `Buy ${
                      current.label
                    } ${betSide} to win Ṁ${payout.toLocaleString()}`
                  : `Buy ${current.label} ${betSide}`
                : `Buy ${current.label} ${betSide} · Ṁ${betAmount} at ${limitProb}%`
              : 'Sign in to bet'}
          </button>

          <Row className="items-center justify-between">
            <span className="text-ink-400 text-sm">
              {user
                ? `Your mana balance ${formatMoney(user.balance)}`
                : 'Sign in to place bets'}
            </span>
            {match.marketUrl && (
              <a
                href={match.marketUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-400 hover:text-yes-500 text-sm transition-colors"
              >
                View market →
              </a>
            )}
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
