import { usePrivateUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import React, { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import clsx from 'clsx'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { useAdmin } from 'web/hooks/use-admin'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { BlockUser } from 'web/components/profile/block-user'
import { ReportUser } from 'web/components/profile/report-user'
import { Title } from 'web/components/widgets/title'

export function MoreOptionsUserButton(props: { user: User }) {
  const { user } = props
  const { id: userId, name } = user
  const currentUser = usePrivateUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const isAdmin = useAdmin()
  if (!currentUser || currentUser.id === userId) return null

  return (
    <>
      <Button color={'gray-white'} onClick={() => setIsModalOpen(true)}>
        <DotsHorizontalIcon
          className={clsx('h-5 w-5 flex-shrink-0')}
          aria-hidden="true"
        />
      </Button>
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className={'rounded-md bg-white p-4 pt-1'}>
          {isAdmin && (
            <Row className={'mt-3 justify-end'}>
              <Button
                color={'red'}
                onClick={() => {
                  updateUser(userId, {
                    isBannedFromPosting: !(user.isBannedFromPosting ?? false),
                  })
                }}
              >
                {user.isBannedFromPosting ? 'Banned' : 'Ban User'}
              </Button>
            </Row>
          )}
          <Title className={'!mb-2'}>{name}</Title>
          <UncontrolledTabs
            className={'mb-4'}
            tabs={[
              {
                title: 'Block',
                content: (
                  <BlockUser
                    user={user}
                    currentUser={currentUser}
                    closeModal={() => setIsModalOpen(false)}
                  />
                ),
              },
              {
                title: 'Report',
                content: (
                  <ReportUser
                    user={user}
                    currentUser={currentUser}
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
