import { CogIcon, DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import {
  supabasePrivateUserConsolePath,
  supabaseUserConsolePath,
} from 'common/envs/constants'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { DAY_MS } from 'common/util/time'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'
import {
  Referrals,
  useReferralCount,
} from 'web/components/buttons/referrals-button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { BlockUser } from 'web/components/profile/block-user'
import { ReportUser } from 'web/components/profile/report-user'
import { Title } from 'web/components/widgets/title'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { usePrivateUser } from 'web/hooks/use-user'
import { banUser } from 'web/lib/api/api'
import { Row } from '../layout/row'
import { AdminPrivateUserData } from '../profile/admin-private-user-data'
import { EditProfile } from '../profile/edit-profile'
import { AccountSettings } from '../profile/settings'
import SuperBanControl from '../SuperBanControl'
import { Input } from '../widgets/input'

export function UserSettingButton(props: { user: User }) {
  const { user } = props
  const { id: userId, name } = user
  const currentPrivateUser = usePrivateUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tabIndex, setTabIndex] = useState(0)
  const [showBanModal, setShowBanModal] = useState(false)
  const [banDays, setBanDays] = useState<number | undefined>(undefined)
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  const numReferrals = useReferralCount(user)
  const router = useRouter()

  useEffect(() => {
    const tab = router.query.tab?.toString().toLowerCase()
    if (!tab) return

    const isYou = currentPrivateUser?.id === userId
    const tabMapping: Record<string, number> = {
      'edit profile': 0,
      'account settings': isYou ? 1 : 0,
      block: !isYou ? 0 : 0,
      report: !isYou ? 1 : 0,
    }

    const index = tabMapping[tab]
    if (index !== undefined) {
      setIsModalOpen(true)
      setTabIndex(index)
    }
  }, [router.query, currentPrivateUser, userId])

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
        {isYou ? (
          <CogIcon
            className={clsx('h-5 w-5 flex-shrink-0')}
            aria-hidden="true"
          />
        ) : (
          <DotsHorizontalIcon
            className={clsx('h-5 w-5 flex-shrink-0')}
            aria-hidden="true"
          />
        )}
      </Button>
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <div className="bg-canvas-0 text-ink-1000 max-h-[80vh]  overflow-y-auto rounded-md p-4">
          <Col className="h-full">
            <div className="mb-2 flex flex-wrap justify-between">
              <Title className={'!mb-0'}>{name}</Title>
              {(isAdmin || isTrusted) && (
                <Row className="gap-2">
                  <SuperBanControl userId={userId} />
                  {user.isBannedFromPosting ? (
                    <Button
                      color={'red'}
                      size="xs"
                      onClick={() => {
                        banUser({
                          userId,
                          unban: true,
                        })
                      }}
                    >
                      Unban User
                    </Button>
                  ) : (
                    <>
                      <Button
                        color={'red'}
                        size="xs"
                        onClick={() => {
                          banUser({
                            userId,
                            unban: false,
                          })
                        }}
                      >
                        Ban User
                      </Button>
                      <Button
                        color={'gray-white'}
                        size="xs"
                        onClick={() => setShowBanModal(true)}
                      >
                        Temp Ban
                      </Button>
                    </>
                  )}
                </Row>
              )}
            </div>
            <Row
              className={
                'text-ink-600 flex-wrap items-center gap-x-3 gap-y-1 px-1'
              }
            >
              <span className={'text-sm'}>Joined {createdTime}</span>
              {isAdmin && (
                <>
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
            <QueryUncontrolledTabs
              className={'mb-4'}
              defaultIndex={tabIndex}
              tabs={buildArray([
                isYou
                  ? [
                      {
                        title: 'Edit Profile',
                        content: (
                          <EditProfile
                            auth={{ user, privateUser: currentPrivateUser }}
                          />
                        ),
                      },
                      {
                        title: 'Account Settings',
                        content: (
                          <AccountSettings
                            user={user}
                            privateUser={currentPrivateUser}
                          />
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
                isAdmin && {
                  title: 'Admin',
                  content: <AdminPrivateUserData userId={userId} />,
                },
                {
                  title: `${numReferrals} Referrals`,
                  content: <Referrals user={user} />,
                },
                // TODO: if isYou include a tab for users you've blocked?
              ])}
            />
          </Col>
        </div>
      </Modal>

      <Modal open={showBanModal} setOpen={setShowBanModal}>
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <Title>Temporarily Ban User</Title>
          <Col className="gap-2">
            <span className="text-ink-700">Ban {name} for how many days?</span>
            <Row className="w-fit items-center gap-2">
              <Input
                type="number"
                min="1"
                value={banDays}
                onChange={(e) =>
                  setBanDays(
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="border-ink-300 w-24 rounded border px-3 py-2"
                autoFocus
              />
              <span className="text-ink-600">days</span>
            </Row>
          </Col>
          <Row className="gap-2">
            <Button
              disabled={!banDays}
              color="red"
              onClick={() => {
                const unbanTime = banDays
                  ? Date.now() + banDays * DAY_MS
                  : undefined
                banUser({
                  userId,
                  unban: false,
                  unbanTime,
                })
                setShowBanModal(false)
              }}
            >
              Confirm Ban
            </Button>
            <Button color="gray-white" onClick={() => setShowBanModal(false)}>
              Cancel
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
