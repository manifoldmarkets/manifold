import { APIError } from 'common/api'
import { Bet, LimitBet } from 'common/bet'
import { getContractBetMetrics, getProbability } from 'common/calculate'
import { calculateCpmmSale, getCpmmProbability } from 'common/calculate-cpmm'
import {
  CPMMBinaryContract,
  PseudoNumericContract,
  CPMMContract,
} from 'common/contract'
import { getMappedValue, getFormattedMappedValue } from 'common/pseudo-numeric'
import { User } from 'common/user'
import {
  formatLargeNumber,
  formatPercent,
  formatWithCommas,
  formatMoney,
} from 'common/util/format'
import { sumBy } from 'lodash'
import { useState } from 'react'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { sellShares } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { AmountInput } from '../widgets/amount-input'

export function SellPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  onSellSuccess?: () => void
}) {
  const { contract, shares, sharesOutcome, userBets, user, onSellSuccess } =
    props

  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const [amount, setAmount] = useState<number | undefined>(() => {
    const probChange = getSaleProbChange(
      contract,
      shares,
      sharesOutcome,
      unfilledBets,
      balanceByUserId
    )
    return probChange > 0.2 ? undefined : shares
  })
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const betDisabled = isSubmitting || !amount || error !== undefined

  // Sell all shares if remaining shares would be < 1
  const isSellingAllShares = amount === Math.floor(shares)

  const sellQuantity = isSellingAllShares ? shares : amount ?? 0

  const loanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)
  const soldShares = Math.min(sellQuantity, shares)
  const saleFrac = soldShares / shares
  const loanPaid = saleFrac * loanAmount

  const { invested } = getContractBetMetrics(contract, userBets)
  const costBasis = invested * saleFrac

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    await sellShares({
      shares: isSellingAllShares ? undefined : amount,
      outcome: sharesOutcome,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('Sold shares. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setAmount(undefined)
        if (onSellSuccess) onSellSuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error selling')
        }
        setIsSubmitting(false)
      })

    track('sell shares', {
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      shares: sellQuantity,
      outcome: sharesOutcome,
    })
  }

  const initialProb = getProbability(contract)
  const { cpmmState, saleValue } = calculateCpmmSale(
    contract,
    sellQuantity,
    sharesOutcome,
    unfilledBets,
    balanceByUserId
  )
  const netProceeds = saleValue - loanPaid
  const profit = saleValue - costBasis
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const rawDifference = Math.abs(
    getMappedValue(contract, resultProb) - getMappedValue(contract, initialProb)
  )
  const displayedDifference =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? formatLargeNumber(rawDifference)
      : formatPercent(rawDifference)
  const probChange = Math.abs(resultProb - initialProb)

  const warning =
    probChange >= 0.3
      ? `Are you sure you want to move the market by ${displayedDifference}?`
      : undefined

  const onAmountChange = (amount: number | undefined) => {
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (amount > shares) {
        setError(`Maximum ${formatWithCommas(Math.floor(shares))} shares`)
      } else {
        setError(undefined)
      }
    }
  }

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  return (
    <>
      <AmountInput
        amount={
          amount === undefined
            ? undefined
            : Math.round(amount) === 0
            ? 0
            : Math.floor(amount)
        }
        onChange={onAmountChange}
        label="Qty"
        error={error}
        disabled={isSubmitting}
        inputClassName="w-full ml-1"
      />

      <Col className="mt-3 w-full gap-3 text-sm">
        <Row className="text-ink-500 items-center justify-between gap-2">
          Sale amount
          <span className="text-ink-700">{formatMoney(saleValue)}</span>
        </Row>
        <Row className="text-ink-500 items-center justify-between gap-2">
          Profit
          <span className="text-ink-700">{formatMoney(profit)}</span>
        </Row>
        <Row className="items-center justify-between">
          <div className="text-ink-500">
            {isPseudoNumeric ? 'Estimated value' : 'Probability'}
          </div>
          <div>
            {getFormattedMappedValue(contract, initialProb)}
            <span className="mx-2">→</span>
            {getFormattedMappedValue(contract, resultProb)}
          </div>
        </Row>
        {loanPaid !== 0 && (
          <>
            <Row className="text-ink-500 mt-6 items-center justify-between gap-2">
              Loan repayment
              <span className="text-ink-700">{formatMoney(-loanPaid)}</span>
            </Row>
            <Row className="text-ink-500 items-center justify-between gap-2">
              Net proceeds
              <span className="text-ink-700">{formatMoney(netProceeds)}</span>
            </Row>
          </>
        )}
      </Col>

      <Spacer h={8} />

      <WarningConfirmationButton
        marketType="binary"
        amount={undefined}
        warning={warning}
        isSubmitting={isSubmitting}
        onSubmit={betDisabled ? undefined : submitSell}
        disabled={!!betDisabled}
        size="xl"
        color="indigo"
        actionLabel={`Sell ${Math.floor(soldShares)} shares`}
      />

      {wasSubmitted && <div className="mt-4">Sell submitted!</div>}
    </>
  )
}

const getSaleProbChange = (
  contract: CPMMContract,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const initialProb = getProbability(contract)
  const { cpmmState } = calculateCpmmSale(
    contract,
    shares,
    outcome,
    unfilledBets,
    balanceByUserId
  )
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)
  return Math.abs(
    getMappedValue(contract, resultProb) - getMappedValue(contract, initialProb)
  )
}
