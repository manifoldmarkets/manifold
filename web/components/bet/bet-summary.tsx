import { sumBy } from 'lodash'
import clsx from 'clsx'

import { Bet } from 'web/lib/firebase/bets'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { Col } from '../layout/col'
import { Contract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { YesLabel, NoLabel } from '../outcome-label'
import {
  calculatePayout,
  getContractBetMetrics,
  getProbability,
} from 'common/calculate'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProfitBadge } from '../profit-badge'

export function BetsSummary(props: {
  contract: Contract
  userBets: Bet[]
  className?: string
}) {
  const { contract, className } = props
  const { resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const bets = props.userBets.filter((b) => !b.isAnte)
  const { profitPercent, payout, profit, invested, hasShares } =
    getContractBetMetrics(contract, bets)

  const excludeSales = bets.filter((b) => !b.isSold && !b.sale)
  const yesWinnings = sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'YES')
  )
  const noWinnings = sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'NO')
  )

  const position = yesWinnings - noWinnings
  const outcome = hasShares ? (position > 0 ? 'YES' : 'NO') : undefined

  const prob = isBinary ? getProbability(contract) : 0
  const expectation = prob * yesWinnings + (1 - prob) * noWinnings

  if (bets.length === 0) return <></>

  return (
    <Col className={clsx(className, 'gap-4')}>
      <Row className="flex-wrap gap-4 sm:flex-nowrap sm:gap-6">
        {resolution ? (
          <Col>
            <div className="text-sm text-gray-500">Payout</div>
            <div className="whitespace-nowrap">
              {formatMoney(payout)}{' '}
              <ProfitBadge profitPercent={profitPercent} />
            </div>
          </Col>
        ) : isBinary ? (
          <Col>
            <div className="whitespace-nowrap text-sm text-gray-500">
              Position{' '}
              <InfoTooltip
                text={`Number of shares you own on net. 1 ${outcome} share = M$1 if the market resolves ${outcome}.`}
              />
            </div>
            <div className="whitespace-nowrap">
              {position > 1e-7 ? (
                <>
                  <YesLabel /> {formatWithCommas(position)}
                </>
              ) : position < -1e-7 ? (
                <>
                  <NoLabel /> {formatWithCommas(-position)}
                </>
              ) : (
                '——'
              )}
            </div>
          </Col>
        ) : (
          <Col>
            <div className="whitespace-nowrap text-sm text-gray-500">
              Expectation{''}
              <InfoTooltip text="The estimated payout of your position using the current market probability." />
            </div>
            <div className="whitespace-nowrap">{formatMoney(payout)}</div>
          </Col>
        )}

        <Col className="hidden sm:inline">
          <div className="whitespace-nowrap text-sm text-gray-500">
            Invested{' '}
            <InfoTooltip text="Cash currently invested in this market." />
          </div>
          <div className="whitespace-nowrap">{formatMoney(invested)}</div>
        </Col>

        {isBinary && !resolution && (
          <Col>
            <div className="whitespace-nowrap text-sm text-gray-500">
              Expectation{' '}
              <InfoTooltip text="The estimated payout of your position using the current market probability." />
            </div>
            <div className="whitespace-nowrap">{formatMoney(expectation)}</div>
          </Col>
        )}

        <Col>
          <div className="whitespace-nowrap text-sm text-gray-500">
            Profit{' '}
            <InfoTooltip text="Includes both realized & unrealized gains/losses." />
          </div>
          <div className="whitespace-nowrap">
            {formatMoney(profit)}
            <ProfitBadge profitPercent={profitPercent} />
          </div>
        </Col>
      </Row>
    </Col>
  )
}
