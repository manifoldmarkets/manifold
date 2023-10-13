import { usePrivateUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import clsx from 'clsx'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { BlockUser } from 'web/components/profile/block-user'
import { ReportUser } from 'web/components/profile/report-user'
import { Title } from 'web/components/widgets/title'
import { Row } from '../layout/row'
import { PROJECT_ID } from 'common/envs/constants'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'
import { ReferralsButton } from 'web/components/buttons/referrals-button'
import { banUser } from 'web/lib/firebase/api'

export function MoreOptionsUserButton(props: { user: User }) {
  const { user } = props
  const { id: userId, name } = user
  const currentPrivateUser = usePrivateUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  if (!currentPrivateUser || currentPrivateUser.id === userId) return null
  const createdTime = new Date(user.createdTime).toLocaleDateString('en-us', {
    year: 'numeric',
    month: 'short',
  })

  return (
    <>
      <Button
        color={'gray-white'}
        size={'xs'}
        onClick={() => setIsModalOpen(true)}
      >
        <DotsHorizontalIcon
          className={clsx('h-5 w-5 flex-shrink-0')}
          aria-hidden="true"
        />
      </Button>
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className={'bg-canvas-0 text-ink-1000 rounded-md p-4 '}>
          <Title className={'!mb-2 flex justify-between'}>
            {name}
            {(isAdmin || isTrusted) && (
              <Button
                color={'red'}
                onClick={() => {
                  banUser({
                    userId,
                    unban: user.isBannedFromPosting ?? false,
                  })
                }}
              >
                {user.isBannedFromPosting ? 'Banned' : 'Ban User'}
              </Button>
            )}
          </Title>
          <span className={'ml-1 text-sm'}> joined {createdTime}</span>
          {isAdmin && (
            <Row className={'items-center gap-2 px-1'}>
              <a
                className="text-primary-400 text-sm hover:underline"
                href={firestoreUserConsolePath(user.id)}
              >
                firestore user
              </a>
              <a
                className="text-primary-400 text-sm hover:underline"
                href={firestorePrivateConsolePath(user.id)}
              >
                private user
              </a>
              <ReferralsButton user={user} className={'text-sm'} />
              <SimpleCopyTextButton
                text={user.id}
                tooltip="Copy user id"
                eventTrackingName={'admin copy user id'}
              />
            </Row>
          )}
          <UncontrolledTabs
            className={'mb-4'}
            tabs={[
              {
                title: 'Block',
                content: (
                  <BlockUser
                    user={user}
                    currentUser={currentPrivateUser}
                    closeModal={() => setIsModalOpen(false)}
                  />
                ),
              },
              {
                title: 'Report',
                content: (
                  <ReportUser
                    user={user}
                    closeModal={() => setIsModalOpen(false)}
                  />
                ),
              },
            ]}
          />
        </Col>
      </Modal>
    </>
  )
}

function firestoreUserConsolePath(userId: string) {
  return `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fusers~2F${userId}`
}

function firestorePrivateConsolePath(userId: string) {
  return `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fprivate-users~2F${userId}`
}
