import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { SiteLink } from './site-link'
import { Row } from './layout/row'
import { Avatar } from './avatar'
import { RelativeTimestamp } from './relative-timestamp'
import { UserLink } from './user-page'
import { User } from 'common/user'
import { Col } from './layout/col'
import { groupBy } from 'lodash'
import { Content } from './editor'

export function UserCommentsList(props: {
  user: User
  comments: Comment[]
  contractsById: { [id: string]: Contract }
}) {
  const { comments, contractsById } = props

  // we don't show comments in groups here atm, just comments on contracts
  const contractComments = comments.filter((c) => c.contractId)
  const commentsByContract = groupBy(contractComments, 'contractId')

  return (
    <Col className={'bg-white'}>
      {Object.entries(commentsByContract).map(([contractId, comments]) => {
        const contract = contractsById[contractId]
        return (
          <div key={contractId} className={'border-width-1 border-b p-5'}>
            <SiteLink
              className={'mb-2 block text-sm text-indigo-700'}
              href={contractPath(contract)}
            >
              {contract.question}
            </SiteLink>
            {comments.map((comment) => (
              <ProfileComment
                key={comment.id}
                comment={comment}
                className="relative flex items-start space-x-3 pb-6"
              />
            ))}
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
