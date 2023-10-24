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
import { Linkify } from 'web/components/widgets/linkify'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { calculateAge } from './calculate-age'
import LoverPrimaryInfo from './lover-primary-info'
import OnlineIcon from './online-icon'
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
      <Row className={clsx('flex-wrap justify-between gap-2 py-1')}>
        <Col className="gap-1">
          <Row className="items-center gap-2 text-xl">
            <span>
              <span className="font-semibold">{user.name}</span>,{' '}
              {calculateAge(lover.birthdate)}
            </span>
            <OnlineIcon last_online_time={lover.last_online_time} />
          </Row>
          <LoverPrimaryInfo lover={lover} />
        </Col>
        {isCurrentUser ? (
          <Row className={'items-center gap-1 sm:gap-2'}>
            {lover && (
              <Button
                color={'gray-outline'}
                onClick={() => router.push('profile')}
                size="sm"
              >
                <PencilIcon className=" h-4 w-4" />
              </Button>
            )}
          </Row>
        ) : (
          <Row className="items-center gap-1 sm:gap-2">
            <SendMessageButton toUser={user} currentUser={currentUser} />
            <MoreOptionsUserButton user={user} />
          </Row>
        )}
      </Row>
      <Col className={'mt-1 gap-2'}>
        {user.bio && (
          <div className="text-sm">
            <Linkify text={user.bio}></Linkify>
          </div>
        )}
        {/* TODO: add this to more info, not that important */}
        {/* <Row className="text-ink-400 mt-2 flex-wrap items-center gap-2 sm:gap-4">
          {user.website && (
            <a
              href={
                'https://' +
                lover.website.replace('http://', '').replace('https://', '')
              }
            >
              <Row className="items-center gap-1">
                <LinkIcon className="h-4 w-4" />
                <span className="text-ink-400 text-sm">{user.website}</span>
              </Row>
            </a>
          )}

          {lover.twitter && (
            <a
              href={`https://twitter.com/${lover.twitter
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
        </Row> */}
      </Col>
    </Col>
  )
}
