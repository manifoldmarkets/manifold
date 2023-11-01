import { PencilIcon } from '@heroicons/react/outline'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { User } from 'common/user'
import { Lover } from 'love/hooks/use-lover'
import { NextRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { calculateAge } from './calculate-age'
import LoverPrimaryInfo from './lover-primary-info'
import OnlineIcon from './online-icon'
import { track } from 'web/lib/service/analytics'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { deleteLover } from 'love/lib/supabase/lovers'

export default function LoverProfileHeader(props: {
  isCurrentUser: boolean
  currentUser: User | null | undefined
  user: User
  lover: Lover
  router: NextRouter
}) {
  const { isCurrentUser, currentUser, user, lover, router } = props
  return (
    <Col className="w-full">
      <Row className={clsx('flex-wrap justify-between gap-2 py-1')}>
        <Col className="gap-1">
          <Row className="items-center gap-1 text-xl">
            <OnlineIcon last_online_time={lover.last_online_time} />
            <span>
              <span className="font-semibold">{user.name}</span>,{' '}
              {calculateAge(lover.birthdate)}
            </span>
          </Row>
          <LoverPrimaryInfo lover={lover} />
        </Col>
        {currentUser && isCurrentUser ? (
          <Row className={'items-center gap-1 sm:gap-2'}>
            <Button
              color={'gray-outline'}
              onClick={() => {
                track('edit love profile')
                router.push('profile')
              }}
              size="sm"
            >
              <PencilIcon className=" h-4 w-4" />
            </Button>

            <DropdownMenu
              menuWidth={'w-36'}
              icon={
                <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
              }
              items={[
                {
                  name: 'Delete profile',
                  icon: null,
                  onClick: async () => {
                    const confirmed = confirm(
                      'Are you sure you want to delete your profile? This cannot be undone.'
                    )
                    if (confirmed) {
                      track('delete love profile')
                      await deleteLover(currentUser.id)
                      window.location.reload()
                    }
                  },
                },
              ]}
            />
          </Row>
        ) : (
          <Row className="items-center gap-1 sm:gap-2">
            <SendMessageButton toUser={user} currentUser={currentUser} />
            <MoreOptionsUserButton user={user} />
          </Row>
        )}
      </Row>
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
  )
}
