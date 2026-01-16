import { useState } from 'react'
import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { formatMoney, formatWithToken } from 'common/util/format'
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Slider } from 'web/components/widgets/slider'
import {
  LARGE_SLIDER_VALUES,
  SMALL_SLIDER_VALUES,
  LARGE_SLIDER_VALUE_LABELS,
  SMALL_SLIDER_VALUE_LABELS,
} from 'web/components/bet/bet-slider'

export function PayBackLoanForm(props: {
  user: User
  totalLoan: number
  hasLotsOfMoney: boolean
  onSuccess?: () => void
  contractId?: string
  answerId?: string
  description?: string
}) {
  const {
    user,
    totalLoan,
    hasLotsOfMoney,
    onSuccess,
    contractId,
    answerId,
    description,
  } = props

  const [repayAmount, setRepayAmount] = useState<number | undefined>()
  const [repayError, setRepayError] = useState<string | undefined>()
  const [isRepaying, setIsRepaying] = useState(false)

  // Slider max goes to total loan, but actual repayment limited by balance
  const paybackMaxActual = Math.min(totalLoan, user.balance)
  const paybackSliderMax = Math.floor(totalLoan)

  // Create filtered slider values that respect the max
  const createFilteredSliderValues = (
    max: number,
    useSmallAmounts: boolean
  ) => {
    const baseValues = useSmallAmounts
      ? SMALL_SLIDER_VALUES
      : LARGE_SLIDER_VALUES
    const filtered = baseValues.filter((v) => v <= max)
    if (filtered.length === 0 || filtered[filtered.length - 1] !== max) {
      filtered.push(max)
    }
    return filtered
  }

  const paybackSliderValues =
    paybackSliderMax > 0
      ? createFilteredSliderValues(paybackSliderMax, !hasLotsOfMoney)
      : []

  const getPaybackSliderIndex = (amount: number | undefined) => {
    if (!amount || paybackSliderValues.length === 0) return 0
    if (amount >= paybackSliderMax) {
      return paybackSliderValues.length - 1
    }
    return paybackSliderValues.findLastIndex((v) => amount >= v) || 0
  }

  const createSliderMarks = (values: number[], labels: number[]) => {
    return labels
      .filter((label) => label <= (values[values.length - 1] ?? 0))
      .map((label) => {
        const index = values.findIndex((v) => v === label)
        return {
          value: index !== -1 ? index : 0,
          label: formatWithToken({ amount: label, token: 'M$', short: true }),
        }
      })
  }

  const paybackSliderMarks =
    paybackSliderValues.length > 0
      ? createSliderMarks(
          paybackSliderValues,
          hasLotsOfMoney ? LARGE_SLIDER_VALUE_LABELS : SMALL_SLIDER_VALUE_LABELS
        )
      : []

  const handleRepay = async () => {
    if (!repayAmount || repayAmount <= 0) return

    let amountToRepay = Math.floor(repayAmount)

    // If user selected the slider max (total loan), use their actual max (balance-limited)
    if (amountToRepay === paybackSliderMax) {
      amountToRepay = paybackMaxActual
    } else if (amountToRepay > paybackMaxActual) {
      // Can't repay more than balance
      amountToRepay = paybackMaxActual
    }

    setIsRepaying(true)
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
        setRepayAmount(undefined)
        onSuccess?.()
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to repay loan')
    } finally {
      setIsRepaying(false)
    }
  }

  if (totalLoan <= 0) return null

  return (
    <div className="border-ink-200 bg-canvas-50 border-t px-6 py-5">
      <Col className="gap-4">
        <div>
          <h3 className="text-ink-900 mb-1 text-base font-semibold">
            Pay back loan
          </h3>
          <p className="text-ink-600 text-xs">
            {description ??
              'Repay any amount of your outstanding loan. Payments are distributed proportionally by loan amount across all markets.'}
          </p>
        </div>
        <Col className="gap-3">
          <BuyAmountInput
            parentClassName="max-w-full"
            amount={repayAmount ? Math.floor(repayAmount) : undefined}
            onChange={(newAmount) => {
              if (!newAmount || newAmount <= 0) {
                setRepayAmount(undefined)
                return
              }
              const roundedAmount = Math.floor(newAmount)
              if (roundedAmount > paybackMaxActual) {
                setRepayAmount(Math.floor(paybackMaxActual))
              } else {
                setRepayAmount(roundedAmount)
              }
            }}
            error={repayError}
            setError={setRepayError}
            disabled={isRepaying}
            maximumAmount={paybackMaxActual}
            showSlider={false}
            token="M$"
          />
          {paybackSliderValues.length > 0 && (
            <Slider
              className="mt-3"
              min={0}
              max={paybackSliderValues.length - 1}
              amount={getPaybackSliderIndex(repayAmount)}
              onChange={(index) => {
                const newAmount = paybackSliderValues[index] ?? 0
                setRepayAmount(Math.floor(newAmount))
              }}
              step={1}
              disabled={isRepaying}
              color="indigo"
              marks={paybackSliderMarks}
            />
          )}
          <Button
            color="indigo"
            size="xl"
            loading={isRepaying}
            disabled={isRepaying || !repayAmount || repayAmount <= 0}
            onClick={handleRepay}
            className="w-full"
          >
            Pay Back Loan
          </Button>
        </Col>
      </Col>
    </div>
  )
}
