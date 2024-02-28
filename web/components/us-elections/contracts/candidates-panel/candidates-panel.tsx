import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { sortBy, sumBy } from 'lodash'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
import { useChartAnswers } from '../../../charts/contract/choice'
import { Col } from '../../../layout/col'
import { CandidateBar, removeTextInParentheses } from './candidate-bar'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Carousel } from 'web/components/widgets/carousel'

// just the bars
export function CandidatePanel(props: {
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

  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const showAvatars =
    addAnswersMode === 'ANYONE' ||
    answers.some((a) => a.userId !== contract.creatorId)

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

  const moreCount = answers.length - displayedAnswers.length

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  return (
    <Col className="mx-[2px]">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          <Carousel labelsParentClassName="gap-2">
            {displayedAnswers.map((answer) => (
              <CandidateAnswer
                key={answer.id}
                answer={answer as Answer}
                contract={contract}
                color={getCandidateColor(removeTextInParentheses(answer.text))}
                user={user}
              />
            ))}
            {moreCount > 0 && (
              <Link href={contractPath(contract)} className="my-auto h-full">
                <Col
                  className={clsx(
                    ' text-ink-1000 items-center justify-center overflow-hidden text-sm transition-all hover:underline '
                  )}
                >
                  <Col className=" items-center gap-1 whitespace-nowrap">
                    {moreCount} more{' '}
                    <span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </span>
                  </Col>
                </Col>
              </Link>
            )}
          </Carousel>
        </>
      )}
    </Col>
  )
}

export function getCandidateColor(name: string) {
  // return 'bg-primary-500'
  if (!CANDIDATE_DATA[name]) return '#9E9FBD'
  if (CANDIDATE_DATA[name]?.party === 'Democrat') return '#adc4e3'
  return '#ecbab5'
}

function CandidateAnswer(props: {
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
  return (
    <Col className={'w-full'}>
      <CandidateBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        onHover={onHover}
        className={clsx(
          'cursor-pointer',
          selected && 'ring-primary-600 rounded ring-2'
        )}
        answer={answer}
        selected={selected}
        contract={contract}
      />
      {/* {!resolution && hasBets && isCpmm && user && (
        <AnswerPosition
          contract={contract}
          answer={answer as Answer}
          userBets={userBets}
          className="mt-0.5 self-end sm:mx-3 sm:mt-0"
          user={user}
        />
      )} */}
    </Col>
  )
}
