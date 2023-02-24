import { QuadraticFundingContract } from 'common/contract'
import { Col } from '../layout/col'
import Image from 'next/image'
import { formatMoney } from 'common/util/format'
import { Button } from '../buttons/button'
import { useState } from 'react'
import { Spacer } from '../layout/spacer'
import {
  addQfAddPool,
  createQfAnswer,
  payQfAnswer,
  resolveQf,
} from 'web/lib/firebase/api'
import { ContractDetails } from './contract-details'
import { ExpandingInput } from '../widgets/expanding-input'
import { Answer } from 'common/answer'
import { Row } from '../layout/row'
import clsx from 'clsx'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Avatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { Modal } from '../layout/modal'
import { BuyAmountInput } from '../widgets/amount-input'
import { UserAvatarAndBadge } from '../widgets/user-link'
import { useQfTxns } from 'web/hooks/txns/use-qf-txns'
import { QfPaymentTxn, QfTxn } from 'common/txn'
import {
  calculateMatches,
  calculateTotals,
  totalPaid,
} from 'common/calculate/qf'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from '../widgets/info-tooltip'
import QfTradesTable from './qf-trades-table'
import { AlertBox } from '../widgets/alert-box'
import { SiteLink } from '../widgets/site-link'
import { sortBy } from 'lodash'
import { CHOICE_ANSWER_COLORS } from '../charts/contract/choice'

export function QfOverview(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const match = formatMoney(contract.pool.M$)
  const qfTxns = useQfTxns(contract.id)
  const raised = formatMoney(totalPaid(qfTxns))

  const [poolPanel, setPoolPanel] = useState(false)

  return (
    <Col className="gap-6">
      <div className="flex justify-between gap-2">
        {contract.coverImageUrl && (
          <Image
            alt=""
            className="object-cover"
            width={120}
            height={120}
            src={contract.coverImageUrl}
          />
        )}
        <Col className="gap-2 text-right">
          <div className="text-2xl">{raised} raised</div>
          <div className="mb-auto text-xl text-green-800">+{match} match</div>
          <Button
            color="gray-outline"
            size="xs"
            onClick={() => setPoolPanel(!poolPanel)}
          >
            contribute
          </Button>
        </Col>
      </div>
      {poolPanel && <QfAddPoolPanel contract={contract} />}

      <QfExplainer />

      <QfAnswersPanel contract={contract} />

      <CreateAnswerWidget contract={contract} />
    </Col>
  )
}

export function QfExplainer() {
  return (
    <AlertBox
      title="This is Quadratic Funding, an experimental market type."
      text=""
    >
      Unlike Free Response where you bet on what the market creator will
      resolve, here you send mana as a tip to your favorite entries. The
      quadratic funding pool will then match donations - popular entries get
      larger matches.
      <br /> <br />
      Each entry will receive the square of the sum of sqrt(tips): an entry that
      gets 10 tips of 1 mana will receive 100 mana total, with the 90 extra mana
      coming from the matching pool. See{' '}
      <SiteLink
        followsLinkClass
        className="text-indigo-700"
        href="https://vitalik.ca/general/2019/12/07/quadratic.html"
      >
        this primer
      </SiteLink>{' '}
      for more details.
    </AlertBox>
  )
}

function QfAnswersPanel(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const { answers } = contract
  const matchingPool = contract.pool.M$
  const qfTxns = useQfTxns(contract.id)
  const totals = calculateTotals(qfTxns)
  const matches = calculateMatches(qfTxns, matchingPool)
  const sortedAns = sortBy(answers, (a) => -totals[a.id] - matches[a.id])

  return (
    <Col className="flex-1 gap-4">
      <div className="flex justify-between">{answers.length} entries</div>
      <Col className="gap-4">
        {sortedAns.map((answer, i) => (
          <QfAnswer
            contract={contract}
            answer={answer}
            total={totals[answer.id]}
            match={matches[answer.id]}
            color={CHOICE_ANSWER_COLORS[i] ?? '#B1B1C7'}
            txns={qfTxns}
            key={answer.id}
          />
        ))}
      </Col>
    </Col>
  )
}

