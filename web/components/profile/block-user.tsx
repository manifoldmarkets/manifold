import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { privateUsers, unfollow } from 'web/lib/firebase/users'
import { toast } from 'react-hot-toast'
import { PrivateUser, User } from 'common/user'

export const BlockUser = (props: {
  user: User
  currentUser: PrivateUser
  closeModal: () => void
}) => {
  const { user, currentUser, closeModal } = props
  const { id: userId } = user

  const isBlocked = currentUser.blockedUserIds?.includes(userId)
  const blockUser = async () => {
    await updateDoc(doc(privateUsers, currentUser.id), {
      blockedUserIds: arrayUnion(userId),
    })
    await updateDoc(doc(privateUsers, userId), {
      blockedByUserIds: arrayUnion(currentUser.id),
    })
    await unfollow(currentUser.id, userId)
  }

  const unblockUser = async () => {
    await updateDoc(doc(privateUsers, currentUser.id), {
      blockedUserIds: arrayRemove(userId),
    })
    await updateDoc(doc(privateUsers, userId), {
      blockedByUserIds: arrayRemove(currentUser.id),
    })
  }

  const onBlock = async () => {
    await toast.promise(blockUser(), {
      loading: 'Blocking...',
      success: `You'll no longer see content from this user`,
      error: 'Error blocking user',
    })
  }
  return (
    <Col>
      <Col className={'mb-6 gap-2'}>
        <span>
          · You {isBlocked ? "can't" : "won't"} see their questions on home and
          search.
        </span>
        <span>· You {isBlocked ? "can't" : "won't"} see their comments</span>
        <span>
          · They {isBlocked ? "can't" : "won't"} see your questions on home and
          search.
        </span>
        <span>
          · They {isBlocked ? "can't" : "won't"} add new comments on your
          content.
        </span>
      </Col>
      <Row className={'justify-between'}>
        <Button onClick={closeModal} color={'gray-white'}>
          Cancel
        </Button>
        <Row className={'gap-4'}>
          {isBlocked ? (
            <Button
              size="sm"
              color="indigo"
              className="my-auto"
              onClick={withTracking(unblockUser, 'unblock')}
            >
              Unblock {user.name}
            </Button>
          ) : (
            <Button
              size="sm"
              color="red"
              className="my-auto"
              onClick={withTracking(onBlock, 'block')}
            >
              Block {user.name}
            </Button>
          )}
        </Row>
      </Row>
    </Col>
  )
}
