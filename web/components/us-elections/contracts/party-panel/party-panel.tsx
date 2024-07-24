import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { User } from 'common/user'
import { sortBy } from 'lodash'
import { useUser } from 'web/hooks/use-user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  AnswerBar,
  AnswerStatus,
} from 'web/components/answers/answer-components'
import { CreatorAndAnswerLabel } from 'web/components/answers/answer-components'
import { MultiBettor } from 'web/components/answers/answer-components'
import { CPMMMultiContract } from 'common/contract'
import {
  BubblePercentChange,
  PercentChangeToday,
} from '../candidates-panel/candidate-bar'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { UserPosition } from '../candidates-panel/candidates-user-position'
import { ProbabilityNeedle } from 'web/components/us-elections/probability-needle'
import { SizedContainer } from 'web/components/sized-container'
import { Spacer } from 'web/components/layout/spacer'

// just the bars
export function PartyPanel(props: {
  contract: MultiContract
  maxAnswers?: number
}) {
  const { contract, maxAnswers = Infinity } = props
  const { resolutions, outcomeType } = contract

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true
  const user = useUser()
  const answers = contract.answers
    .filter(
      (a) =>
        outcomeType === 'MULTIPLE_CHOICE' || ('number' in a && a.number !== 0)
    )
    .map((a) => ({ ...a, prob: getAnswerProbability(contract, a.id) }))

  const sortByProb = true
  const displayedAnswers = sortBy(answers, [
    // Winners for shouldAnswersSumToOne
    (answer) => (resolutions ? -1 * resolutions[answer.id] : answer),
    // Winners for independent binary
    (answer) =>
      'resolution' in answer && answer.resolution
        ? -answer.subsidyPool
        : -Infinity,
    // then by prob or index
    (answer) =>
      !sortByProb && 'index' in answer ? answer.index : -1 * answer.prob,
  ]).slice(0, maxAnswers)
  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  // Calculate Republican to Democratic ratio
  const republicanAnswer = answers.find((a) =>
    a.text.includes('Republican Party')
  )
  const democraticAnswer = answers.find((a) =>
    a.text.includes('Democratic Party')
  )

  const republicanProb = getAnswerProbability(contract, republicanAnswer!.id)
  const democraticProb = getAnswerProbability(contract, democraticAnswer!.id)

  let democratToRepublicanRatio = 0
  if (republicanAnswer && democraticAnswer) {
    const totalProb = republicanProb + democraticProb
    democratToRepublicanRatio = democraticProb / totalProb
  }

  return (
    <div className="mx-[2px] flex flex-col gap-2">
      <div className="hidden md:flex md:items-center md:justify-between">
        {!!republicanAnswer && (
          <PartyAnswerSnippet
            contract={contract}
            answer={republicanAnswer}
            color={getPartyColor(republicanAnswer.text)}
            className="w-1/4"
            alignment="left"
            userBets={userBetsByAnswer[republicanAnswer.id]}
            user={user}
          />
        )}
        <SizedContainer className="h-[210px] w-1/2">
          {(width, height) => (
            <ProbabilityNeedle
              percentage={democratToRepublicanRatio}
              width={width}
              height={height}
            />
          )}
        </SizedContainer>
        {!!democraticAnswer && (
          <PartyAnswerSnippet
            contract={contract}
            answer={democraticAnswer}
            color={getPartyColor(democraticAnswer.text)}
            alignment="right"
            userBets={userBetsByAnswer[democraticAnswer.id]}
            user={user}
          />
        )}
      </div>
      <SizedContainer className="h-[210px] w-full md:hidden">
        {(width, height) => (
          <ProbabilityNeedle
            percentage={democratToRepublicanRatio}
            width={width}
            height={height}
          />
        )}
      </SizedContainer>
      <Col className="gap-2 md:hidden">
        {showNoAnswers ? (
          <div className="text-ink-500 pb-4">No answers yet</div>
        ) : (
          <>
            {displayedAnswers.map((answer) => (
              <PartyAnswer
                key={answer.id}
                answer={answer as Answer}
                contract={contract}
                color={getPartyColor(answer.text)}
                user={user}
                userBets={userBetsByAnswer[answer.id]}
              />
            ))}
          </>
        )}
      </Col>
    </div>
  )
}

