import { InformationCircleIcon } from '@heroicons/react/solid'
import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { formatMoney, formatShares } from 'common/util/format'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function CreatorBannedFromBettingInfo(props: {
  contract: Contract
  creatorId: string
}) {
  const { contract, creatorId } = props
  const [creatorMetrics, setCreatorMetrics] = useState<ContractMetric[]>([])
  const [showPosition, setShowPosition] = useState(false)

  useEffect(() => {
    // Fetch the creator's metrics for all answers + summary
    db.from('user_contract_metrics')
      .select('data, loan')
      .eq('contract_id', contract.id)
      .eq('user_id', creatorId)
      .then(({ data }) => {
        if (data) {
          const metrics = data.map((doc) => ({
            ...(doc.data as ContractMetric),
            loan: doc.loan ?? (doc.data as any).loan ?? 0,
            marginLoan: (doc.data as any).marginLoan ?? 0,
          })) as ContractMetric[]
          setCreatorMetrics(metrics)
        }
      })
  }, [contract.id, creatorId])

  // Separate summary metric from per-answer metrics
  const summaryMetric = creatorMetrics.find((m) => m.answerId == null)
  const answerMetrics = creatorMetrics.filter((m) => m.answerId != null)
  const answers = 'answers' in contract ? contract.answers : []
  const isMulti = answerMetrics.length > 0

  // Filter out answer rows where both invested and profit are 0
  const visibleAnswerMetrics = answerMetrics.filter(
    (m) => m.invested > 0 || m.profit !== 0
  )
  const hasPosition =
    visibleAnswerMetrics.length > 0 ||
    (summaryMetric != null &&
      (summaryMetric.invested > 0 || summaryMetric.profit !== 0))

  return (
    <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-3">
      <Row className="items-start gap-2">
        <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
        <Col className="items-start gap-1">
          <span className="text-sm font-medium text-green-800">
            The creator has blocked themselves from betting in this market.
          </span>
          {hasPosition && (
            <>
              <button
                className="text-xs text-green-700 underline hover:text-green-900"
                onClick={() => setShowPosition(!showPosition)}
              >
                {showPosition ? 'Hide' : 'View'} creator's existing position
              </button>
              {showPosition && (
                <div className="mt-1 w-full rounded-md border border-green-200 bg-white p-2">
                  {isMulti ? (
                    <table className="w-full text-xs text-gray-700">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="pb-1 pr-4 font-medium">Answer</th>
                          <th className="pb-1 pr-4 font-medium">Spent</th>
                          <th className="pb-1 pr-4 font-medium">Profit</th>
                          <th className="pb-1 font-medium">Shares</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAnswerMetrics.map((metric) => {
                          const answer = answers.find(
                            (a) => a.id === metric.answerId
                          )
                          return (
                            <tr
                              key={metric.answerId}
                              className="border-b border-gray-100 last:border-0"
                            >
                              <td className="py-1 pr-4 font-medium">
                                {answer?.text ?? metric.answerId?.slice(0, 8)}
                              </td>
                              <td className="py-1 pr-4">
                                {formatMoney(metric.invested)}
                              </td>
                              <td className="py-1 pr-4">
                                {formatMoney(metric.profit)}
                              </td>
                              <td className="py-1">
                                <SharesCell metric={metric} />
                              </td>
                            </tr>
                          )
                        })}
                        {summaryMetric &&
                          (summaryMetric.invested > 0 ||
                            summaryMetric.profit !== 0) && (
                            <tr className="border-t border-gray-200 font-medium">
                              <td className="py-1 pr-4">Total</td>
                              <td className="py-1 pr-4">
                                {formatMoney(summaryMetric.invested)}
                              </td>
                              <td className="py-1 pr-4">
                                {formatMoney(summaryMetric.profit)}
                              </td>
                              <td className="py-1">—</td>
                            </tr>
                          )}
                      </tbody>
                    </table>
                  ) : summaryMetric ? (
                    <CreatorMetricRow metric={summaryMetric} />
                  ) : null}
                </div>
              )}
            </>
          )}
        </Col>
      </Row>
    </div>
  )
}

function CreatorMetricRow(props: { metric: ContractMetric }) {
  const { metric } = props
  const { invested, profit, profitPercent, totalShares } = metric
  const isCashContract = false

  const yesShares = totalShares?.YES ?? 0
  const noShares = totalShares?.NO ?? 0
  const hasShares = yesShares > 1 || noShares > 1

  return (
    <Row className="flex-wrap items-center gap-3 text-xs text-gray-700">
      <Col>
        <span className="text-gray-500">Spent</span>
        <span>{formatMoney(invested)}</span>
      </Col>
      <Col>
        <span className="text-gray-500">Profit</span>
        <span>{formatMoney(profit)}</span>
      </Col>
      {hasShares && (
        <Col>
          <span className="text-gray-500">Shares</span>
          <span>
            {yesShares > 1 && `${formatShares(yesShares, isCashContract)} YES`}
            {yesShares > 1 && noShares > 1 && ' / '}
            {noShares > 1 && `${formatShares(noShares, isCashContract)} NO`}
          </span>
        </Col>
      )}
    </Row>
  )
}

function SharesCell(props: { metric: ContractMetric }) {
  const { totalShares } = props.metric
  const isCashContract = false
  const yesShares = totalShares?.YES ?? 0
  const noShares = totalShares?.NO ?? 0

  if (yesShares <= 1 && noShares <= 1) return <span>—</span>

  return (
    <span>
      {yesShares > 1 && `${formatShares(yesShares, isCashContract)} YES`}
      {yesShares > 1 && noShares > 1 && ' / '}
      {noShares > 1 && `${formatShares(noShares, isCashContract)} NO`}
    </span>
  )
}
