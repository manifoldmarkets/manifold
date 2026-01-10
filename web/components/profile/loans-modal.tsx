import { useState, useEffect } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { User } from 'common/user'
import clsx from 'clsx'
import { ENV_CONFIG, TRADE_TERM } from 'common/envs/constants'
import {
  LOAN_DAILY_INTEREST_RATE,
  MAX_LOAN_NET_WORTH_PERCENT,
  DAILY_LOAN_NET_WORTH_PERCENT,
  MAX_MARKET_LOAN_NET_WORTH_PERCENT,
  MAX_MARKET_LOAN_POSITION_PERCENT,
} from 'common/loans'
import { ANNUAL_INTEREST_RATE } from 'common/economy'
import { useIsEligibleForLoans } from 'web/hooks/use-is-eligible-for-loans'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import {
  formatMoney,
  formatMoneyShort,
  formatPercent,
} from 'common/util/format'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { Button } from 'web/components/buttons/button'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import {
  BetSlider,
  LARGE_SLIDER_VALUES,
  SMALL_SLIDER_VALUES,
  LARGE_SLIDER_VALUE_LABELS,
  SMALL_SLIDER_VALUE_LABELS,
} from 'web/components/bet/bet-slider'
import { Slider } from 'web/components/widgets/slider'
import { formatWithToken } from 'common/util/format'

