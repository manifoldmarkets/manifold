import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract, Contract, contractPath } from 'common/contract'
import { Lover } from 'common/love/lover'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useUser, useUserById } from 'web/hooks/use-user'
import { formatPercent } from 'common/util/format'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { UserLink } from 'web/components/widgets/user-link'
import { ConfirmStageButton } from '../confirm-stage-button'
import { RejectButton } from '../reject-button'
import { MatchBetButton } from './match-bet'
import { MatchPositionsButton } from './match-positions'
import { MatchTracker } from './match-tracker'
import { linkClass } from 'web/components/widgets/site-link'
import { CommentsButton } from '../comments/love-comments-button'
import { MatchAvatars } from './match-avatars'

const relationshipStages = [
  '1st date',
  '2nd date',
  '3rd date',
  '6 month relationship',
]

export const MatchTile = (props: {
  contract: CPMMMultiContract
  answers: Answer[]
  lover: Lover
  profileLover: Lover
  isYourMatch: boolean
}) => {
  const { lover, isYourMatch, profileLover } = props
  const contract = (useFirebasePublicContract(
    props.contract.visibility,
    props.contract.id
  ) ?? props.contract) as CPMMMultiContract
  const { matchCreatorId } = contract
  const fetchedAnswers = useAnswersCpmm(contract.id)
  const answers = fetchedAnswers ?? props.answers

  const { user, pinned_url } = lover
  const currentUser = useUser()

  const lastResolved = answers.reduce((acc, answer, index) => {
    return answer.resolution !== undefined ? index : acc
  }, -1)

  const [stage, setStage] = useState(Math.min(lastResolved + 1, 3))
  const answer = answers[stage]
  const prevAnswer = answers[stage - 1]
  const showConfirmStage =
    !answer.resolution && (!prevAnswer || prevAnswer.resolution === 'YES')

  const firstDateDate = answer.text
    .substring(answer.text.indexOf('by'), answer.text.length - 1)
    .trim()

  const wasMatchedByALover =
    matchCreatorId &&
    (matchCreatorId === profileLover.user_id ||
      matchCreatorId === lover.user_id)

  return (
    <Col className="mb-2 w-[220px] shrink-0 overflow-hidden rounded">
      <Col className="bg-canvas-0 w-full px-4 py-2">
        <UserLink
          className={
            'hover:text-primary-500 text-ink-1000 truncate font-semibold transition-colors'
          }
          user={user}
          hideBadge
        />
        {matchCreatorId && !wasMatchedByALover && (
          <MatchedBy contract={contract} />
        )}
      </Col>
      <Col className="relative h-36 w-full overflow-hidden">
        {pinned_url ? (
          <Link href={`/${user.username}`}>
            <Image
              src={pinned_url}
              // You must set these so we don't pay an extra $1k/month to vercel
              width={220}
              height={144}
              alt={`${user.username}`}
              className="h-36 w-full object-cover"
            />
          </Link>
        ) : (
          <Col className="bg-ink-300 h-full w-full items-center justify-center">
            <UserIcon className="h-20 w-20" />
          </Col>
        )}
        {isYourMatch && (
          <Col className="absolute right-3 top-2 gap-2">
            <SendMessageButton
              toUser={user}
              currentUser={currentUser}
              circleButton
            />
            <RejectButton lover={lover} />
          </Col>
        )}
      </Col>
      <Col className="bg-canvas-0 text-ink-1000 grow justify-between gap-2 px-4 py-2 text-sm">
        <Col className="gap-2">
          <MatchTracker
            lastResolved={lastResolved}
            stage={stage}
            setStage={setStage}
          />

          <Row className="w-full justify-between">
            <Col>
              <span>
                Chance of{' '}
                <span className="font-semibold">
                  <Link className={linkClass} href={contractPath(contract)}>
                    {relationshipStages[stage]}
                  </Link>
                </span>
              </span>
              <div className="text-ink-500 text-xs">
                {stage === 0 ? (
                  <> {firstDateDate}</>
                ) : lastResolved < stage - 1 ? (
                  <> if {relationshipStages[stage - 1]} happens</>
                ) : (
                  <></>
                )}
              </div>
            </Col>
            <div
              className={clsx(
                'font-semibold',
                answer.resolution
                  ? answer.resolution == 'YES'
                    ? 'text-teal-300'
                    : answer.resolution == 'NO'
                    ? 'text-scarlet-300'
                    : ''
                  : ''
              )}
            >
              {formatPercent(answer.prob)}
            </div>
          </Row>
        </Col>
        <Row className="w-full items-center justify-between gap-2">
          <MatchPositionsButton
            contract={contract}
            answer={answer}
            modalHeader={
              <MatchAvatars profileLover={profileLover} matchedLover={lover} />
            }
          />
          <CommentsButton
            contract={contract}
            user={currentUser}
            modalHeader={
              <MatchAvatars profileLover={profileLover} matchedLover={lover} />
            }
          />
          <MatchBetButton
            contract={contract}
            answer={answer}
            answers={answers}
            user={user}
            modalHeader={
              <MatchAvatars
                profileLover={profileLover}
                matchedLover={lover}
                className="mb-3"
              />
            }
          />
          {showConfirmStage && isYourMatch && (
            <ConfirmStageButton
              lover={lover}
              stage={relationshipStages[stage]}
              contractId={contract.id}
              answerId={answer.id}
            />
          )}
        </Row>
      </Col>
    </Col>
  )
}

function MatchedBy(props: { contract: Contract }) {
  const { contract } = props
  const matchMakerId = contract.matchCreatorId
  const matchMaker = useUserById(matchMakerId)

  return (
    <Row className="text-ink-500 items-center gap-[3px] text-xs">
      <span>Matched by </span>
      {!matchMaker ? (
        <div className="dark:bg-ink-400 bg-ink-200 h-3 w-16 animate-pulse" />
      ) : (
        <UserLink user={matchMaker} hideBadge />
      )}
    </Row>
  )
}
