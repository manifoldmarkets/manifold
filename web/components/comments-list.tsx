import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { contractPath } from '../lib/firebase/contracts'
import { SiteLink } from './site-link'
import { Row } from './layout/row'
import { Avatar } from './avatar'
import { RelativeTimestamp } from './relative-timestamp'
import { UserLink } from './user-page'
import { User } from '../../common/user'
import { Col } from './layout/col'
import { Linkify } from './linkify'

export function UserCommentsList(props: {
  user: User
  commentsByUniqueContracts: Map<Contract, Comment[]>
}) {
  const { commentsByUniqueContracts } = props

  return (
    <Col className={'bg-white'}>
      {Array.from(commentsByUniqueContracts).map(([contract, comments]) => (
        <div key={contract.id} className={'border-width-1 border-b p-5'}>
          <div className={'mb-2 text-sm text-indigo-700'}>
            <SiteLink href={contractPath(contract)}>
              {contract.question}
            </SiteLink>
          </div>
          {comments.map((comment) => (
            <div key={comment.id} className={'relative pb-6'}>
              <div className="relative flex items-start space-x-3">
                <ProfileComment comment={comment} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </Col>
  )
}

function ProfileComment(props: { comment: Comment }) {
  const { comment } = props
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment
  // TODO: find and attach relevant bets by comment betId at some point
  return (
    <div>
      <Row className={'gap-4'}>
        <Avatar username={userUsername} avatarUrl={userAvatarUrl} />
        <div className="min-w-0 flex-1">
          <div>
            <p className="mt-0.5 text-sm text-gray-500">
              <UserLink
                className="text-gray-500"
                username={userUsername}
                name={userName}
              />{' '}
              <RelativeTimestamp time={createdTime} />
            </p>
          </div>
          <Linkify text={text} />
        </div>
      </Row>
    </div>
  )
}
