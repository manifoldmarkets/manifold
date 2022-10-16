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
import { sumBy, partition } from 'lodash'
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

  const getValue = getMappedValue(contract)
  const rawDifference = Math.abs(getValue(resultProb) - getValue(initialProb))
  const displayedDifference =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? formatLargeNumber(rawDifference)
      : formatPercent(rawDifference)
  const probChange = Math.abs(resultProb - initialProb)

  const warning =
    probChange >= 0.3
      ? `Are you sure you want to move the market by ${displayedDifference}?`
      : undefined

  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const [yesBets, noBets] = partition(
    openUserBets,
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    sumBy(yesBets, (bet) => bet.shares),
    sumBy(noBets, (bet) => bet.shares),
  ]

  const ownedShares = Math.round(yesShares) || Math.round(noShares)

  const onAmountChange = (amount: number | undefined) => {
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (amount > ownedShares) {
        setError(`Maximum ${formatWithCommas(Math.floor(ownedShares))} shares`)
      } else {
        setError(undefined)
      }
    }
  }

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const format = getFormattedMappedValue(contract)

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
        <Row className="items-center justify-between gap-2 text-gray-500">
          Sale amount
          <span className="text-gray-700">{formatMoney(saleValue)}</span>
        </Row>
        <Row className="items-center justify-between gap-2 text-gray-500">
          Profit
          <span className="text-gray-700">{formatMoney(profit)}</span>
        </Row>
        <Row className="items-center justify-between">
          <div className="text-gray-500">
            {isPseudoNumeric ? 'Estimated value' : 'Probability'}
          </div>
          <div>
            {format(initialProb)}
            <span className="mx-2">→</span>
            {format(resultProb)}
          </div>
        </Row>
        {loanPaid !== 0 && (
          <>
            <Row className="mt-6 items-center justify-between gap-2 text-gray-500">
              Loan repayment
              <span className="text-gray-700">{formatMoney(-loanPaid)}</span>
            </Row>
            <Row className="items-center justify-between gap-2 text-gray-500">
              Net proceeds
              <span className="text-gray-700">{formatMoney(netProceeds)}</span>
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
        color="blue"
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

  const getValue = getMappedValue(contract)
  return Math.abs(getValue(resultProb) - getValue(initialProb))
}
