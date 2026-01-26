import { CogIcon, DotsHorizontalIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import {
  supabasePrivateUserConsolePath,
  supabaseUserConsolePath,
} from 'common/envs/constants'
import { User, UserBan } from 'common/user'
import { buildArray } from 'common/util/array'
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
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { usePrivateUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { AdminPrivateUserData } from '../profile/admin-private-user-data'
import { EditProfile } from '../profile/edit-profile'
import { AccountSettings } from '../profile/settings'
import SuperBanControl from '../SuperBanControl'
import { BanModal } from '../moderation/ban-modal'
import { api } from 'web/lib/api/api'

export function UserSettingButton(props: { user: User }) {
  const { user } = props
  const { id: userId, name } = user
  const currentPrivateUser = usePrivateUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tabIndex, setTabIndex] = useState(0)
  const [showBanModal, setShowBanModal] = useState(false)
  const [bans, setBans] = useState<UserBan[]>([])
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

  // Fetch bans when ban modal is opened
  useEffect(() => {
    if (showBanModal) {
      api('get-user-bans', { userId })
        .then((res) => {
          setBans(res.bans as UserBan[])
        })
        .catch(() => {
          // Ignore errors
        })
    }
  }, [showBanModal, userId])

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
      <Modal open={isModalOpen} setOpen={setIsModalOpen} size="md">
        <Col className="bg-canvas-0 max-h-[85vh] overflow-hidden rounded-xl shadow-xl">
          {/* Header */}
          <div className="from-primary-600 to-primary-500 bg-gradient-to-r px-6 py-5">
            <Row className="items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{name}</h2>
                <p className="text-sm text-white/70">Joined {createdTime}</p>
              </div>
              {(isAdmin || isTrusted) && (
                <Row className="flex-wrap gap-2">
                  {isAdmin && (
                    <Button
                      color="green"
                      size="xs"
                      onClick={() =>
                        router.push(`/admin/user-info?userId=${userId}`)
                      }
                    >
                      Manage Account
                    </Button>
                  )}
                  <SuperBanControl userId={userId} />
                  <Button
                    color={'red'}
                    size="xs"
                    onClick={() => {
                      setShowBanModal(true)
                      setIsModalOpen(false)
                    }}
                  >
                    Manage Bans
                  </Button>
                </Row>
              )}
            </Row>
            {isAdmin && (
              <Row className="mt-3 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                <a
                  className="hover:text-white hover:underline"
                  href={supabaseUserConsolePath(user.id)}
                >
                  supabase user
                </a>
                <a
                  className="hover:text-white hover:underline"
                  href={supabasePrivateUserConsolePath(user.id)}
                >
                  private user
                </a>
                <SimpleCopyTextButton
                  text={user.id}
                  tooltip="Copy user id"
                  className="!px-1 !py-px !text-white/70 hover:!text-white"
                  eventTrackingName={'admin copy user id'}
                />
              </Row>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
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
          </div>
        </Col>
      </Modal>

      <BanModal
        user={user}
        bans={bans}
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
      />
    </>
  )
}
