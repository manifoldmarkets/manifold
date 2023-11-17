import { useState } from 'react'

import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract, contractPath } from 'common/contract'
import { Lover } from 'common/love/lover'
import Image from 'next/image'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useUser } from 'web/hooks/use-user'

import { formatPercent } from 'common/util/format'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { UserLink } from 'web/components/widgets/user-link'
import { ConfirmStageButton } from '../confirm-stage-button'
import { RejectButton } from '../reject-button'
import { MatchBetButton } from './match-bet'
import { MatchPositionsButton } from './match-positions'
import { MatchTracker } from './match-tracker'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { CommentsButton } from '../comments/love-comments-button'
import { User } from 'common/user'
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
  const fetchedAnswers = useAnswersCpmm(contract.id)
  const answers = fetchedAnswers ?? props.answers

  const { user, pinned_url } = lover
  const currentUser = useUser()

  const lastResolved = answers.reduce((acc, answer, index) => {
    return answer.resolution !== undefined ? index : acc
  }, -1)

  const [stage, setStage] = useState(lastResolved + 1)
  const answer = answers[stage]
  const prevAnswer = answers[stage - 1]
  const showConfirmStage =
    !answer.resolution && (!prevAnswer || prevAnswer.resolution === 'YES')

  const firstDateDate = answer.text
    .substring(answer.text.indexOf('by'), answer.text.length - 1)
    .trim()

  return (
    <Col className="mb-2 w-[220px] shrink-0 overflow-hidden rounded drop-shadow-lg">
      <div className="bg-canvas-0 w-full bg-gradient-to-b px-4 py-2">
        <UserLink
          className={
            'hover:text-primary-500 text-ink-1000 truncate font-semibold transition-colors'
          }
          user={user}
          hideBadge
        />
      </div>
      <Col className="relative h-36 w-full overflow-hidden">
        {pinned_url ? (
          <Image
            src={pinned_url}
            // You must set these so we don't pay an extra $1k/month to vercel
            width={180}
            height={240}
            alt={`${user.username}`}
            className="h-full w-full object-cover"
          />
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
