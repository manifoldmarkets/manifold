import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import {
  Contract,
  CPMMNumericContract,
  DPMContract,
  FreeResponseContract,
  getBinaryMCProb,
  isBinaryMulti,
  MultipleChoiceContract,
} from 'common/contract'
import { Bet } from 'common/bet'
import { groupBy, orderBy, partition, sortBy, sum, sumBy } from 'lodash'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { Spacer } from 'web/components/layout/spacer'
import { Table } from 'web/components/widgets/table'
import { useState } from 'react'
import {
  calculatePayout,
  getAnswerProbability,
  resolvedPayout,
} from 'common/calculate'
import {
  calculateDpmSaleAmount,
  getDpmProbabilityAfterSale,
} from 'common/calculate-dpm'
import { BinaryOutcomeLabel, OutcomeLabel } from 'web/components/outcome-label'
import { getStonkDisplayShares } from 'common/stonk'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatTimeShort } from 'web/lib/util/time'
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'
import { api } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import {
  answerToRange,
  getMultiNumericAnswerMidpoints,
} from 'common/multi-numeric'

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
  hideRedemptionAndLoanMessages?: boolean
  truncate?: boolean
}) {
  const { contract, isYourBets, hideRedemptionAndLoanMessages, truncate } =
    props
  const { isResolved, mechanism, outcomeType, closeTime } = contract

  const bets = sortBy(
    props.bets.filter((b) => !b.isAnte && (b.amount !== 0 || b.loanAmount)),
    (bet) => bet.createdTime
  ).reverse()

  const [sales, buys] = partition(bets, (bet) => bet.sale)

  const salesDict = Object.fromEntries(
    sales.map((sale) => [sale.sale?.betId ?? '', sale])
  )

  const [redemptions, normalBets] = partition(
    mechanism === 'dpm-2' ? buys : bets,
    (b) => b.isRedemption
  )
  const firstOutcome = redemptions[0]?.outcome
  const amountRedeemed = Math.floor(
    sumBy(
      redemptions.filter((r) => r.outcome === firstOutcome),
      (b) => -1 * b.shares
    )
  )

  const amountLoaned = sumBy(
    bets.filter((bet) => !bet.isSold && !bet.sale),
    (bet) => bet.loanAmount ?? 0
  )

  const isCPMM = mechanism === 'cpmm-1'
  const isCPMM2 = mechanism === 'cpmm-2'
  const isCpmmMulti = mechanism === 'cpmm-multi-1'
  const isDPM = mechanism === 'dpm-2'
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = outcomeType === 'STONK'
  const isClosed = closeTime && Date.now() > closeTime
  const isBinaryMC = isBinaryMulti(contract)
  const isMultiNumber = outcomeType === 'NUMBER'
  const betsByBetGroupId = isMultiNumber
    ? groupBy(props.bets, (bet) => bet.betGroupId ?? bet.id)
    : {}
  const groupedBets = orderBy(
    Object.values(betsByBetGroupId),
    (bets) => bets[0].createdTime,
    'desc'
  )

  const [truncated, setTruncated] = useState(truncate ?? false)
  const truncatedBetCount = 3
  const moreBetsCount =
    (isMultiNumber ? groupedBets.length : normalBets.length) - truncatedBetCount

  return (
    <div className="overflow-x-auto">
      {!hideRedemptionAndLoanMessages && amountRedeemed > 0 && (
        <>
          <div className="text-ink-500 pl-2 text-sm">
            {isCPMM2 ? (
              <>
                {amountRedeemed} shares of each outcome redeemed for{' '}
                {formatMoney(amountRedeemed)}.
              </>
            ) : (
              <>
                {amountRedeemed} {isPseudoNumeric ? 'HIGHER' : 'YES'} shares and{' '}
                {amountRedeemed} {isPseudoNumeric ? 'LOWER' : 'NO'} shares
                automatically redeemed for {formatMoney(amountRedeemed)}.
              </>
            )}
          </div>
          <Spacer h={4} />
        </>
      )}

      {!hideRedemptionAndLoanMessages && !isResolved && amountLoaned > 0 && (
        <>
          <div className="text-ink-500 pl-2 text-sm">
            {isYourBets ? (
              <>You currently have a loan of {formatMoney(amountLoaned)}.</>
            ) : (
              <>
                This user currently has a loan of {formatMoney(amountLoaned)}.
              </>
            )}
          </div>
          <Spacer h={4} />
        </>
      )}

      <Table>
        <thead>
          <tr className="p-2">
            {isYourBets && isDPM && !isNumeric && !isResolved && !isClosed && (
              <th></th>
            )}
            {(isCPMM || isCpmmMulti) && <th>Type</th>}
            {isCpmmMulti && !isBinaryMC && !isMultiNumber && <th>Answer</th>}
            {isMultiNumber && <th>Range</th>}
            {!isMultiNumber && <th>Outcome</th>}
            <th>Amount</th>
            {isDPM && !isNumeric && (
              <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>
            )}
            {isDPM && !isResolved && <th>Payout if chosen</th>}
            <th>Shares</th>
            {isPseudoNumeric || isMultiNumber ? (
              <th>Value</th>
            ) : isStonk ? (
              <th>Stock price</th>
            ) : (
              <th>Probability</th>
            )}
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {isMultiNumber
            ? groupedBets
                .slice(0, truncated ? truncatedBetCount : undefined)
                .map((bets) => (
                  <MultiNumberBetRow
                    key={bets[0].id}
                    bets={bets}
                    contract={contract as CPMMNumericContract}
                    isYourBet={isYourBets}
                  />
                ))
            : (truncated
                ? normalBets.slice(0, truncatedBetCount)
                : normalBets
              ).map((bet) => (
                <BetRow
                  key={bet.id}
                  bet={bet}
                  saleBet={salesDict[bet.id]}
                  contract={contract}
                  isYourBet={isYourBets}
                />
              ))}
        </tbody>
      </Table>

      {truncate && moreBetsCount > 0 && (
        <Button
          className="w-full"
          color="gray-white"
          onClick={() => setTruncated((b) => !b)}
        >
          {truncated ? (
            <>
              <ChevronDownIcon className="mr-1 h-4 w-4" />{' '}
              {`Show ${moreBetsCount} more trades`}
            </>
          ) : (
            <>
              <ChevronUpIcon className="mr-1 h-4 w-4" /> {`Show fewer trades`}
            </>
          )}
        </Button>
      )}
    </div>
  )
}

