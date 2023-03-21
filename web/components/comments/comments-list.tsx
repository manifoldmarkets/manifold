import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { groupConsecutive } from 'common/util/array'
import { useEffect, useState } from 'react'
import { UserLink } from 'web/components/widgets/user-link'
import { useNumUserComments } from 'web/hooks/use-comments-supabase'
import { getUserComments } from 'web/lib/supabase/comments'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { Avatar } from '../widgets/avatar'
import { Content } from '../widgets/editor'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Pagination } from '../widgets/pagination'
import { SiteLink } from '../widgets/site-link'

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

export function UserCommentsList(props: { user: User }) {
  const { user } = props
  const pageSize = 50
  const [pageNum, setPageNum] = useState(0)
  const numComments = useNumUserComments(user.id)
  const [pageComments, setPageComments] = useState<
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

  useEffect(() => {
    setIsLoading(true)
    getUserComments(user.id, pageSize, pageNum)
      .then((result) =>
        setPageComments(
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
  }, [pageNum])

  if (pageComments.length === 0) {
    if (pageNum == 0) {
      return <p className="text-ink-500 mt-4">No comments yet</p>
    } else {
      // this can happen if their comment count is a multiple of page size
      return <p className="text-ink-500 mt-4">No more comments to display</p>
    }
  }

  return (
    <Col className={'bg-canvas-50'}>
      {isLoading && <LoadingIndicator className="mt-4" />}
      {!isLoading &&
        pageComments.map(({ key, items }, i) => {
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
        <Pagination
          page={pageNum}
          itemsPerPage={pageSize}
          totalItems={numComments}
          setPage={setPageNum}
          scrollToTop={true}
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
    <div className="bg-canvas-0 border-ink-300 border-b p-5">
      <SiteLink
        className="text-primary-700 mb-2 block pb-2 font-medium"
        href={path}
      >
        {contractQuestion}
      </SiteLink>
      <Col className="gap-6">
        {items.map((c) => (
          <ProfileComment key={c.id} comment={c} />
        ))}
      </Col>
    </div>
  )
}

function ProfileComment(props: { comment: ContractComment }) {
  const { comment } = props
  const { text, content, userUsername, userName, userAvatarUrl, createdTime } =
    comment
  // TODO: find and attach relevant bets by comment betId at some point
  return (
    <Row className="relative flex items-start space-x-3">
      <Avatar username={userUsername} avatarUrl={userAvatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="text-ink-500 mt-0.5 text-sm">
          <UserLink
            className="text-ink-500"
            username={userUsername}
            name={userName}
          />{' '}
          <RelativeTimestamp time={createdTime} />
        </p>
        <Content content={content || text} size="sm" />
      </div>
    </Row>
  )
}
