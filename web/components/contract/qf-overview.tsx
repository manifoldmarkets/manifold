import clsx from 'clsx'
import { DpmAnswer } from 'common/answer'
import { calculateTotals, totalPaid } from 'common/calculate/qf'
import { QuadraticFundingContract, tradingAllowed } from 'common/contract'
import { QfTxn } from 'common/txn'
import { formatMoney } from 'common/util/format'
import { sortBy } from 'lodash'
import { useQfTxns } from 'web/hooks/txns/use-qf-txns'
import { nthColor } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { AlertBox } from '../widgets/alert-box'
import { Avatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import QfTradesTable from './qf-trades-table'

export function QfOverview(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const match = formatMoney(contract.pool.M$)
  const qfTxns = useQfTxns(contract.id)
  const raised = formatMoney(totalPaid(qfTxns))

  return (
    <Col className="gap-6">
      <div className="flex justify-end gap-2">
        <Col className="gap-2 text-right">
          <div className="text-2xl">{raised} raised</div>
          <div className="mb-auto text-xl text-green-800">+{match} match</div>
        </Col>
      </div>

      <QfExplainer />

      <QfAnswersPanel contract={contract} />
    </Col>
  )
}

export function QfExplainer() {
  return <AlertBox title="Quadratic Funding markets are deprecated" text="" />
}

function QfAnswersPanel(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const { answers } = contract
  const qfTxns = useQfTxns(contract.id)
  const totals = calculateTotals(qfTxns)
  const sortedAns = sortBy(answers, (a) => -totals[a.id])

  return (
    <Col className="flex-1 gap-4">
      <div className="flex justify-between">{answers.length} entries</div>
      <Col className="gap-4">
        {sortedAns.map((answer, i) => (
          <QfAnswer
            contract={contract}
            answer={answer}
            total={totals[answer.id]}
            match={0}
            color={nthColor(i)}
            txns={qfTxns}
            key={answer.id}
          />
        ))}
      </Col>
    </Col>
  )
}

function QfAnswer(props: {
  contract: QuadraticFundingContract
  answer: DpmAnswer
  txns: QfTxn[]
  total?: number
  match?: number
  color: string
}) {
  const { contract, answer, txns, total = 0, match = 0, color } = props
  const { username, avatarUrl, text } = answer

  const matchingPool = contract.pool.M$

  const fraction = (total + match) / (totalPaid(txns) + matchingPool)
  const colorWidth = 100 * Math.max(fraction, 0.01)
  return (
    <Col
      className={clsx(
        'relative w-full rounded-lg transition-all',
        tradingAllowed(contract) ? 'text-ink-900' : 'text-ink-500'
      )}
      style={{
        background: `linear-gradient(to right, ${color}90 ${colorWidth}%, #FBFBFF ${colorWidth}%)`,
      }}
    >
      <Row className="z-20 items-center justify-between gap-2 py-2 px-3">
        <Row>
          <Avatar
            className="mt-0.5 mr-2 h-5 w-5 self-start border border-transparent transition-transform hover:border-none"
            username={username}
            avatarUrl={avatarUrl}
          />
          <Linkify className="text-md whitespace-pre-line" text={text} />
        </Row>
        <Row className="items-end gap-2">
          <div className="text-xl">{formatMoney(total)}</div>
          {match ? (
            <span className="text-sm text-green-800">
              +{formatMoney(match)}
            </span>
          ) : null}
        </Row>
      </Row>
    </Col>
  )
}

export function QfTrades(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const txns = useQfTxns(contract.id)
  return <QfTradesTable contract={contract} txns={txns} />
}
