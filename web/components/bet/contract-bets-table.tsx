import { Bet } from 'common/bet'
import {
  Contract,
  CPMMNumericContract,
  getBinaryMCProb,
  isBinaryMulti,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import {
  answerToRange,
  getMultiNumericAnswerMidpoints,
} from 'common/src/number'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { getStonkDisplayShares } from 'common/stonk'
import {
  formatPercent,
  formatShares,
  formatWithToken,
} from 'common/util/format'
import { groupBy, orderBy, partition, sortBy, sum, sumBy } from 'lodash'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { OutcomeLabel } from 'web/components/outcome-label'
import { Table } from 'web/components/widgets/table'
import { formatTimeShort } from 'client-common/lib/time'
import { Pagination } from '../widgets/pagination'
import { MoneyDisplay } from './money-display'
import { ContractMetric } from 'common/contract-metric'
import { getPseudonym } from '../charts/contract/choice'

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
  contractMetric: ContractMetric
  hideRedemptionAndLoanMessages?: boolean
  paginate?: boolean
  defaultExpanded?: boolean
}) {
  const {
    contract,
    isYourBets,
    hideRedemptionAndLoanMessages,
    paginate,
    contractMetric,
    defaultExpanded = false,
  } = props
  const { isResolved, mechanism, outcomeType } = contract

  const bets = sortBy(
    props.bets.filter((b) => b.amount !== 0 || b.loanAmount),
    (bet) => bet.createdTime
  ).reverse()

  const [redemptions, normalBets] = partition(bets, (b) => b.isRedemption)
  const firstOutcome = redemptions[0]?.outcome
  const amountRedeemed = Math.floor(
    sumBy(
      redemptions.filter((r) => r.outcome === firstOutcome),
      (b) => -1 * b.shares
    )
  )

  const amountLoaned = contractMetric.loan

  const isCPMM = mechanism === 'cpmm-1'
  const isCpmmMulti = mechanism === 'cpmm-multi-1'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = outcomeType === 'STONK'
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

  const [page, setPage] = useState(0)
  const unexpandedBetsPerPage = 2
  const betsPerPage = paginate ? 5 : normalBets.length
  const [expanded, setExpanded] = useState(defaultExpanded)

  const displayedBets = expanded
    ? normalBets.slice(page * betsPerPage, (page + 1) * betsPerPage)
    : normalBets.slice(0, unexpandedBetsPerPage)

  const isCashContract = contract.token === 'CASH'

  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr className="p-2">
            {(isCPMM || isCpmmMulti) && <th>Type</th>}
            {isCpmmMulti && !isBinaryMC && !isMultiNumber && <th>Answer</th>}
            {isMultiNumber && <th>Range</th>}
            {!isMultiNumber && <th>Outcome</th>}
            <th>Amount</th>
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
            ? (expanded
                ? groupedBets.slice(0, betsPerPage)
                : groupedBets.slice(0, unexpandedBetsPerPage)
              ).map((bets) => (
                <MultiNumberBetRow
                  key={bets[0].id}
                  bets={bets}
                  contract={contract as CPMMNumericContract}
                  isYourBet={isYourBets}
                />
              ))
            : displayedBets.map((bet) => (
                <BetRow key={bet.id} bet={bet} contract={contract} />
              ))}
        </tbody>
      </Table>
      <Row className={''}>
        {!expanded && normalBets.length > unexpandedBetsPerPage && (
          <button
            className={
              'hover:bg-canvas-100 text-primary-700 mb-1 rounded-md p-2 text-sm'
            }
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(true)
            }}
          >
            Show {normalBets.length - unexpandedBetsPerPage} more {TRADE_TERM}s
          </button>
        )}
        {expanded && !paginate && normalBets.length > unexpandedBetsPerPage && (
          <button
            className={
              'hover:bg-canvas-100 text-primary-700 mb-1 rounded-md p-2 text-sm'
            }
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(false)
            }}
          >
            Show less
          </button>
        )}
      </Row>
      {expanded && (
        <>
          {paginate && (
            <Pagination
              page={page}
              setPage={setPage}
              pageSize={betsPerPage}
              totalItems={
                isMultiNumber ? groupedBets.length : normalBets.length
              }
            />
          )}
          {!hideRedemptionAndLoanMessages && amountRedeemed > 0 && (
            <div className="text-ink-500 pl-2 text-sm">
              {amountRedeemed} {isPseudoNumeric ? 'HIGHER' : 'YES'} shares and{' '}
              {amountRedeemed} {isPseudoNumeric ? 'LOWER' : 'NO'} shares
              automatically redeemed for{' '}
              <MoneyDisplay
                amount={amountRedeemed}
                isCashContract={isCashContract}
              />
              .
            </div>
          )}
          {!hideRedemptionAndLoanMessages &&
            !isResolved &&
            amountLoaned > 0 && (
              <div className="text-ink-500 mt-2 pl-2 text-sm">
                {isYourBets ? (
                  <>
                    You currently have a loan of{' '}
                    <MoneyDisplay
                      amount={amountLoaned}
                      isCashContract={isCashContract}
                    />
                  </>
                ) : (
                  <>
                    This user currently has a loan of{' '}
                    <MoneyDisplay
                      amount={amountLoaned}
                      isCashContract={isCashContract}
                    />
                    .
                  </>
                )}
              </div>
            )}
        </>
      )}
    </div>
  )
}

