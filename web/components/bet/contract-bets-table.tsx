import {
  Contract,
  DPMContract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import { Bet } from 'common/bet'
import { partition, sortBy, sumBy } from 'lodash'
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
import { sellBet } from 'web/lib/firebase/api'

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
  hideRedemptionAndLoanMessages?: boolean
}) {
  const { contract, isYourBets, hideRedemptionAndLoanMessages } = props
  const { isResolved, mechanism, outcomeType, closeTime } = contract

  const bets = sortBy(
    props.bets.filter((b) => !b.isAnte && b.amount !== 0),
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
          <div className="text-ink-500 pl-0 text-sm">
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
            {isCPMM && <th>Type</th>}
            {isCpmmMulti && <th>Answer</th>}
            <th>Outcome</th>
            <th>Amount</th>
            {isDPM && !isNumeric && (
              <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>
            )}
            {isDPM && !isResolved && <th>Payout if chosen</th>}
            <th>Shares</th>
            {isPseudoNumeric ? (
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
          {normalBets.map((bet) => (
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
      : formatMoney(calculatePayout(contract, bet, bet.outcome))

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
      {isCPMM && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      {isCpmmMulti && (
        <td>
          {contract.answers.find((a) => a.id === bet.answerId)?.text ?? ''}
        </td>
      )}
      <td>
        {isCPMM2 && (isShortSell ? 'NO ' : 'YES ')}
        {bet.isAnte ? (
          'ANTE'
        ) : isCpmmMulti ? (
          <BinaryOutcomeLabel outcome={outcome as any} />
        ) : (
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
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
          ) : (
            <>
              {formatPercent(probBefore)} → {formatPercent(probAfter)}
            </>
          )
        ) : (
          formatPercent(bet.limitProb ?? 0)
        )}
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
        await sellBet({ contractId: contract.id, betId: bet.id })
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

      <div className="mt-2 mb-1 text-sm">
        {profit > 0 ? 'Profit' : 'Loss'}: {formatMoney(profit).replace('-', '')}
        <br />
        Question probability: {formatPercent(initialProb)} →{' '}
        {formatPercent(outcomeProb)}
      </div>
    </ConfirmationButton>
  )
}
