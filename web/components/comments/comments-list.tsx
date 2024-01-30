import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { groupConsecutive } from 'common/util/array'
import { useEffect, useState } from 'react'
import { UserLink } from 'web/components/widgets/user-link'
import { Col } from '../layout/col'
import { RelativeTimestamp } from '../relative-timestamp'
import { Avatar } from '../widgets/avatar'
import { Content } from '../widgets/editor'
import { PaginationNextPrev } from '../widgets/pagination'
import Link from 'next/link'
import { useIsAuthorized } from 'web/hooks/use-user'
import { api } from 'web/lib/firebase/api'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { sum } from 'lodash'
import { getCommentLink } from 'web/components/feed/copy-link-date-time'
import clsx from 'clsx'
import { linkClass } from 'web/components/widgets/site-link'

type ContractKey = {
  contractId: string
  contractSlug: string
  contractQuestion: string
}

function contractPath(slug: string) {
  // by convention this includes the contract creator username, but we don't
  // have that handy, so we just put /market/
  return `/market/${slug}`
}

export function UserCommentsList(props: { user: User; isPolitics?: boolean }) {
  const { user, isPolitics } = props
  const pageSize = 50
  const [pageNum, setPageNum] = useState(0)
  const [groupedComments, setGroupedComments] = useState<
    {
      key: {
        contractId: string
        contractQuestion: string
        contractSlug: string
      }
      items: ContractComment[]
    }[]
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const isAuth = useIsAuthorized()

  useEffect(() => {
    setIsLoading(true)
    api('comments', {
      userId: user.id,
      limit: pageSize,
      page: pageNum,
      isPolitics,
    })
      .then((result) =>
        setGroupedComments(
          groupConsecutive(result, (c) => {
            return {
              contractId: c.contractId,
              contractQuestion: c.contractQuestion,
              contractSlug: c.contractSlug,
            }
          })
        )
      )
      .finally(() => setIsLoading(false))
  }, [pageNum, isAuth])

  if (groupedComments.length === 0) {
    if (pageNum == 0) {
      return <p className="text-ink-500 mt-4">No comments yet</p>
    } else {
      // this can happen if their comment count is a multiple of page size
      return <p className="text-ink-500 mt-4">No more comments to display</p>
    }
  }
  const totalItems = sum(
    Object.values(groupedComments).map((c) => c.items.length)
  )
  return (
    <Col className={'bg-canvas-50'}>
      {isLoading && <LoadingIndicator className="mt-4" />}
      {!isLoading &&
        groupedComments.map(({ key, items }, i) => {
          return (
            <ProfileCommentGroup
              key={i}
              groupKey={key}
              items={items as ContractComment[]}
            />
          )
        })}

      <nav
        className="border-ink-200 border-t px-4 py-3 sm:px-6"
        aria-label="Pagination"
      >
        <PaginationNextPrev
          getNext={() => setPageNum(pageNum + 1)}
          getPrev={() => setPageNum(pageNum - 1)}
          isEnd={totalItems < pageSize}
          isLoading={isLoading}
          isStart={pageNum === 0}
        />
      </nav>
    </Col>
  )
}

function ProfileCommentGroup(props: {
  groupKey: ContractKey
  items: ContractComment[]
}) {
  const { groupKey, items } = props
  const { contractSlug, contractQuestion } = groupKey
  const path = contractPath(contractSlug)
  return (
    <div className="bg-canvas-0 border-ink-300 border-b p-2">
      <Link
        className={clsx(
          'text-primary-700 mb-2 block py-1 pl-2 font-medium',
          linkClass
        )}
        href={path}
      >
        {contractQuestion}
      </Link>
      <Col className="gap-6">
        {items.map((c) => (
          <ProfileComment key={c.id} comment={c} contractSlug={contractSlug} />
        ))}
      </Col>
    </div>
  )
}

function ProfileComment(props: {
  comment: ContractComment
  contractSlug: string
}) {
  const { comment, contractSlug } = props
  const {
    text,
    content,
    userId,
    userUsername,
    userName,
    userAvatarUrl,
    createdTime,
    id,
  } = comment

  return (
    <Link
      href={getCommentLink('market', contractSlug, id)}
      className={
        'hover:bg-canvas-100 relative flex flex-row items-start space-x-3 rounded-lg p-2'
      }
    >
      <Avatar noLink={true} username={userUsername} avatarUrl={userAvatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="text-ink-500 mt-0.5 text-sm">
          <UserLink
            className="text-ink-500"
            user={{
              id: userId,
              name: userName,
              username: userUsername,
            }}
            noLink={true}
          />{' '}
          <RelativeTimestamp time={createdTime} />
        </div>
        <Content content={content || text} size="sm" />
      </div>
    </Link>
  )
}
