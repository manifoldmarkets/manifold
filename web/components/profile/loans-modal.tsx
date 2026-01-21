import { useState, useEffect } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { User } from 'common/user'
import clsx from 'clsx'
import {
  LOAN_DAILY_INTEREST_RATE,
  DAILY_LOAN_NET_WORTH_PERCENT,
} from 'common/loans'
import { useIsEligibleForLoans } from 'web/hooks/use-is-eligible-for-loans'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { formatMoney, formatPercent } from 'common/util/format'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { Button } from 'web/components/buttons/button'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import {
  LARGE_SLIDER_VALUES,
  SMALL_SLIDER_VALUES,
  LARGE_SLIDER_VALUE_LABELS,
  SMALL_SLIDER_VALUE_LABELS,
} from 'web/components/bet/bet-slider'
import { Slider } from 'web/components/widgets/slider'
import { formatWithToken } from 'common/util/format'
import { PayBackLoanForm } from 'web/components/bet/pay-back-loan-form'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Tooltip } from 'web/components/widgets/tooltip'
import Link from 'next/link'

export function LoansModal(props: {
  user: User
  isOpen: boolean
  setOpen: (open: boolean) => void
  refreshPortfolio?: () => void
}) {
  const { isOpen, user, setOpen, refreshPortfolio } = props
  const [loaning, setLoaning] = useState(false)
  const [quickLoanLoading, setQuickLoanLoading] = useState<number | null>(null)
  const [loanAmount, setLoanAmount] = useState<number | undefined>()
  const [requestLoanError, setRequestLoanError] = useState<string | undefined>()
  const { latestPortfolio } = useIsEligibleForLoans(user.id)
  const { data: loanData, refresh: refetchLoanData } = useAPIGetter(
    'get-next-loan-amount',
    { userId: user.id }
  )
  const { refresh: refetchTotalLoan } = useAPIGetter(
    'get-total-loan-amount',
    {}
  )

  const maxGeneralLoan = loanData?.maxGeneralLoan ?? 0
  const availableGeneralLoan = loanData?.available ?? 0
  const dailyLimit = loanData?.dailyLimit ?? 0
  const availableToday = loanData?.availableToday ?? 0
  const hasOutstandingLoan = (latestPortfolio?.loanTotal ?? 0) > 0
  const hasMarginLoanAccess = loanData?.hasMarginLoanAccess ?? false

  const requestLoan = async (
    amountOverride?: number,
    closeOnSuccess?: boolean,
    isQuickLoan?: number
  ) => {
    let amountToRequest = amountOverride ?? loanAmount
    if (!amountToRequest || amountToRequest <= 0) {
      toast.error('Please enter a valid loan amount')
      return
    }

    // Round input to whole number for display
    amountToRequest = Math.floor(amountToRequest)

    // Clamp to maximum available (use actual max, not rounded)
    const maxAvailable = requestLoanMaxActual

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
    if (isQuickLoan) {
      setQuickLoanLoading(isQuickLoan)
    }
    try {
      const res = await api('request-loan', {
        amount: amountToRequest,
      })
      if (res) {
        toast.success(`Loan received! You borrowed ${formatMoney(res.amount)}`)
        setLoanAmount(undefined)
        refetchLoanData()
        refetchTotalLoan()
        if (closeOnSuccess) {
          setOpen(false)
        }
        track('request loan', {
          amount: res.amount,
        })
      }
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error requesting loan')
    } finally {
      setLoaning(false)
      setQuickLoanLoading(null)
      if (refreshPortfolio) {
        setTimeout(refreshPortfolio, 1000)
      }
    }
  }

  useEffect(() => {
    if (isOpen && !user.hasSeenLoanModal)
      api('me/update', { hasSeenLoanModal: true })
  }, [isOpen, user.hasSeenLoanModal])

  // Store actual max (before rounding) for use in API calls and validation
  const requestLoanMaxActual = Math.min(availableGeneralLoan, availableToday)
  // Round down for display/slider max
  const requestLoanMax = Math.floor(requestLoanMaxActual)

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

  // Create filtered slider values for request loan
  const requestLoanSliderValues =
    requestLoanMax > 0
      ? createFilteredSliderValues(requestLoanMax, !hasLotsOfMoney)
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
                Leverage your positions with loans
              </p>
            </Col>
          </Row>
        </Col>

        {/* Key Metrics */}
        <Row className="border-ink-100 gap-3 border-b px-6 py-4">
          <Col className="flex-1 gap-1">
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
              Available today
            </span>
            <span className="text-primary-600 text-2xl font-semibold">
              {formatMoney(requestLoanMax)}
            </span>
            <span className="text-ink-500 text-xs">
              Daily limit: {formatMoney(dailyLimit)} • Total max:{' '}
              {formatMoney(maxGeneralLoan)}
            </span>
          </Col>
          <Col className="border-ink-200 flex-1 gap-1 border-l pl-3">
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
              Total outstanding loan
            </span>
            <span className="text-ink-900 text-2xl font-semibold">
              {formatMoney(
                (loanData?.currentFreeLoan ?? 0) +
                  (loanData?.currentMarginLoan ?? 0)
              )}
            </span>
            <span className="text-ink-500 text-xs">
              Free: {formatMoney(loanData?.currentFreeLoan ?? 0)} • Margin:{' '}
              {formatMoney(loanData?.currentMarginLoan ?? 0)}
            </span>
          </Col>
        </Row>

        {/* Quick Loans Section - only show if user has access */}
        {hasMarginLoanAccess && (
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
                  const isButtonLoading = quickLoanLoading === quickAmount
                  const isDisabled =
                    loaning ||
                    quickAmount > maxAvailable ||
                    quickAmount > availableGeneralLoan ||
                    quickAmount > availableToday

                  return (
                    <button
                      key={quickAmount}
                      disabled={isDisabled}
                      onClick={() => {
                        if (!isDisabled) {
                          requestLoan(quickAmount, true, quickAmount)
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
                        isButtonLoading && 'pointer-events-none'
                      )}
                    >
                      <span
                        className={clsx(
                          'relative z-10 flex items-center justify-center gap-2',
                          isButtonLoading && 'opacity-0'
                        )}
                      >
                        {formatMoney(quickAmount)}
                      </span>
                      {isButtonLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <LoadingIndicator
                            size="sm"
                            spinnerColor="border-yellow-900"
                          />
                        </div>
                      )}
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
              <div>
                <p className="text-ink-900 mb-1 font-medium">Loan limits</p>
                <p>
                  Daily limit is {formatPercent(DAILY_LOAN_NET_WORTH_PERCENT)}{' '}
                  of net worth. Loans are distributed proportionally across your
                  unresolved positions.
                </p>
                <p className="mt-2">
                  Your current max total loan is{' '}
                  <span className="font-semibold">
                    {formatMoney(maxGeneralLoan)}
                  </span>
                  {latestPortfolio &&
                    latestPortfolio.balance + latestPortfolio.investmentValue >
                      0 && (
                      <>
                        , which is{' '}
                        {formatPercent(
                          maxGeneralLoan /
                            (latestPortfolio.balance +
                              latestPortfolio.investmentValue)
                        )}{' '}
                        of your net worth
                      </>
                    )}
                  .{' '}
                  {hasMarginLoanAccess ? (
                    <>
                      Upgrade your membership at the{' '}
                      <Link
                        href="/shop"
                        className="text-primary-600 hover:underline"
                      >
                        shop
                      </Link>{' '}
                      to increase this limit (Plus: 100%, Pro: 200%, Premium:
                      300%).
                    </>
                  ) : (
                    <>
                      Subscribe to a membership at the{' '}
                      <Link
                        href="/shop"
                        className="text-primary-600 hover:underline"
                      >
                        shop
                      </Link>{' '}
                      to unlock margin loans with higher limits (Plus: 100%,
                      Pro: 200%, Premium: 300%).
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-ink-900 mb-1 font-medium">
                  Loan types & interest
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    <span className="font-medium text-green-600">
                      Free loans
                    </span>
                    : Claimed daily via the golden chest. Interest-free forever!
                  </li>
                  <li>
                    <span className="font-medium text-amber-600">
                      Margin loans
                    </span>
                    : Requested here. {LOAN_DAILY_INTEREST_RATE * 100}% interest
                    per day.
                  </li>
                </ul>
                <p className="text-ink-500 mt-2 text-xs">
                  Repayments go to margin loans first (to stop interest), then
                  free loans. All loans are deducted when the question resolves.
                </p>
              </div>
            </Col>
          </Col>

          <div className="bg-ink-200 h-px" />
        </Col>

        {/* Loan Request Section - show upgrade prompt if no access */}
        <div className="border-ink-200 bg-canvas-50 border-t px-6 py-5">
          {hasMarginLoanAccess ? (
            <Col className="gap-4">
              <div>
                <h3 className="text-ink-900 mb-1 text-base font-semibold">
                  Request loan
                </h3>
                <p className="text-ink-600 text-xs">
                  Enter the amount you want to borrow. It will be distributed
                  proportionally across your positions.
                </p>
              </div>
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
                    const maxAvailable = requestLoanMaxActual
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
                  maximumAmount={requestLoanMaxActual}
                  showSlider={false}
                  token="M$"
                  disregardUserBalance
                />
                {requestLoanSliderValues.length > 0 && (
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
            </Col>
          ) : (
            <Col className="items-center gap-4 py-4 text-center">
              <div className="rounded-full bg-indigo-100 p-4 dark:bg-indigo-900/30">
                <span className="text-4xl">🔒</span>
              </div>
              <Col className="gap-2">
                <h3 className="text-ink-900 text-lg font-semibold">
                  Upgrade to unlock margin loans
                </h3>
                <p className="text-ink-600 max-w-sm text-sm">
                  Margin loans are available to all Manifold members. Upgrade to
                  borrow against your positions and leverage your trading.
                </p>
              </Col>
              <Link href="/shop" onClick={() => setOpen(false)}>
                <Button color="indigo" size="lg">
                  View membership options
                </Button>
              </Link>
              <p className="text-ink-500 text-xs">
                Free daily loans are still available via the golden chest!
              </p>
            </Col>
          )}
        </div>

        {/* Repayment Section */}
        {hasOutstandingLoan && (
          <PayBackLoanForm
            user={user}
            totalLoan={
              (loanData?.currentFreeLoan ?? 0) +
              (loanData?.currentMarginLoan ?? 0)
            }
            hasLotsOfMoney={hasLotsOfMoney}
            onSuccess={() => {
              refetchTotalLoan()
              refetchLoanData()
              if (refreshPortfolio) {
                setTimeout(refreshPortfolio, 1000)
              }
            }}
          />
        )}
      </Col>
    </Modal>
  )
}
