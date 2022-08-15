import { useEffect, useState } from 'react'

import { Comment } from 'common/comment'
import { groupConsecutive } from 'common/util/array'
import { getUsersComments } from 'web/lib/firebase/comments'
import { SiteLink } from './site-link'
import { Row } from './layout/row'
import { Avatar } from './avatar'
import { RelativeTimestamp } from './relative-timestamp'
import { UserLink } from './user-page'
import { User } from 'common/user'
import { Col } from './layout/col'
import { Content } from './editor'
import { Pagination } from './pagination'
import { LoadingIndicator } from './loading-indicator'

const COMMENTS_PER_PAGE = 50

type ContractComment = Comment & {
  contractId: string
  contractSlug: string
  contractQuestion: string
}

function contractPath(slug: string) {
  // in honor of austin, who insists that contract URLs are prefixed with a username
  return `/Austin/${slug}`
}

export function UserCommentsList(props: { user: User }) {
  const { user } = props
  const [comments, setComments] = useState<ContractComment[] | undefined>()
  const [page, setPage] = useState(0)
  const start = page * COMMENTS_PER_PAGE
  const end = start + COMMENTS_PER_PAGE

  useEffect(() => {
    getUsersComments(user.id).then((cs) => {
      // we don't show comments in groups here atm, just comments on contracts
      setComments(cs.filter((c) => c.contractId) as ContractComment[])
    })
  }, [user.id])

  if (comments == null) {
    return <LoadingIndicator />
  }

  const pageComments = groupConsecutive(comments.slice(start, end), (c) => {
    return { question: c.contractQuestion, slug: c.contractSlug }
  })
  return (
    <Col className={'bg-white'}>
      {pageComments.map(({ key, items }, i) => {
        return (
          <div key={start + i} className="border-b p-5">
            <SiteLink
              className="mb-2 block pb-2 font-medium text-indigo-700"
              href={contractPath(key.slug)}
            >
              {key.question}
            </SiteLink>
            <Col className="gap-6">
              {items.map((comment) => (
                <ProfileComment
                  key={comment.id}
                  comment={comment}
                  className="relative flex items-start space-x-3"
                />
              ))}
            </Col>
          </div>
        )
      })}
      <Pagination
        page={page}
        itemsPerPage={COMMENTS_PER_PAGE}
        totalItems={comments.length}
        setPage={setPage}
      />
    </Col>
  )
}

function ProfileComment(props: { comment: Comment; className?: string }) {
  const { comment, className } = props
  const { text, content, userUsername, userName, userAvatarUrl, createdTime } =
    comment
  // TODO: find and attach relevant bets by comment betId at some point
  return (
    <Row className={className}>
      <Avatar username={userUsername} avatarUrl={userAvatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="mt-0.5 text-sm text-gray-500">
          <UserLink
            className="text-gray-500"
            username={userUsername}
            name={userName}
          />{' '}
          <RelativeTimestamp time={createdTime} />
        </p>
        <Content content={content || text} smallImage />
      </div>
    </Row>
  )
}
