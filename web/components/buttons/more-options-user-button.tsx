import { usePrivateUser } from 'web/hooks/use-user'
import { Button, buttonClass } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import clsx from 'clsx'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { ChartBarIcon, PencilIcon } from '@heroicons/react/solid'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { BlockUser } from 'web/components/profile/block-user'
import { ReportUser } from 'web/components/profile/report-user'
import { Title } from 'web/components/widgets/title'
import { Row } from '../layout/row'
import {
  supabasePrivateUserConsolePath,
  supabaseUserConsolePath,
} from 'common/envs/constants'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'
import {
  Referrals,
  useReferralCount,
} from 'web/components/buttons/referrals-button'
import { banUser } from 'web/lib/firebase/api'
import SuperBanControl from '../SuperBanControl'
import Link from 'next/link'
import { linkClass } from '../widgets/site-link'
import { buildArray } from 'common/util/array'
import { DeleteYourselfButton } from '../profile/delete-yourself'
import { Settings } from '../profile/settings'

export function MoreOptionsUserButton(props: { user: User }) {
  const { user } = props
  const { id: userId, name } = user
  const currentPrivateUser = usePrivateUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  const numReferrals = useReferralCount(user)

  if (!currentPrivateUser) return <div />

  const createdTime = new Date(user.createdTime).toLocaleDateString('en-us', {
    year: 'numeric',
    month: 'short',
  })

  const isYou = currentPrivateUser.id === userId

  return (
    <>
      <Button
        color={'gray-white'}
        className="rounded-none px-6"
        onClick={() => setIsModalOpen(true)}
      >
        <DotsHorizontalIcon
          className={clsx('h-5 w-5 flex-shrink-0')}
          aria-hidden="true"
        />
      </Button>
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className={'bg-canvas-0 text-ink-1000 rounded-md p-4 '}>
          <div className="mb-2 flex flex-wrap justify-between">
            <Title className={'!mb-0'}>{name}</Title>
            {(isAdmin || isTrusted) && (
              <Row className="gap-2">
                <SuperBanControl userId={userId} />
                <Button
                  color={'red'}
                  size="xs"
                  onClick={() => {
                    banUser({
                      userId,
                      unban: user.isBannedFromPosting ?? false,
                    })
                  }}
                >
                  {user.isBannedFromPosting ? 'Banned' : 'Ban User'}
                </Button>
              </Row>
            )}
          </div>
          <Row
            className={
              'text-ink-600 flex-wrap items-center gap-x-3 gap-y-1 px-1'
            }
          >
            <span className={'text-sm'}>Joined {createdTime}</span>
            <Link
              href={`/${user.username}/calibration`}
              className={clsx(linkClass, 'text-sm')}
            >
              <ChartBarIcon className="mb-1 mr-1 inline h-4 w-4" />
              Calibration
            </Link>

            {isYou && (
              <>
                <Link
                  href="/profile"
                  className={clsx(
                    buttonClass('2xs', 'gray-white'),
                    '-mx-1 gap-0.5 !px-1 !py-0.5'
                  )}
                >
                  <PencilIcon className="mb-0.5 h-4 w-4" />
                  <span className="text-sm">Edit profile</span>
                </Link>
              </>
            )}

            {isAdmin && (
              <>
                <div className="ml-auto" />
                <a
                  className="text-primary-400 text-sm hover:underline"
                  href={supabaseUserConsolePath(user.id)}
                >
                  supabase user
                </a>
                <a
                  className="text-primary-400 text-sm hover:underline"
                  href={supabasePrivateUserConsolePath(user.id)}
                >
                  private user
                </a>
                <SimpleCopyTextButton
                  text={user.id}
                  tooltip="Copy user id"
                  className="!px-1 !py-px"
                  eventTrackingName={'admin copy user id'}
                />
              </>
            )}
          </Row>
          <UncontrolledTabs
            className={'mb-4'}
            tabs={buildArray([
              {
                title: `${numReferrals} Referrals`,
                content: <Referrals user={user} />,
              },
              // TODO: if isYou include a tab for users you've blocked?
              isYou
                ? [
                    {
                      title: 'Settings',
                      content: (
                        <Settings
                          user={user}
                          privateUser={currentPrivateUser}
                        />
                      ),
                    },
                    {
                      title: 'Delete Account',
                      content: (
                        <div className="flex min-h-[200px] items-center justify-center p-4">
                          <DeleteYourselfButton username={user.username} />
                        </div>
                      ),
                    },
                  ]
                : [
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
                  ],
            ])}
          />
        </Col>
      </Modal>
    </>
  )
}