function BetRow(props: { bet: Bet; contract: Contract }) {
  const { bet, contract } = props
  const { amount, outcome, createdTime, probBefore, probAfter, shares } = bet

  const { mechanism, outcomeType } = contract

  const isCPMM = mechanism === 'cpmm-1'
  const isCpmmMulti = mechanism === 'cpmm-multi-1'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = outcomeType === 'STONK'
  const isBinaryMC = isBinaryMulti(contract)

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const ofTotalAmount =
    bet.limitProb === undefined || bet.orderAmount === undefined
      ? ''
      : ` / ${formatWithToken({
          amount: bet.orderAmount,
          token: contract.token == 'CASH' ? 'CASH' : 'M$',
        })}`

  const isCashContract = contract.token === 'CASH'
  const sharesOrShortSellShares = Math.abs(shares)
  return (
    <tr>
      {(isCPMM || isCpmmMulti) && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      {isCpmmMulti && !isBinaryMC && (
        <td className="max-w-[200px] truncate sm:max-w-[250px]">
          {contract.answers.find((a) => a.id === bet.answerId)?.text ?? ''}
        </td>
      )}
      <td>
        <OutcomeLabel
          pseudonym={getPseudonym(contract)}
          outcome={outcome}
          contract={contract}
          truncate="short"
        />
      </td>
      <td>
        <MoneyDisplay
          amount={Math.abs(amount)}
          isCashContract={isCashContract}
        />
        {ofTotalAmount}
      </td>
      <td>
        {isStonk
          ? getStonkDisplayShares(contract, sharesOrShortSellShares, 2)
          : formatShares(sharesOrShortSellShares, isCashContract)}
      </td>

      <td>
        {hadPoolMatch ? (
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
  const isCashContract = contract.token === 'CASH'

  const ofTotalAmount = bets.some(
    (b) => b.orderAmount !== undefined && b.limitProb !== undefined
  )
    ? ` / ${formatWithToken({
        amount: sumBy(bets, (b) => b.orderAmount ?? 0),
        token: isCashContract ? 'CASH' : 'M$',
      })}`
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
  const isCashContract = contract.token === 'CASH'

  return (
    <tr>
      <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>
      <td className="max-w-[200px] truncate sm:max-w-[250px]">
        {lowerRange} - {higherRange}
      </td>
      <td>
        <MoneyDisplay
          amount={Math.abs(amount)}
          isCashContract={isCashContract}
        />
        {ofTotalAmount}
      </td>
      <td>{formatShares(Math.abs(shares), isCashContract)}</td>

      <td>
        {expectedValueBefore} → {expectedValueAfter}
      </td>
      <td>{formatTimeShort(createdTime)}</td>
    </tr>
  )
}