function BetRow(props: {
  bet: Bet
  contract: Contract
  saleBet?: Bet
  isYourBet: boolean
}) {
  const { bet, saleBet, contract, isYourBet } = props
  const {
    amount,
    outcome,
    createdTime,
    probBefore,
    probAfter,
    shares,
    isSold,
    isAnte,
  } = bet

  const { isResolved, closeTime, mechanism, outcomeType } = contract

  const isClosed = closeTime && Date.now() > closeTime

  const isCPMM = mechanism === 'cpmm-1'
  const isCPMM2 = mechanism === 'cpmm-2'
  const isCpmmMulti = mechanism === 'cpmm-multi-1'
  const isShortSell = isCPMM2 && bet.amount > 0 && bet.shares === 0
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isDPM = mechanism === 'dpm-2'
  const isStonk = outcomeType === 'STONK'
  const isMulti =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'FREE_RESPONSE'
  const isBinaryMC = isBinaryMulti(contract)

  const dpmPayout = (() => {
    if (!isDPM) return 0

    const saleBetAmount = saleBet?.sale?.amount
    if (saleBetAmount) {
      return saleBetAmount
    } else if (contract.isResolved) {
      return resolvedPayout(contract, bet)
    } else {
      return calculateDpmSaleAmount(contract, bet)
    }
  })()

  const saleDisplay = !isDPM ? (
    ''
  ) : isAnte ? (
    'ANTE'
  ) : saleBet ? (
    <>{formatMoney(dpmPayout)} (sold)</>
  ) : (
    formatMoney(dpmPayout)
  )

  const payoutIfChosenDisplay =
    bet.isAnte && outcomeType === 'FREE_RESPONSE' && bet.outcome === '0'
      ? 'N/A'
      : formatMoney(calculatePayout(contract as any, bet, bet.outcome))

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const ofTotalAmount =
    bet.limitProb === undefined || bet.orderAmount === undefined
      ? ''
      : ` / ${formatMoney(bet.orderAmount)}`

  const sharesOrShortSellShares = Math.abs(shares)

  return (
    <tr>
      {isYourBet && isDPM && isMulti && !isResolved && !isClosed && (
        <td className="text-ink-700">
          {!isSold && !isAnte && (
            <DpmSellButton contract={contract} bet={bet} />
          )}
        </td>
      )}
      {(isCPMM || isCpmmMulti) && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      {isCpmmMulti && !isBinaryMC && (
        <td className="max-w-[200px] truncate sm:max-w-[250px]">
          {contract.answers.find((a) => a.id === bet.answerId)?.text ?? ''}
        </td>
      )}
      <td>
        {isCPMM2 && (isShortSell ? 'NO ' : 'YES ')}
        {bet.isAnte ? (
          'ANTE'
        ) : isCpmmMulti && !isBinaryMC ? (
          <BinaryOutcomeLabel outcome={outcome as any} />
        ) : (
          <OutcomeLabel
            outcome={outcome}
            contract={contract}
            truncate="short"
          />
        )}
      </td>
      <td>
        {formatMoney(Math.abs(amount))}
        {ofTotalAmount}
      </td>
      {isDPM && !isNumeric && <td>{saleDisplay}</td>}
      {isDPM && !isResolved && <td>{payoutIfChosenDisplay}</td>}
      <td>
        {isStonk
          ? getStonkDisplayShares(contract, sharesOrShortSellShares, 2)
          : formatWithCommas(sharesOrShortSellShares)}
      </td>

      <td>
        {outcomeType === 'FREE_RESPONSE' || hadPoolMatch ? (
          isStonk || isPseudoNumeric ? (
            <>
              {getFormattedMappedValue(contract, probBefore)} →{' '}
              {getFormattedMappedValue(contract, probAfter)}
            </>
          ) : isBinaryMC ? (
            <>
              {formatPercent(getBinaryMCProb(probBefore, outcome))} →{' '}
              {formatPercent(getBinaryMCProb(probAfter, outcome))}
            </>
          ) : (
            <>
              {formatPercent(probBefore)} → {formatPercent(probAfter)}
            </>
          )
        ) : isBinaryMC ? (
          formatPercent(getBinaryMCProb(bet.limitProb ?? 0, outcome))
        ) : (
          formatPercent(bet.limitProb ?? 0)
        )}
      </td>
      <td>{formatTimeShort(createdTime)}</td>
    </tr>
  )
}
export const groupMultiNumericBets = (
  bets: Bet[],
  contract: CPMMNumericContract
) => {
  const nonRedemptionBets = bets.filter((b) => !b.isRedemption)
  const betOnAnswers = contract.answers.filter((a) =>
    nonRedemptionBets.some((b) => b.answerId === a.id)
  )
  if (betOnAnswers.length === 0) return { bet: undefined }
  const lowestAnswer = betOnAnswers[0]
  const highestAnswer = betOnAnswers[betOnAnswers.length - 1]
  const lowerRange = answerToRange(lowestAnswer)[0]
  const higherRange = answerToRange(highestAnswer)[1]
  const firstNonRedemptionBet = nonRedemptionBets[0]
  const bet = {
    ...firstNonRedemptionBet,
    amount: sumBy(bets, (b) => b.amount),
    shares: sumBy(bets, (b) => b.shares),
    isApi: nonRedemptionBets.some((b) => b.isApi),
  }
  const getExpectedValueAtProbs = (probs: number[]) => {
    const answerValues = getMultiNumericAnswerMidpoints(contract)
    return sum(probs.map((p, i) => p * answerValues[i]))
  }
  const betProbAfters = contract.answers.map(
    (a) => bets.find((b) => b.answerId === a.id)?.probAfter ?? 0
  )
  const expectedValueAfter = getExpectedValueAtProbs(betProbAfters).toFixed(2)
  const betProbBefores = contract.answers.map(
    (a) => bets.find((b) => b.answerId === a.id)?.probBefore ?? 0
  )
  const expectedValueBefore = getExpectedValueAtProbs(betProbBefores).toFixed(2)

  const ofTotalAmount = bets.some(
    (b) => b.orderAmount !== undefined && b.limitProb !== undefined
  )
    ? ` / ${formatMoney(sumBy(bets, (b) => b.orderAmount ?? 0))}`
    : ''

  return {
    bet,
    lowerRange,
    higherRange,
    expectedValueBefore,
    expectedValueAfter,
    ofTotalAmount,
  }
}

function MultiNumberBetRow(props: {
  bets: Bet[]
  contract: CPMMNumericContract
  saleBet?: Bet
  isYourBet: boolean
}) {
  const { bets, contract } = props
  const {
    bet,
    lowerRange,
    higherRange,
    expectedValueBefore,
    expectedValueAfter,
    ofTotalAmount,
  } = groupMultiNumericBets(bets, contract)
  if (!bet) return null

  const { amount, createdTime, shares } = bet

  return (
    <tr>
      <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>
      <td className="max-w-[200px] truncate sm:max-w-[250px]">
        {lowerRange} - {higherRange}
      </td>
      <td>
        {formatMoney(Math.abs(amount))}
        {ofTotalAmount}
      </td>
      <td>{formatWithCommas(Math.abs(shares))}</td>

      <td>
        {expectedValueBefore} → {expectedValueAfter}
      </td>
      <td>{formatTimeShort(createdTime)}</td>
    </tr>
  )
}

function DpmSellButton(props: {
  contract: DPMContract & (MultipleChoiceContract | FreeResponseContract)
  bet: Bet
}) {
  const { contract, bet } = props
  const { outcome, shares, loanAmount } = bet

  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialProb = getAnswerProbability(contract, outcome)

  const outcomeProb = getDpmProbabilityAfterSale(
    contract.totalShares,
    outcome,
    shares
  )

  const saleAmount = calculateDpmSaleAmount(contract, bet)
  const profit = saleAmount - bet.amount

  return (
    <ConfirmationButton
      openModalBtn={{
        label: 'Sell',
        disabled: isSubmitting,
      }}
      submitBtn={{ label: 'Sell', color: 'green' }}
      onSubmit={async () => {
        setIsSubmitting(true)
        await api('sell-shares-dpm', { contractId: contract.id, betId: bet.id })
        setIsSubmitting(false)
      }}
    >
      <div className="mb-4 text-xl">
        Sell {formatWithCommas(shares)} shares of{' '}
        <OutcomeLabel outcome={outcome} contract={contract} truncate="long" />{' '}
        for {formatMoney(saleAmount)}?
      </div>
      {!!loanAmount && (
        <div className="mt-2">
          You will also pay back {formatMoney(loanAmount)} of your loan, for a
          net of {formatMoney(saleAmount - loanAmount)}.
        </div>
      )}

      <div className="mb-1 mt-2 text-sm">
        {profit > 0 ? 'Profit' : 'Loss'}: {formatMoney(profit).replace('-', '')}
        <br />
        Question probability: {formatPercent(initialProb)} →{' '}
        {formatPercent(outcomeProb)}
      </div>
    </ConfirmationButton>
  )
}
