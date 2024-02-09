import { keyBy, orderBy } from 'lodash'
import Link from 'next/link'
import Image from 'next/image'
import { UserIcon, ExternalLinkIcon, CheckIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { Lover } from 'common/love/lover'
import { Col } from 'web/components/layout/col'
import { Carousel } from 'web/components/widgets/carousel'
import { Answer } from 'common/answer'
import { useUser } from 'web/hooks/use-user'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { CPMMMultiContract, contractPath } from 'common/contract'
import { UserLink } from 'web/components/widgets/user-link'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { Row } from 'web/components/layout/row'
import { formatPercent } from 'common/util/format'
import { MatchPositionsButton } from '../matches/match-positions'
import { MatchAvatars } from '../matches/match-avatars'
import { MatchBetButton } from '../matches/match-bet'
import { linkClass } from 'web/components/widgets/site-link'
import { Subtitle } from './lover-subtitle'

export const MarketsDisplay = ({
  profileLover,
  contract,
  lovers,
  mutuallyMessagedUserIds,
}: {
  profileLover: Lover
  contract: CPMMMultiContract
  lovers: Lover[]
  mutuallyMessagedUserIds: string[]
}) => {
  return (
    <Col className="w-full gap-2">
      <Link
        className={clsx(linkClass, 'text-ink-500')}
        href={contractPath(contract)}
      >
        <Row className="items-center gap-1">
          <Subtitle>Predicted matches</Subtitle>{' '}
          <ExternalLinkIcon className="h-5 w-5" />
        </Row>
      </Link>

      <LoveMarketCarousel
        profileLover={profileLover}
        contract={contract}
        lovers={lovers}
        mutuallyMessagedUserIds={mutuallyMessagedUserIds}
      />
    </Col>
  )
}

export const LoveMarketCarousel = ({
  profileLover,
  contract,
  lovers,
  mutuallyMessagedUserIds,
}: {
  profileLover: Lover
  contract: CPMMMultiContract
  lovers: Lover[]
  mutuallyMessagedUserIds: string[]
}) => {
  const currentUser = useUser()
  const answers = useAnswersCpmm(contract.id) ?? contract.answers
  const sortedAnswers = orderBy(answers, 'prob', 'desc')

  const loversByUserId = keyBy(lovers, 'user_id')
  return (
    <Carousel>
      {sortedAnswers.length === 0 && (
        <div className="text-ink-500 px-2">None yet</div>
      )}
      {sortedAnswers.map((answer) => {
        if (!answer.loverUserId) return null
        const matchLover = loversByUserId[answer.loverUserId]
        if (!matchLover) return null
        return (
          <MatchTile
            key={matchLover.user_id}
            profileLover={profileLover}
            contract={contract}
            answer={answer}
            lover={matchLover}
            isYourMatch={currentUser?.id === profileLover.user_id}
            haveMutuallyMessaged={mutuallyMessagedUserIds.includes(
              matchLover.user_id
            )}
          />
        )
      })}
    </Carousel>
  )
}

const MatchTile = (props: {
  profileLover: Lover
  contract: CPMMMultiContract
  answer: Answer
  lover: Lover
  isYourMatch: boolean
  haveMutuallyMessaged: boolean
}) => {
  const {
    contract,
    answer,
    lover,
    isYourMatch,
    profileLover,
    haveMutuallyMessaged,
  } = props

  const { user, pinned_url } = lover
  const currentUser = useUser()
  const isYou = currentUser?.id === user.id

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
        {haveMutuallyMessaged && (
          <Row className="bg-primary-500 absolute bottom-2 right-3 gap-1 rounded px-2 py-1 text-xs text-white">
            <CheckIcon className="h-4 w-4 text-white" />
            <div>Mutual messages</div>
          </Row>
        )}
        {isYourMatch && (
          <Col className="absolute right-3 top-2 gap-2">
            <SendMessageButton
              toUser={user}
              currentUser={currentUser}
              circleButton
            />
            {/* <RejectButton lover={lover} /> */}
          </Col>
        )}
        {!isYourMatch && !isYou && (
          <Col className="absolute right-3 top-2">
            <MatchBetButton
              contract={contract}
              answer={answer}
              user={user}
              modalHeader={
                <MatchAvatars
                  profileLover={profileLover}
                  matchedLover={lover}
                  className="mb-3"
                />
              }
            />
          </Col>
        )}
      </Col>
      <Col className="bg-canvas-0 text-ink-1000 grow justify-between gap-2 px-4 py-2 text-sm">
        <Row className="w-full items-center justify-between gap-2">
          <Link className={clsx(linkClass, '')} href={contractPath(contract)}>
            <span className="font-semibold">
              {answer.prob <= 0.02 ? '<2%' : formatPercent(answer.prob)}
            </span>{' '}
            <span className="text-xs">chance of 3rd date</span>
          </Link>
          <MatchPositionsButton
            contract={contract}
            answer={answer}
            modalHeader={
              <MatchAvatars profileLover={profileLover} matchedLover={lover} />
            }
          />
        </Row>
      </Col>
    </Col>
  )
}
