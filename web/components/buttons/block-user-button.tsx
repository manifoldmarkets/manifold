import { usePrivateUser } from 'web/hooks/use-user'
import { privateUsers } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { User } from 'common/user'
import clsx from 'clsx'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { ReportButton } from 'web/components/buttons/report-button'

export function BlockUserButton(props: { user: User }) {
  const { user } = props
  const { id: userId, name } = user
  const currentUser = usePrivateUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  if (!currentUser || currentUser.id === userId) return null
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
    <>
      <Button color={'gray-white'} onClick={() => setIsModalOpen(true)}>
        <DotsHorizontalIcon
          className={clsx('h-5 w-5 flex-shrink-0')}
          aria-hidden="true"
        />
      </Button>
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className={'rounded-md bg-white p-4'}>
          <Title>
            {isBlocked ? `Unblock` : `Block`} {name}
          </Title>
          <span className={'mb-4 text-sm'}>
            · You {isBlocked ? `will` : `won't`} see content from them on your
            homepage and search.
            <br />· Their comments will be {isBlocked
              ? `visible`
              : `invisible`}{' '}
            to you.
            <br />· They {isBlocked ? `will` : `won't`} be able to add new
            comments to your content.
            <br />· They {isBlocked ? `will` : `won't`} see your content on
            their homepage and search.
          </span>
          <Row className={'justify-between'}>
            <Button color={'gray-white'} onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Row className={'gap-4'}>
              <ReportButton
                userId={user.id}
                name={user.name}
                noModal={true}
                label={'user'}
              />
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
      </Modal>
    </>
  )
}
