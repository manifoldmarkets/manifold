import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import React from 'react'
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { privateUsers } from 'web/lib/firebase/users'
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
          · You {isBlocked ? `will` : `won't`} see content from them on your
          homepage and search.
        </span>
        <span>
          · Their comments will be {isBlocked ? `visible` : `invisible`} to you.
        </span>
        <span>
          · They {isBlocked ? `will` : `won't`} be able to add new comments to
          your content.
        </span>
        <span>
          · They {isBlocked ? `will` : `won't`} see your content on their
          homepage and search.
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
              color="gray-outline"
              className="my-auto"
              onClick={withTracking(unblockUser, 'unblock')}
            >
              Blocked
            </Button>
          ) : (
            <Button
              size="sm"
              color="red"
              className="my-auto"
              onClick={withTracking(onBlock, 'block')}
            >
              Block User
            </Button>
          )}
        </Row>
      </Row>
    </Col>
  )
}
