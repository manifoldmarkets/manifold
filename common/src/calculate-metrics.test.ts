import { sumBy } from 'lodash'
import {
  applyMetricToSummary,
  calculateAnswerMetricsWithNewBetsOnly,
  getDefaultMetric,
  MarginalBet,
} from './calculate-metrics'
import { ContractMetric, isSummary } from './contract-metric'

const USER = 'u1'
const CONTRACT = 'c1'

const answerMetric = (
  answerId: string,
  loans: { loan: number; marginLoan: number }
): Omit<ContractMetric, 'id'> => ({
  ...getDefaultMetric(USER, CONTRACT, answerId),
  ...loans,
  totalShares: { YES: 200, NO: 0 },
  totalSpent: { YES: 100, NO: 0 },
  invested: 100,
  totalAmountInvested: 100,
  hasShares: true,
  hasYesShares: true,
  maxSharesOutcome: 'YES',
  lastBetTime: 1,
})

// The update_null_answer_metrics trigger sets the summary's loan and
// margin_loan to the sums over its answer rows. These check that the deltas
// the bet path applies in memory land on the same values.
describe('summary metric loans', () => {
  const answers = () => [
    answerMetric('a', { loan: 50, marginLoan: 100 }),
    answerMetric('b', { loan: 0, marginLoan: 30 }),
  ]
  const summaryOf = (metrics: Omit<ContractMetric, 'id'>[]) => {
    const summary = getDefaultMetric(USER, CONTRACT, null)
    metrics.forEach((m) => applyMetricToSummary(m, summary, true))
    return summary
  }

  it('builds the summary as the trigger would', () => {
    const summary = summaryOf(answers())
    expect(summary.loan).toBe(50)
    expect(summary.marginLoan).toBe(130)
  })

  it('moves summary marginLoan with a sale that repays margin loan', () => {
    const current = answers()
    const metrics = [...current, summaryOf(current)]
    const sale: MarginalBet = {
      userId: USER,
      contractId: CONTRACT,
      answerId: 'a',
      outcome: 'YES',
      amount: -90,
      shares: -100,
      // Repays 60 of answer a's 150 total loan, split pro rata: 20 free, 40
      // margin.
      loanAmount: -60,
      isRedemption: false,
      probAfter: 0.5,
      createdTime: 2,
    }

    const updated = calculateAnswerMetricsWithNewBetsOnly(
      [sale],
      metrics,
      CONTRACT,
      true
    )
    const summary = updated.find(isSummary)
    const updatedA = updated.find((m) => m.answerId === 'a')
    const answerRows = [updatedA!, current[1]]

    expect(updatedA?.loan).toBeCloseTo(30)
    expect(updatedA?.marginLoan).toBeCloseTo(60)
    expect(summary?.loan).toBeCloseTo(sumBy(answerRows, (m) => m.loan))
    expect(summary?.marginLoan).toBeCloseTo(
      sumBy(answerRows, (m) => m.marginLoan)
    )
  })

  it('treats a metric with no marginLoan as zero', () => {
    const legacy = {
      ...answerMetric('a', { loan: 10, marginLoan: 0 }),
      marginLoan: undefined as unknown as number,
    }
    const summary = summaryOf([legacy])
    expect(summary.marginLoan).toBe(0)
    applyMetricToSummary(legacy, summary, false)
    expect(summary.marginLoan).toBe(0)
  })
})
