import { PencilIcon } from '@heroicons/react/outline'
import { LinkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { User } from 'common/user'
import { Lover } from 'love/hooks/use-lover'
import { NextRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { FollowButton } from 'web/components/buttons/follow-button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { QuestsOrStreak } from 'web/components/quests-or-streak'
import { Linkify } from 'web/components/widgets/linkify'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { calculateAge } from './calculate-age'
export default function LoverProfileHeader(props: {
  isCurrentUser: boolean
  currentUser: User | null | undefined
  user: User
  lover: Lover
  router: NextRouter
}) {
  const { isCurrentUser, currentUser, user, lover, router } = props
  const isMobile = useIsMobile()
  return (
    <Col className="w-full">
      <Row
        className={clsx(
          'flex-wrap gap-2 py-1',
          isMobile ? '' : 'justify-between'
        )}
      >
        <Col>
          <div className="text-xl">
            <span className="font-semibold">{user.name}</span>,{' '}
            {calculateAge(lover.birthdate)}
          </div>
          <div className="text-ink-500 text-sm">@{user.username}</div>
        </Col>
        {isCurrentUser ? (
          <Row className={'items-center gap-1 sm:gap-2'}>
            {lover && (
              <Button
                color={'gray-outline'}
                className={'h-12'}
                onClick={() => router.push('profile')}
              >
                <PencilIcon className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </Row>
        ) : isMobile ? (
          <>
            <div className={'my-auto'}>
              <SendMessageButton toUser={user} currentUser={currentUser} />
            </div>
            <div className={'my-auto'}>
              <FollowButton userId={user.id} />
            </div>
            <div className={'my-auto'}>
              <MoreOptionsUserButton user={user} />
            </div>
          </>
        ) : (
          <Row className="items-center gap-1 sm:gap-2">
            <SendMessageButton toUser={user} currentUser={currentUser} />
            <FollowButton userId={user.id} />
            <MoreOptionsUserButton user={user} />
          </Row>
        )}
      </Row>
      <Col className={'mt-1'}>
        {user.bio && (
          <div className="sm:text-md mt-1 text-sm">
            <Linkify text={user.bio}></Linkify>
          </div>
        )}
        <Row className="text-ink-400 mt-2 flex-wrap items-center gap-2 sm:gap-4">
          {user.website && (
            <a
              href={
                'https://' +
                user.website.replace('http://', '').replace('https://', '')
              }
            >
              <Row className="items-center gap-1">
                <LinkIcon className="h-4 w-4" />
                <span className="text-ink-400 text-sm">{user.website}</span>
              </Row>
            </a>
          )}

          {user.twitterHandle && (
            <a
              href={`https://twitter.com/${user.twitterHandle
                .replace('https://www.twitter.com/', '')
                .replace('https://twitter.com/', '')
                .replace('www.twitter.com/', '')
                .replace('twitter.com/', '')}`}
            >
              <Row className="items-center gap-1">
                <img
                  src="/twitter-logo.svg"
                  className="h-4 w-4"
                  alt="Twitter"
                />
                <span className="text-ink-400 text-sm">
                  {user.twitterHandle}
                </span>
              </Row>
            </a>
          )}
        </Row>
      </Col>
    </Col>
  )
}
