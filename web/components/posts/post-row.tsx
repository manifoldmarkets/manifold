import Link from 'next/link'
import { TopLevelPost } from 'common/top-level-post'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { Avatar } from '../widgets/avatar'
import { UserIcon } from '@heroicons/react/solid'
import { Tooltip } from '../widgets/tooltip'
import { UserHovercard } from '../user/user-hovercard'
import { EyeOffIcon } from '@heroicons/react/outline'
import { BoostedTooltip } from '../contract/boost-column'

export function PostRow(props: {
  post: TopLevelPost
  highlighted?: boolean
  faded?: boolean
  hideAvatar?: boolean
  // Add any other props similar to ContractRow if needed for styling/functionality
}) {
  const { post, highlighted, faded, hideAvatar } = props

  // Example handler, similar to ContractRow's onClick
  const onClick = () => {
    track('click browse post', {
      slug: post.slug,
      postId: post.id,
    })
  }

  return (
    <Col className={clsx('w-full sm:mb-0.5', faded && 'text-ink-500')}>
      <Link
        href={`/post/${post.slug}`} // Assuming undefined for username for now
        onClick={onClick}
        className={clsx(
          'flex w-full flex-col p-2 text-base outline-none transition-colors sm:rounded-md',
          highlighted
            ? 'bg-primary-100'
            : 'hover:bg-primary-100 focus-visible:bg-primary-100 active:bg-primary-100'
        )}
      >
        <Col className=" w-full items-start gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
          <Col className="w-full">
            <Row className="items-center gap-2 sm:gap-4">
              {!hideAvatar && (
                <UserHovercard userId={post.creatorId}>
                  <Avatar
                    size="xs"
                    username={post.creatorUsername}
                    avatarUrl={post.creatorAvatarUrl}
                    noLink // Or link to user profile if desired
                  />
                </UserHovercard>
              )}
              <Row className="items-center gap-1">
                {post.visibility === 'unlisted' && (
                  <EyeOffIcon className="text-ink-500 h-4 w-4" />
                )}
                <span
                  className={clsx(
                    'line-clamp-3',
                    post.visibility === 'unlisted' && 'text-ink-500'
                  )}
                >
                  {post.title}
                </span>
              </Row>
            </Row>
          </Col>
          {/* Hide normal action columns row on mobile when showing position row */}
          <Row
            className={clsx('w-full items-center justify-end gap-8 sm:w-fit')}
          >
            <Row>
              <BoostedTooltip
                boosted={post.boosted}
                placement={'top'}
                className="mr-3 w-4"
              />
              <Tooltip
                text={`${post.uniqueUsers} unique users commented or reacted`}
              >
                <Row className="text-ink-700 w-[6.5rem] items-center justify-start gap-0.5 sm:w-[4.62rem]">
                  <UserIcon className={'text-ink-400 h-4 w-4 shrink-0'} />
                  {post.uniqueUsers}
                </Row>
              </Tooltip>
            </Row>
            <div className="w-12 text-cyan-600">POST</div>
            <div className="invisible w-12"></div>
          </Row>
        </Col>
      </Link>
    </Col>
  )
}
