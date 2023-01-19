import { QuadraticFundingContract } from 'common/contract'
import { Col } from '../layout/col'
import { Title } from '../widgets/title'
import Image from 'next/image'
import { formatMoney } from 'common/util/format'
import { Button } from '../buttons/button'
import { useState } from 'react'
import { Spacer } from '../layout/spacer'
import { createQfAnswer, payQfAnswer } from 'web/lib/firebase/api'
import { ContractDetails } from './contract-details'
import { ExpandingInput } from '../widgets/expanding-input'
import { Answer } from 'common/answer'
import { Row } from '../layout/row'
import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Avatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { getAnswerColor } from '../answers/answers-panel'
import { Modal } from '../layout/modal'
import { BuyAmountInput } from '../widgets/amount-input'
import { UserAvatarAndBadge } from '../widgets/user-link'
import { useQfTxns } from 'web/hooks/txns/use-qf-txns'
import { QFTxn } from 'common/txn'
import {
  calculateMatches,
  calculateTotals,
  totalPaid,
} from 'common/calculate/qf'
import { sumBy } from 'lodash'

export function QFOverview(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const match = formatMoney(contract.pool.M$)

  return (
    <Col>
      <ContractDetails contract={contract} />
      <Spacer h={8} />
      <div className="flex gap-2">
        <Image
          alt=""
          width={100}
          height={100}
          src={contract.coverImageUrl ?? ''}
          className="rounded-md"
        />
        <div className="flex grow justify-between gap-4">
          <Title className="!my-0">{contract.question}</Title>
          <span className="text-4xl">{match}</span>
        </div>
      </div>

      <Spacer h={8} />

      <QfAnswersPanel contract={contract} />

      <Spacer h={8} />

      <CreateAnswerWidget contract={contract} />
    </Col>
  )
}

function QfAnswersPanel(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const { answers } = contract
  const qfTxns = useQfTxns(contract.id)

  return (
    <Col className="flex-1 gap-4">
      <div className="flex justify-between">
        <Title className="!my-0">Answers</Title>
        <div className="text-2xl">{answers.length}</div>
      </div>
      <Col className="gap-4">
        {answers.map((answer) => (
          <QfAnswer
            contract={contract}
            answer={answer}
            qfTxns={qfTxns}
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
}) {
  const { contract, answer } = props
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  return (
    <Col className="sm:max-w-84 gap-4 !rounded-md bg-white !px-8 !py-6">
      {/* Add information about the answer */}
      <Row className="justify-between">
        <div className="text-2xl">Pay "{answer.text}"</div>
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
        showSlider={true}
        error={undefined}
        setError={() => {}}
      />

      <Row className="mt-2 items-baseline gap-2 text-gray-500">
        <div className="text-2xl">{formatMoney(0)}</div> quadratic match
      </Row>

      <Button
        size="xl"
        color="indigo"
        disabled={betAmount === undefined}
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
        Pay
      </Button>
    </Col>
  )
}

function QfAnswer(props: {
  contract: QuadraticFundingContract
  answer: Answer
  qfTxns: QFTxn[]
}) {
  const { contract, answer, qfTxns } = props
  const { username, avatarUrl, text } = answer
  const color = getAnswerColor(
    answer,
    contract.answers.map((a) => a.text)
  )
  const [showModal, setShowModal] = useState(false)
  const matchingPool = contract.pool.M$ + 1000

  const total = calculateTotals(qfTxns)[answer.id] ?? 0
  const match = calculateMatches(qfTxns, matchingPool)[answer.id] ?? 0
  const fraction = (total + match) / (totalPaid(qfTxns) + matchingPool)
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
        <QfPayPanel contract={contract} answer={answer} />
      </Modal>
      <Row className="z-20 -mb-1 justify-between gap-2 py-2 px-3">
        <Row>
          <Avatar
            className="mt-0.5 mr-2 inline h-5 w-5 border border-transparent transition-transform hover:border-none"
            username={username}
            avatarUrl={avatarUrl}
          />
          <Linkify className="text-md whitespace-pre-line" text={text} />
        </Row>
        <Row className="gap-2">
          <div className="my-auto text-xl">
            {formatMoney(total)}{' '}
            {match ? (
              <span className="text-sm text-green-800">
                +{formatMoney(match)}
              </span>
            ) : null}
          </div>
          {tradingAllowed(contract) && (
            <Button
              size="2xs"
              color="gray-outline"
              onClick={() => setShowModal(!showModal)}
              className="my-auto"
            >
              Buy
            </Button>
          )}
          <button className="p-1" onClick={() => {}}>
            <ChatIcon className="h-5 w-5 text-gray-400 transition-colors hover:text-gray-600" />
          </button>
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
      <div className="mb-1">Add your answer</div>
      <ExpandingInput
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer..."
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