export function LoansModal(props: {
  user: User
  isOpen: boolean
  setOpen: (open: boolean) => void
  refreshPortfolio?: () => void
  contractId?: string
  answerId?: string
}) {
  const { isOpen, user, setOpen, refreshPortfolio, contractId, answerId } =
    props
  const [loaning, setLoaning] = useState(false)
  const [repaying, setRepaying] = useState(false)
  const [loanAmount, setLoanAmount] = useState<number | undefined>()
  const [repaymentAmount, setRepaymentAmount] = useState<number | undefined>()
  const [requestLoanError, setRequestLoanError] = useState<string | undefined>()
  const [repayLoanError, setRepayLoanError] = useState<string | undefined>()
  const { latestPortfolio, isEligible } = useIsEligibleForLoans(user.id)
  const { data: loanData, refresh: refetchLoanData } = useAPIGetter(
    'get-next-loan-amount',
    { userId: user.id }
  )
  const { data: totalLoanData, refresh: refetchTotalLoan } = useAPIGetter(
    'get-total-loan-amount',
    {}
  )
  const { data: marketLoanData, refresh: refetchMarketLoan } = useAPIGetter(
    'get-market-loan-max',
    contractId ? { contractId, answerId } : undefined,
    undefined,
    undefined,
    !!contractId
  )

  const maxGeneralLoan = loanData?.maxGeneralLoan ?? 0
  const currentGeneralLoan = loanData?.currentLoan ?? 0
  const availableGeneralLoan = loanData?.available ?? 0
  const dailyLimit = loanData?.dailyLimit ?? 0
  const todayLoans = loanData?.todayLoans ?? 0
  const availableToday = loanData?.availableToday ?? 0
  const totalOwed = totalLoanData?.totalOwed ?? 0
  const hasOutstandingLoan = (latestPortfolio?.loanTotal ?? 0) > 0

  // Market-specific loan data
  const maxMarketLoan =
    contractId && marketLoanData && 'maxLoan' in marketLoanData
      ? marketLoanData.maxLoan
      : 0
  const currentMarketLoan =
    contractId && marketLoanData && 'currentLoan' in marketLoanData
      ? marketLoanData.currentLoan
      : 0
  const availableMarketLoan =
    contractId && marketLoanData && 'available' in marketLoanData
      ? marketLoanData.available
      : 0
  const netWorthLimit =
    contractId && marketLoanData && 'netWorthLimit' in marketLoanData
      ? marketLoanData.netWorthLimit
      : 0
  const positionLimit =
    contractId && marketLoanData && 'positionLimit' in marketLoanData
      ? marketLoanData.positionLimit
      : 0
  const totalPositionValue =
    contractId && marketLoanData && 'totalPositionValue' in marketLoanData
      ? marketLoanData.totalPositionValue
      : 0
  const marketEligible =
    contractId && marketLoanData && 'eligible' in marketLoanData
      ? marketLoanData.eligible
      : true
  const marketEligibilityReason =
    contractId && marketLoanData && 'eligibilityReason' in marketLoanData
      ? marketLoanData.eligibilityReason
      : undefined
  // Aggregate limits (50% of net worth across all markets)
  const aggregateLimit =
    contractId && marketLoanData && 'aggregateLimit' in marketLoanData
      ? marketLoanData.aggregateLimit
      : 0
  const totalLoanAllMarkets =
    contractId && marketLoanData && 'totalLoanAllMarkets' in marketLoanData
      ? marketLoanData.totalLoanAllMarkets
      : 0
  const availableAggregate =
    contractId && marketLoanData && 'availableAggregate' in marketLoanData
      ? marketLoanData.availableAggregate
      : 0
  // Daily limits (10% of net worth per day)
  const marketDailyLimit =
    contractId && marketLoanData && 'dailyLimit' in marketLoanData
      ? marketLoanData.dailyLimit
      : 0
  const marketTodayLoans =
    contractId && marketLoanData && 'todayLoans' in marketLoanData
      ? marketLoanData.todayLoans
      : 0
  const marketAvailableToday =
    contractId && marketLoanData && 'availableToday' in marketLoanData
      ? marketLoanData.availableToday
      : 0

  // Determine which limit is binding for market loans
  const availablePerMarket = Math.max(0, maxMarketLoan - currentMarketLoan)
  const isDailyLimitBinding =
    marketAvailableToday < availablePerMarket &&
    marketAvailableToday < availableAggregate &&
    marketAvailableToday >= 0
  const isAggregateLimitBinding =
    !isDailyLimitBinding &&
    availableAggregate < availablePerMarket &&
    availableAggregate >= 0
  const isNetWorthLimitBinding =
    !isDailyLimitBinding &&
    !isAggregateLimitBinding &&
    netWorthLimit <= positionLimit
  const bindingLimitReason = isDailyLimitBinding
    ? `${formatPercent(DAILY_LOAN_NET_WORTH_PERCENT)} daily limit`
    : isAggregateLimitBinding
    ? `${formatPercent(MAX_LOAN_NET_WORTH_PERCENT)} total borrowing limit`
    : isNetWorthLimitBinding
    ? `${formatPercent(MAX_MARKET_LOAN_NET_WORTH_PERCENT)} of net worth`
    : `${formatPercent(MAX_MARKET_LOAN_POSITION_PERCENT)} of position value`

  const requestLoan = async (
    amountOverride?: number,
    closeOnSuccess?: boolean
  ) => {
    let amountToRequest = amountOverride ?? loanAmount
    if (!amountToRequest || amountToRequest <= 0) {
      toast.error('Please enter a valid loan amount')
      return
    }

    // Round input to whole number for display
    amountToRequest = Math.floor(amountToRequest)

    // Clamp to maximum available (use actual max, not rounded)
    const maxAvailable = isMarketSpecific
      ? availableMarketLoan
      : requestLoanMaxActual

    // If user selected the rounded max (or slider is at max), send the actual max
    if (amountToRequest === requestLoanMax && requestLoanMax < maxAvailable) {
      amountToRequest = maxAvailable
    } else if (amountToRequest > maxAvailable) {
      amountToRequest = maxAvailable
      setLoanAmount(Math.floor(maxAvailable))
    } else {
      // For display, keep the rounded amount
      setLoanAmount(amountToRequest)
    }

    setLoaning(true)
    try {
      const res = await api('request-loan', {
        amount: amountToRequest,
        contractId,
        answerId,
      })
      if (res) {
        toast.success(`Loan received! You borrowed ${formatMoney(res.amount)}`)
        setLoanAmount(undefined)
        refetchLoanData()
        refetchTotalLoan()
        if (contractId) {
          refetchMarketLoan()
        }
        if (closeOnSuccess) {
          setOpen(false)
        }
        track('request loan', {
          amount: res.amount,
          contractId,
          answerId,
        })
      }
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error requesting loan')
    } finally {
      setLoaning(false)
      if (refreshPortfolio) {
        setTimeout(refreshPortfolio, 1000)
      }
    }
  }

  const repayLoan = async () => {
    if (!repaymentAmount || repaymentAmount <= 0) {
      toast.error('Please enter a valid repayment amount')
      return
    }

    // Round input to whole number for display
    let amountToRepay = Math.floor(repaymentAmount)

    // Clamp to maximum available (use actual max, not rounded)
    const maxAvailable = paybackMaxActual

    // If user selected the rounded max (or slider is at max), send the actual max
    if (amountToRepay === paybackMax && paybackMax < maxAvailable) {
      amountToRepay = maxAvailable
    } else if (amountToRepay > maxAvailable) {
      amountToRepay = maxAvailable
      setRepaymentAmount(Math.floor(maxAvailable))
    } else {
      // For display, keep the rounded amount
      setRepaymentAmount(amountToRepay)
    }

    setRepaying(true)
    try {
      const res = await api('repay-loan', {
        amount: amountToRepay,
        contractId,
        answerId,
      })
      if (res) {
        toast.success(
          `Repaid ${formatMoney(res.repaid)}. Remaining: ${formatMoney(
            res.remainingLoan
          )}`
        )
        setRepaymentAmount(undefined)
        refetchTotalLoan()
        refetchLoanData()
        if (contractId) {
          refetchMarketLoan()
        }
        track('repay loan', {
          amount: res.repaid,
          remaining: res.remainingLoan,
          contractId,
          answerId,
        })
      }
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error repaying loan')
    } finally {
      setRepaying(false)
      if (refreshPortfolio) {
        setTimeout(refreshPortfolio, 1000)
      }
    }
  }

  useEffect(() => {
    if (isOpen && !user.hasSeenLoanModal)
      api('me/update', { hasSeenLoanModal: true })
  }, [isOpen, user.hasSeenLoanModal])

  const isMarketSpecific = !!contractId

  // Store actual max (before rounding) for use in API calls and validation
  const requestLoanMaxActual = Math.min(availableGeneralLoan, availableToday)
  // Round down for display/slider max
  const requestLoanMax = Math.floor(requestLoanMaxActual)

  // Store actual max (before rounding) for use in API calls and validation
  const paybackMaxActual = Math.min(totalOwed, user.balance)
  // Round down for display/slider max
  const paybackMax = Math.floor(paybackMaxActual)

  // Create filtered slider values that respect the max (rounded down)
  // Ensures the rounded max is included as the last value
  const createFilteredSliderValues = (
    max: number,
    useSmallAmounts: boolean
  ) => {
    const baseValues = useSmallAmounts
      ? SMALL_SLIDER_VALUES
      : LARGE_SLIDER_VALUES
    const filtered = baseValues.filter((v) => v <= max)
    // Ensure the rounded max is included as the last value (if it's not already there)
    if (filtered.length === 0 || filtered[filtered.length - 1] !== max) {
      filtered.push(max)
    }
    return filtered
  }

  // Check if user has lots of money to determine slider size
  const hasLotsOfMoney =
    !!latestPortfolio &&
    latestPortfolio.balance + latestPortfolio.investmentValue > 10000

  // Market-specific loan max values
  const marketLoanMaxActual = availableMarketLoan
  const marketLoanMax = Math.floor(marketLoanMaxActual)

  // Create filtered slider values for request loan
  const requestLoanSliderValues =
    !isMarketSpecific && requestLoanMax > 0
      ? createFilteredSliderValues(requestLoanMax, !hasLotsOfMoney)
      : []

  // Create filtered slider values for market-specific request loan
  const marketRequestLoanSliderValues =
    isMarketSpecific && marketLoanMax > 0
      ? createFilteredSliderValues(marketLoanMax, !hasLotsOfMoney)
      : []

  // Create filtered slider values for payback
  const paybackSliderValues =
    !isMarketSpecific && paybackMax > 0
      ? createFilteredSliderValues(paybackMax, !hasLotsOfMoney)
      : []

  // Market-specific payback max (repay up to current loan or balance)
  const marketPaybackMaxActual = Math.min(currentMarketLoan, user.balance)
  const marketPaybackMax = Math.floor(marketPaybackMaxActual)

  // Create filtered slider values for market-specific payback
  const marketPaybackSliderValues =
    isMarketSpecific && marketPaybackMax > 0
      ? createFilteredSliderValues(marketPaybackMax, !hasLotsOfMoney)
      : []

  // Get slider index for request loan
  const getRequestLoanSliderIndex = (amount: number | undefined) => {
    if (!amount || requestLoanSliderValues.length === 0) return 0
    // If amount is at or above the rounded max, show slider at max position
    if (amount >= requestLoanMax) {
      return requestLoanSliderValues.length - 1
    }
    return requestLoanSliderValues.findLastIndex((v) => amount >= v) || 0
  }

  // Get slider index for market-specific request loan
  const getMarketRequestLoanSliderIndex = (amount: number | undefined) => {
    if (!amount || marketRequestLoanSliderValues.length === 0) return 0
    // If amount is at or above the rounded max, show slider at max position
    if (amount >= marketLoanMax) {
      return marketRequestLoanSliderValues.length - 1
    }
    return marketRequestLoanSliderValues.findLastIndex((v) => amount >= v) || 0
  }

  // Get slider index for payback
  const getPaybackSliderIndex = (amount: number | undefined) => {
    if (!amount || paybackSliderValues.length === 0) return 0
    // If amount is at or above the rounded max, show slider at max position
    if (amount >= paybackMax) {
      return paybackSliderValues.length - 1
    }
    return paybackSliderValues.findLastIndex((v) => amount >= v) || 0
  }

  // Get slider index for market-specific payback
  const getMarketPaybackSliderIndex = (amount: number | undefined) => {
    if (!amount || marketPaybackSliderValues.length === 0) return 0
    // If amount is at or above the rounded max, show slider at max position
    if (amount >= marketPaybackMax) {
      return marketPaybackSliderValues.length - 1
    }
    return marketPaybackSliderValues.findLastIndex((v) => amount >= v) || 0
  }

  // Create marks for slider (filtered labels)
  const createSliderMarks = (
    values: number[],
    labels: number[],
    token: 'M$' | 'CASH' = 'M$'
  ) => {
    return labels
      .filter((label) => label <= (values[values.length - 1] ?? 0))
      .map((label) => {
        const index = values.findIndex((v) => v === label)
        return {
          value: index !== -1 ? index : 0,
          label: formatWithToken({ amount: label, token, short: true }),
        }
      })
  }

  const requestLoanSliderMarks =
    requestLoanSliderValues.length > 0
      ? createSliderMarks(
          requestLoanSliderValues,
          hasLotsOfMoney ? LARGE_SLIDER_VALUE_LABELS : SMALL_SLIDER_VALUE_LABELS
        )
      : []

  const marketRequestLoanSliderMarks =
    marketRequestLoanSliderValues.length > 0
      ? createSliderMarks(
          marketRequestLoanSliderValues,
          hasLotsOfMoney ? LARGE_SLIDER_VALUE_LABELS : SMALL_SLIDER_VALUE_LABELS
        )
      : []

  const paybackSliderMarks =
    paybackSliderValues.length > 0
      ? createSliderMarks(
          paybackSliderValues,
          hasLotsOfMoney ? LARGE_SLIDER_VALUE_LABELS : SMALL_SLIDER_VALUE_LABELS
        )
      : []

  const marketPaybackSliderMarks =
    marketPaybackSliderValues.length > 0
      ? createSliderMarks(
          marketPaybackSliderValues,
          hasLotsOfMoney ? LARGE_SLIDER_VALUE_LABELS : SMALL_SLIDER_VALUE_LABELS
        )
      : []

  return (
    <Modal open={isOpen} setOpen={setOpen} size="mdlg">
      <Col className="bg-canvas-0 text-ink-1000 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <Col className="border-ink-200 gap-3 border-b px-6 pb-4 pt-6">
          <Row className="items-center gap-3">
            <div className="text-4xl">🏦</div>
            <Col className="gap-0.5">
              <h2 className="text-ink-900 text-xl font-semibold">
                Margin loans
              </h2>
              <p className="text-ink-600 text-sm">
                {isMarketSpecific
                  ? 'Borrow against this specific market'
                  : 'Leverage your positions with loans'}
              </p>
            </Col>
          </Row>
        </Col>

        {/* Key Metrics */}
        <Row className="border-ink-100 gap-3 border-b px-6 py-4">
          {!isMarketSpecific && (
            <Col className="flex-1 gap-1">
              <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
                Available today
              </span>
              <span className="text-primary-600 text-2xl font-semibold">
                {formatMoney(availableToday)}
              </span>
              <span className="text-ink-500 text-xs">
                Daily limit: {formatMoney(dailyLimit)} • Total max:{' '}
                {formatMoney(maxGeneralLoan)}
              </span>
            </Col>
          )}
          <Col
            className={clsx(
              'flex-1 gap-1',
              !isMarketSpecific && 'border-ink-200 border-l pl-3'
            )}
          >
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
              {isMarketSpecific
                ? 'Loan on this market'
                : 'Total outstanding loan'}
            </span>
            <span className="text-ink-900 text-2xl font-semibold">
              {isMarketSpecific
                ? formatMoney(currentMarketLoan)
                : totalOwed > 0
                ? formatMoney(totalOwed)
                : formatMoney(0)}
            </span>
            {isMarketSpecific && currentMarketLoan > 0 && (
              <span className="text-ink-500 text-xs">
                Max: {formatMoney(maxMarketLoan)} ({bindingLimitReason})
              </span>
            )}
          </Col>
          {isMarketSpecific && (
            <Col className="border-ink-200 flex-1 gap-1 border-l pl-3">
              <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
                Available
              </span>
              {marketEligible ? (
                <>
                  <span className="text-primary-600 text-2xl font-semibold">
                    {formatMoney(availableMarketLoan)}
                  </span>
                  <span className="text-ink-500 text-xs">
                    Max: {formatMoney(maxMarketLoan)} ({bindingLimitReason})
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-semibold text-amber-600">
                    Not eligible
                  </span>
                  <span className="text-ink-500 text-xs">
                    {marketEligibilityReason ?? 'Market criteria not met'}
                  </span>
                </>
              )}
            </Col>
          )}
        </Row>

        {/* Quick Loans Section */}
        {!isMarketSpecific && (
          <div className="border-ink-200 border-t px-6 py-4">
            <Col className="gap-3">
              <h3 className="text-ink-900 mb-1 text-sm font-semibold">
                One-click loans
              </h3>
              <Row className="flex-wrap gap-2">
                {[50, 100, 1000, 5000].map((quickAmount) => {
                  const maxAvailable = Math.min(
                    availableGeneralLoan,
                    availableToday
                  )
                  const isDisabled =
                    loaning ||
                    quickAmount > maxAvailable ||
                    quickAmount > availableGeneralLoan ||
                    quickAmount > availableToday
                  const isLoading = loaning && loanAmount === quickAmount

                  return (
                    <button
                      key={quickAmount}
                      disabled={isDisabled || isLoading}
                      onClick={() => {
                        if (!isDisabled && !isLoading) {
                          requestLoan(quickAmount, true)
                        }
                      }}
                      className={clsx(
                        'group relative min-w-[80px] flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold',
                        'bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500',
                        'dark:from-yellow-400 dark:via-yellow-500 dark:to-amber-600',
                        'text-yellow-900 shadow-lg shadow-yellow-500/30',
                        'border-2 border-yellow-500/50 dark:border-yellow-600/50',
                        'transition-all duration-200 ease-out',
                        'transform hover:scale-105 hover:border-yellow-400 hover:shadow-xl hover:shadow-yellow-500/50',
                        'dark:hover:border-yellow-500',
                        'active:scale-95 active:shadow-md active:brightness-95',
                        'disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-lg',
                        'overflow-hidden',
                        'before:pointer-events-none before:absolute before:inset-0 before:rounded-lg',
                        'before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent',
                        'before:translate-x-[-200%] before:skew-x-12',
                        'hover:before:translate-x-[200%] hover:before:transition-transform hover:before:duration-1000 hover:before:ease-out',
                        isLoading && 'pointer-events-none'
                      )}
                    >
                      <span className="relative z-10">
                        {formatMoney(quickAmount)}
                      </span>
                    </button>
                  )
                })}
              </Row>
            </Col>
          </div>
        )}

        {/* Information Section */}
        <Col className="gap-4 px-6 py-5">
          <Col className="gap-3">
            <h3 className="text-ink-900 text-sm font-semibold">How it works</h3>
            <Col className="text-ink-700 gap-3 text-sm">
              {isMarketSpecific ? (
                <>
                  <div>
                    <p className="text-ink-900 mb-1 font-medium">
                      Market-specific loans
                    </p>
                    <p>
                      Borrow up to{' '}
                      {formatPercent(MAX_MARKET_LOAN_POSITION_PERCENT)} of your
                      position value on this market. Total borrowing is capped
                      at {formatPercent(MAX_MARKET_LOAN_NET_WORTH_PERCENT)} of
                      your net worth on this market or{' '}
                      {formatPercent(MAX_LOAN_NET_WORTH_PERCENT)} of your net
                      worth across all markets.
                    </p>
                    {totalPositionValue > 0 && (
                      <p className="text-ink-500 mt-1 text-xs">
                        Your position: {formatMoney(totalPositionValue)} • Net
                        worth limit: {formatMoney(netWorthLimit)} • Position
                        limit: {formatMoney(positionLimit)}
                        {isAggregateLimitBinding && (
                          <>
                            {' '}
                            •{' '}
                            <span className="text-amber-600">
                              Aggregate limit reached (
                              {formatMoney(availableAggregate)} remaining)
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-ink-900 mb-1 font-medium">
                      General loans
                    </p>
                    <p>
                      Borrow up to {formatPercent(MAX_LOAN_NET_WORTH_PERCENT)}{' '}
                      of your net worth total, with a daily limit of{' '}
                      {formatPercent(DAILY_LOAN_NET_WORTH_PERCENT)} per day. The
                      loan is distributed proportionally across all your
                      unresolved market positions.
                    </p>
                  </div>
                </>
              )}
              <div>
                <p className="text-ink-900 mb-1 font-medium">Interest rate</p>
                <p>
                  {LOAN_DAILY_INTEREST_RATE * 100}% per day accrues on your
                  outstanding loan balance. Principal + interest is
                  automatically deducted when the question resolves or you sell.
                </p>
              </div>
            </Col>
          </Col>

          <div className="bg-ink-200 h-px" />

          <Col className="gap-2">
            <div className="bg-primary-50 border-primary-200 flex items-center gap-2 rounded-lg border p-3">
              <span className="text-lg">💡</span>
              <p className="text-primary-900 text-sm">
                <span className="font-medium">
                  You're earning {formatPercent(ANNUAL_INTEREST_RATE)} annual
                  interest
                </span>{' '}
                on all your open positions, including trades made with loans.
              </p>
            </div>
          </Col>
        </Col>

        {/* Loan Request Section */}
        <div className="border-ink-200 bg-canvas-50 border-t px-6 py-5">
          <Col className="gap-4">
            <div>
              <h3 className="text-ink-900 mb-1 text-base font-semibold">
                {isMarketSpecific ? 'Request market loan' : 'Request loan'}
              </h3>
              <p className="text-ink-600 text-xs">
                {isMarketSpecific
                  ? 'Enter the amount you want to borrow against this market.'
                  : 'Enter the amount you want to borrow. It will be distributed proportionally across your positions.'}
              </p>
            </div>
            {isMarketSpecific && !marketEligible ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  This market is not eligible for new loans
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  {marketEligibilityReason ??
                    'Market must be listed, ranked, have more than 10 traders, and be at least 24 hours old.'}
                </p>
              </div>
            ) : (
              <Col className="gap-3">
                <BuyAmountInput
                  parentClassName="max-w-full"
                  amount={loanAmount ? Math.floor(loanAmount) : undefined}
                  onChange={(newAmount) => {
                    if (!newAmount || newAmount <= 0) {
                      setLoanAmount(undefined)
                      return
                    }
                    // Round to whole number
                    const roundedAmount = Math.floor(newAmount)
                    const maxAvailable = isMarketSpecific
                      ? availableMarketLoan
                      : requestLoanMaxActual
                    // Clamp to max available
                    if (roundedAmount > maxAvailable) {
                      setLoanAmount(Math.floor(maxAvailable))
                    } else {
                      setLoanAmount(roundedAmount)
                    }
                  }}
                  error={requestLoanError}
                  setError={setRequestLoanError}
                  disabled={loaning}
                  maximumAmount={
                    isMarketSpecific
                      ? availableMarketLoan
                      : requestLoanMaxActual
                  }
                  showSlider={false}
                  token="M$"
                />
                {!isMarketSpecific && requestLoanSliderValues.length > 0 && (
                  <Slider
                    className="mt-3"
                    min={0}
                    max={requestLoanSliderValues.length - 1}
                    amount={getRequestLoanSliderIndex(loanAmount)}
                    onChange={(index) => {
                      const newAmount = requestLoanSliderValues[index] ?? 0
                      // Store rounded amount for display
                      // If user selects the max slider value (rounded max), we'll send actual max in API call
                      setLoanAmount(Math.floor(newAmount))
                    }}
                    step={1}
                    disabled={loaning}
                    color="green"
                    marks={requestLoanSliderMarks}
                  />
                )}
                {isMarketSpecific &&
                  marketRequestLoanSliderValues.length > 0 && (
                    <Slider
                      className="mt-3"
                      min={0}
                      max={marketRequestLoanSliderValues.length - 1}
                      amount={getMarketRequestLoanSliderIndex(loanAmount)}
                      onChange={(index) => {
                        const newAmount =
                          marketRequestLoanSliderValues[index] ?? 0
                        setLoanAmount(Math.floor(newAmount))
                      }}
                      step={1}
                      disabled={loaning}
                      color="green"
                      marks={marketRequestLoanSliderMarks}
                    />
                  )}
                <Button
                  color="green"
                  size="xl"
                  loading={loaning}
                  disabled={loaning || !loanAmount || loanAmount <= 0}
                  onClick={() => requestLoan()}
                  className="w-full"
                >
                  Request Loan
                </Button>
              </Col>
            )}
          </Col>
        </div>

        {/* Repayment Section */}
        {(isMarketSpecific ? currentMarketLoan > 0 : hasOutstandingLoan) && (
          <div className="border-ink-200 bg-canvas-50 border-t px-6 py-5">
            <Col className="gap-4">
              <div>
                <h3 className="text-ink-900 mb-1 text-base font-semibold">
                  Pay back loan
                </h3>
                <p className="text-ink-600 text-xs">
                  {isMarketSpecific
                    ? 'Repay any amount of your loan on this market.'
                    : 'Repay any amount of your outstanding loan. Payments are distributed proportionally by loan amount across all markets.'}
                </p>
              </div>
              <Col className="gap-3">
                <BuyAmountInput
                  parentClassName="max-w-full"
                  amount={
                    repaymentAmount ? Math.floor(repaymentAmount) : undefined
                  }
                  onChange={(newAmount) => {
                    if (!newAmount || newAmount <= 0) {
                      setRepaymentAmount(undefined)
                      return
                    }
                    // Round to whole number
                    const roundedAmount = Math.floor(newAmount)
                    const maxAvailable = isMarketSpecific
                      ? marketPaybackMaxActual
                      : paybackMaxActual
                    // Clamp to max available
                    if (roundedAmount > maxAvailable) {
                      setRepaymentAmount(Math.floor(maxAvailable))
                    } else {
                      setRepaymentAmount(roundedAmount)
                    }
                  }}
                  error={repayLoanError}
                  setError={setRepayLoanError}
                  disabled={repaying}
                  maximumAmount={
                    isMarketSpecific ? marketPaybackMaxActual : paybackMaxActual
                  }
                  showSlider={false}
                  token="M$"
                />
                {!isMarketSpecific && paybackSliderValues.length > 0 && (
                  <Slider
                    className="mt-3"
                    min={0}
                    max={paybackSliderValues.length - 1}
                    amount={getPaybackSliderIndex(repaymentAmount)}
                    onChange={(index) => {
                      const newAmount = paybackSliderValues[index] ?? 0
                      // Store rounded amount for display
                      // If user selects the max slider value (rounded max), we'll send actual max in API call
                      setRepaymentAmount(Math.floor(newAmount))
                    }}
                    step={1}
                    disabled={repaying}
                    color="indigo"
                    marks={paybackSliderMarks}
                  />
                )}
                {isMarketSpecific && marketPaybackSliderValues.length > 0 && (
                  <Slider
                    className="mt-3"
                    min={0}
                    max={marketPaybackSliderValues.length - 1}
                    amount={getMarketPaybackSliderIndex(repaymentAmount)}
                    onChange={(index) => {
                      const newAmount = marketPaybackSliderValues[index] ?? 0
                      setRepaymentAmount(Math.floor(newAmount))
                    }}
                    step={1}
                    disabled={repaying}
                    color="indigo"
                    marks={marketPaybackSliderMarks}
                  />
                )}
                <Button
                  color="indigo"
                  size="xl"
                  loading={repaying}
                  disabled={
                    repaying || !repaymentAmount || repaymentAmount <= 0
                  }
                  onClick={repayLoan}
                  className="w-full"
                >
                  Pay Back Loan
                </Button>
              </Col>
            </Col>
          </div>
        )}
      </Col>
    </Modal>
  )
}