export function getPartyColor(name: string) {
  // return 'bg-primary-500'
  if (name == 'Democratic Party' || name.includes('Democratic Party'))
    return '#adc4e3'
  if (name == 'Republican Party' || name.includes('Republican Party'))
    return '#ecbab5'
  return '#9E9FBD'
}

function PartyAnswer(props: {
  contract: MultiContract
  answer: Answer
  color: string
  onHover?: (hovering: boolean) => void
  selected?: boolean
  userBets?: Bet[]
  user?: User | null
}) {
  const { answer, contract, onHover, selected, color, userBets, user } = props

  const prob = getAnswerProbability(contract, answer.id)

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  const hasBets = userBets && !floatingEqual(sharesSum, 0)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'

  return (
    <Col className={'w-full'}>
      <AnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        onHover={onHover}
        className={clsx(
          'cursor-pointer py-1.5',
          selected && 'ring-primary-600 ring-2'
        )}
        label={
          <Col>
            <CreatorAndAnswerLabel
              text={answer.text}
              createdTime={answer.createdTime}
              className={clsx('items-center !leading-none ')}
            />
            {!resolution && hasBets && isCpmm && user && (
              <UserPosition
                contract={contract as CPMMMultiContract}
                answer={answer as Answer}
                userBets={userBets}
                user={user}
                className="text-ink-700 dark:text-ink-800 text-xs hover:underline"
                greenArrowClassName="text-teal-600 dark:text-teal-300"
                redArrowClassName="text-scarlet-600 dark:text-scarlet-400"
              />
            )}
          </Col>
        }
        end={
          <Row className={'items-center gap-1 sm:gap-2'}>
            <div className="relative">
              <AnswerStatus contract={contract} answer={answer} />
              <PercentChangeToday
                probChange={answer.probChanges.day}
                className="absolute right-1 top-6 whitespace-nowrap text-xs"
              />
            </div>
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer as Answer}
            />
          </Row>
        }
      />
    </Col>
  )
}

function PartyAnswerSnippet(props: {
  contract: MultiContract
  answer: Answer
  color: string
  userBets?: Bet[]
  user?: User | null
  className?: string
  alignment: 'left' | 'right'
}) {
  const { answer, contract, userBets, user, className, alignment } = props

  const { resolution, resolutions } = contract
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  const hasBets = userBets && !floatingEqual(sharesSum, 0)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'

  return (
    <Col
      className={clsx(
        className,
        alignment == 'right' ? 'items-end text-right' : ''
      )}
    >
      <div className="text-ink-700">{answer.text}</div>
      <Spacer h={1} />
      <Row className={alignment == 'right' ? 'flex-row-reverse' : ''}>
        <AnswerStatus
          className="!text-5xl"
          contract={contract}
          answer={answer}
        />
        <BubblePercentChange
          // probChange={answer.probChanges.day}
          probChange={answer.text == 'Democratic Party' ? 0.2 : -0.2}
          className="whitespace-nowrap text-sm"
        />
      </Row>

      <Spacer h={2} />
      <div className="relative">
        <MultiBettor
          contract={contract as CPMMMultiContract}
          answer={answer as Answer}
          buttonClassName="w-20"
        />
        {!resolution && hasBets && isCpmm && user && (
          <UserPosition
            contract={contract as CPMMMultiContract}
            answer={answer as Answer}
            userBets={userBets}
            user={user}
            className="text-ink-600 dark:text-ink-700 absolute -bottom-[22px] left-0  text-xs hover:underline"
            greenArrowClassName="text-teal-600 dark:text-teal-300"
            redArrowClassName="text-scarlet-600 dark:text-scarlet-400"
          />
        )}
      </div>
    </Col>
  )
}