function QfPayPanel(props: {
  contract: QuadraticFundingContract
  answer: Answer
  txns: QfTxn[]
}) {
  const { contract, answer, txns } = props
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const user = useUser()

  const newTxn: QfPaymentTxn = {
    category: 'QF_PAYMENT',
    id: 'unused',
    qfId: contract.id,
    createdTime: Date.now(),
    fromType: 'USER',
    fromId: user?.id ?? 'unused',
    toType: 'USER',
    toId: answer.userId,
    token: 'M$',
    amount: betAmount ?? 0,
    data: {
      answerId: answer.id,
    },
  }
  const oldMatch = calculateMatches(txns, contract.pool.M$)[answer.id] ?? 0
  const newMatch = calculateMatches([...txns, newTxn], contract.pool.M$)[
    answer.id
  ]
  const deltaMatch = newMatch - oldMatch

  return (
    <Col className="sm:max-w-84 gap-4 !rounded-md bg-white !px-8 !py-6">
      {/* Add information about the answer */}
      <Row className="justify-between">
        <div className="text-2xl">Fund "{answer.text}"</div>
        <UserAvatarAndBadge
          name={answer.name}
          username={answer.username}
          avatarUrl={answer.avatarUrl}
        />
      </Row>

      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={setBetAmount}
        sliderOptions={{
          show: true,
          wrap: true,
        }}
        error={undefined}
        setError={() => {}}
      />

      {deltaMatch > 0 && (
        <Row className="mt-8 items-baseline gap-1.5 text-gray-500">
          <div className="text-2xl">{formatMoney(deltaMatch)}</div>
          match{' '}
          <InfoTooltip text="Quadratic match. May decrease as other entries get funding." />
        </Row>
      )}
      <Button
        size="xl"
        color="indigo"
        disabled={!betAmount}
        onClick={async () => {
          await payQfAnswer({
            qfId: contract.id,
            answerId: answer.id,
            amount: betAmount ?? 0,
          })
          // Clear inputs
          setBetAmount(undefined)
        }}
      >
        Pay {answer.name} {formatMoney(betAmount ?? 0)}
      </Button>
    </Col>
  )
}

function QfAnswer(props: {
  contract: QuadraticFundingContract
  answer: Answer
  txns: QfTxn[]
  total?: number
  match?: number
  color: string
}) {
  const { contract, answer, txns, total = 0, match = 0, color } = props
  const { username, avatarUrl, text } = answer
  const user = useUser()
  const canFund = tradingAllowed(contract) && user && user?.id !== answer.userId
  const [showModal, setShowModal] = useState(false)
  const matchingPool = contract.pool.M$

  const fraction = (total + match) / (totalPaid(txns) + matchingPool)
  const colorWidth = 100 * Math.max(fraction, 0.01)
  return (
    <Col
      className={clsx(
        'relative w-full rounded-lg transition-all',
        tradingAllowed(contract) ? 'text-gray-900' : 'text-gray-500'
      )}
      style={{
        background: `linear-gradient(to right, ${color}90 ${colorWidth}%, #FBFBFF ${colorWidth}%)`,
      }}
    >
      <Modal open={showModal} setOpen={setShowModal} position="center">
        <QfPayPanel contract={contract} answer={answer} txns={txns} />
      </Modal>
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
          {canFund && (
            <Button
              size="2xs"
              color="gray-outline"
              onClick={() => setShowModal(!showModal)}
              className="my-auto"
            >
              Fund
            </Button>
          )}
          {/* <button className="p-1" onClick={() => {}}>
            <ChatIcon className="h-5 w-5 text-gray-400 transition-colors hover:text-gray-600" />
          </button> */}
        </Row>
      </Row>
    </Col>
  )
}

function CreateAnswerWidget(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const [answer, setAnswer] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Return a form with a button to create an answer
  return (
    <Col className="flex-1 gap-2 px-4 xl:px-0">
      <div className="mb-1">Create an entry</div>
      <ExpandingInput
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Write your entry..."
      />
      <Col className="gap-4 self-end sm:flex-row sm:items-end">
        <Button
          color="green"
          disabled={answer.length === 0}
          loading={isSubmitting}
          size="lg"
          onClick={async () => {
            setIsSubmitting(true)
            await createQfAnswer({
              qfId: contract.id,
              text: answer,
            })
            // Clear the input
            setAnswer('')
            setIsSubmitting(false)
          }}
        >
          Submit
        </Button>
      </Col>
    </Col>
  )
}

export function QfTrades(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const txns = useQfTxns(contract.id)
  return <QfTradesTable contract={contract} txns={txns} />
}

// Allow the user to contribute funds to the pool
function QfAddPoolPanel(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const [amount, setAmount] = useState<number | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  return (
    <Col className="gap-4 rounded-lg bg-blue-50 p-8">
      <div>Current matching pool: {formatMoney(contract.pool.M$)}</div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={amount}
        onChange={setAmount}
        sliderOptions={{
          show: true,
          wrap: true,
        }}
        error={undefined}
        setError={() => {}}
      />
      <Spacer h={8} />
      <Button
        size="xl"
        color="indigo"
        disabled={!amount}
        loading={submitting}
        onClick={async () => {
          setSubmitting(true)
          await addQfAddPool({
            qfId: contract.id,
            amount: amount ?? 0,
          })
          // Clear inputs
          setAmount(undefined)
          setSubmitting(false)
        }}
      >
        Contribute {formatMoney(amount ?? 0)}
      </Button>
    </Col>
  )
}

export function QfResolutionPanel(props: {
  contract: QuadraticFundingContract
}) {
  const { contract } = props
  const [submitting, setSubmitting] = useState(false)

  return (
    <Col className="gap-4 rounded-lg bg-blue-50 p-8">
      <div>Current matching pool: {formatMoney(contract.pool.M$)}</div>
      {/* TODO: Preview the distribution of payouts */}
      <Button
        size="xl"
        color="indigo"
        disabled={submitting}
        loading={submitting}
        onClick={async () => {
          setSubmitting(true)
          await resolveQf({
            qfId: contract.id,
          })
          setSubmitting(false)
        }}
      >
        Pay out matching pool
      </Button>
    </Col>
  )
}
