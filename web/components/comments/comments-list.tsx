import { ContractComment } from 'common/comment'
import { groupConsecutive } from 'common/util/array'
import { getUserCommentsQuery } from 'web/lib/firebase/comments'
import { usePagination } from 'web/hooks/use-pagination'
import { SiteLink } from '../widgets/site-link'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { RelativeTimestamp } from '../relative-timestamp'
import { User } from 'common/user'
import { Col } from '../layout/col'
import { Content } from '../widgets/editor'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserLink } from 'web/components/widgets/user-link'
import { PaginationNextPrev } from '../widgets/pagination'

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

  const page = usePagination({ q: getUserCommentsQuery(user.id), pageSize: 50 })
  const { isStart, isEnd, getNext, getPrev, getItems, isLoading } = page

  const pageComments = groupConsecutive(getItems(), (c) => {
    return {
      contractId: c.contractId,
      contractQuestion: c.contractQuestion,
      contractSlug: c.contractSlug,
    }
  })

  if (isLoading) {
    return <LoadingIndicator className="mt-4" />
  }

  if (pageComments.length === 0) {
    if (isStart && isEnd) {
      return <p className="text-ink-500 mt-4">No comments yet</p>
    } else {
      // this can happen if their comment count is a multiple of page size
      return <p className="text-ink-500 mt-4">No more comments to display</p>
    }
  }

  return (
    <Col className={'bg-ink'}>
      {pageComments.map(({ key, items }, i) => {
        return <ProfileCommentGroup key={i} groupKey={key} items={items} />
      })}
      <nav
        className="border-ink-200 border-t px-4 py-3 sm:px-6"
        aria-label="Pagination"
      >
        <PaginationNextPrev
          prev={!isStart ? 'Previous' : null}
          next={!isEnd ? 'Next' : null}
          onClickPrev={getPrev}
          onClickNext={getNext}
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
    <div className="border-b p-5">
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
