import { useEffect, useState } from 'react'
import { Dictionary, groupBy, keyBy } from 'lodash'

import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { filterDefined } from 'common/util/array'
import { contractPath } from 'web/lib/firebase/contracts'
import { getUsersComments } from 'web/lib/firebase/comments'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { SiteLink } from './site-link'
import { Row } from './layout/row'
import { Avatar } from './avatar'
import { RelativeTimestamp } from './relative-timestamp'
import { UserLink } from './user-page'
import { User } from 'common/user'
import { Col } from './layout/col'
import { Content } from './editor'
import { LoadingIndicator } from './loading-indicator'

export function UserCommentsList(props: { user: User }) {
  const { user } = props
  const [comments, setComments] = useState<Dictionary<Comment[]> | undefined>()
  const [contracts, setContracts] = useState<Dictionary<Contract> | undefined>()

  useEffect(() => {
    getUsersComments(user.id).then((cs) => {
      // we don't show comments in groups here atm, just comments on contracts
      const contractComments = cs.filter((c) => c.contractId)
      const commentsByContractId = groupBy(contractComments, 'contractId')
      setComments(commentsByContractId)
    })
  }, [user.id])

  useEffect(() => {
    if (comments) {
      Promise.all(Object.keys(comments).map(getContractFromId)).then(
        (contracts) => {
          setContracts(keyBy(filterDefined(contracts), 'id'))
        }
      )
    }
  }, [comments])

  if (comments == null || contracts == null) {
    return <LoadingIndicator />
  }

  return (
    <Col className={'bg-white'}>
      {Object.entries(comments).map(([contractId, comments]) => {
        const contract = contracts[contractId]
        return (
          <div key={contractId} className="border-b p-5">
            <SiteLink
              className="mb-2 block pb-2 font-medium text-indigo-700"
              href={contractPath(contract)}
            >
              {contract.question}
            </SiteLink>
            <Col className="gap-6">
              {comments.map((comment) => (
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
