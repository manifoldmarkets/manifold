import { PencilIcon } from '@heroicons/react/outline'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Router from 'next/router'
import Link from 'next/link'

import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import LoverPrimaryInfo from './lover-primary-info'
import OnlineIcon from '../online-icon'
import { track } from 'web/lib/service/analytics'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { deleteLover } from 'love/lib/supabase/lovers'
import { ShareProfileButton } from '../widgets/share-profile-button'
import { Lover } from 'common/love/lover'
import { useUser } from 'web/hooks/use-user'
import { linkClass } from 'web/components/widgets/site-link'
import { LikeButton } from '../widgets/like-button'
import { LikeData } from 'love/hooks/use-likes'

export default function LoverProfileHeader(props: {
  user: User
  lover: Lover
  simpleView?: boolean
  likesReceived: LikeData[]
  refreshLikes: () => void
}) {
  const { user, lover, simpleView, likesReceived, refreshLikes } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id

  return (
    <Col className="w-full">
      <Row className={clsx('flex-wrap justify-between gap-2 py-1')}>
        <Row className="items-center gap-1">
          <LikeButton
            className=""
            targetId={user.id}
            liked={
              !!currentUser &&
              likesReceived.map((l) => l.userId).includes(currentUser.id)
            }
            refresh={refreshLikes}
          />
          <Col className="gap-1">
            <Row className="items-center gap-1 text-xl">
              <OnlineIcon last_online_time={lover.last_online_time} />
              <span>
                {simpleView ? (
                  <Link className={linkClass} href={`/${user.username}`}>
                    <span className="font-semibold">{user.name}</span>
                  </Link>
                ) : (
                  <span className="font-semibold">{user.name}</span>
                )}
                , {lover.age}
              </span>
            </Row>
            <LoverPrimaryInfo lover={lover} />
          </Col>
        </Row>
        {currentUser && isCurrentUser ? (
          <Row className={'items-center gap-1 sm:gap-2'}>
            <ShareProfileButton
              className="hidden sm:flex"
              username={user.username}
            />
            <Button
              color={'gray-outline'}
              onClick={() => {
                track('edit love profile')
                Router.push('profile')
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
            <ShareProfileButton
              className="hidden sm:flex"
              username={user.username}
            />
            <SendMessageButton toUser={user} currentUser={currentUser} />
            <MoreOptionsUserButton user={user} />
          </Row>
        )}
      </Row>

      <Row className="justify-end sm:hidden">
        <ShareProfileButton username={user.username} />
      </Row>
    </Col>
  )
}
