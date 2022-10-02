import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { NextRouter, useRouter } from 'next/router'
import { LinkIcon } from '@heroicons/react/solid'
import {
  ChatIcon,
  FolderIcon,
  PencilIcon,
  ScaleIcon,
} from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { User } from 'web/lib/firebase/users'
import { useUser } from 'web/hooks/use-user'
import { CreatorContractsList } from './contract/contracts-grid'
import { SEO } from './SEO'
import { Page } from './page'
import { linkClass, SiteLink } from './site-link'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Linkify } from './linkify'
import { Spacer } from './layout/spacer'
import { Row } from './layout/row'
import { genHash } from 'common/util/random'
import { QueryUncontrolledTabs } from './layout/tabs'
import { UserCommentsList } from './comments-list'
import { FullscreenConfetti } from 'web/components/fullscreen-confetti'
import { BetsList } from './bets-list'
import { FollowersButton, FollowingButton } from './following-button'
import { UserFollowButton } from './follow-button'
import { GroupsButton } from 'web/components/groups/groups-button'
import { PortfolioValueSection } from './portfolio/portfolio-value-section'
import { formatMoney } from 'common/util/format'
import {
  BettingStreakModal,
  hasCompletedStreakToday,
} from 'web/components/profile/betting-streak-modal'
import { LoansModal } from './profile/loans-modal'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { DOMAIN } from 'common/envs/constants'

export function UserPage(props: { user: User }) {
  const { user } = props
  const router = useRouter()
  const currentUser = useUser()
  const isCurrentUser = user.id === currentUser?.id
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    setShowConfetti(claimedMana)
    const query = { ...router.query }
    if (query.claimedMana || query.show) {
      delete query['claimed-mana']
      delete query['show']
      router.replace(
        {
          pathname: router.pathname,
          query,
        },
        undefined,
        { shallow: true }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const profit = user.profitCached.allTime
  const referralUrl = `https://${DOMAIN}?referrer=${user?.username}`

  return (
    <Page key={user.id}>
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {showConfetti && (
        <FullscreenConfetti recycle={false} numberOfPieces={300} />
      )}
      <Col className="relative">
        <Row className="relative px-4 pt-4">
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size={24}
            className="bg-white shadow-sm shadow-indigo-300"
          />
          {isCurrentUser && (
            <div className="absolute ml-16 mt-16 rounded-full bg-indigo-600 p-2 text-white shadow-sm shadow-indigo-300">
              <SiteLink href="/profile">
                <PencilIcon className="h-5" />{' '}
              </SiteLink>
            </div>
          )}

          <Col className="w-full gap-4 pl-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Col>
                <span className="break-anywhere text-lg font-bold sm:text-2xl">
                  {user.name}
                </span>
                <span className="sm:text-md text-greyscale-4 text-sm">
                  @{user.username}
                </span>
              </Col>
              {isCurrentUser && (
                <ProfilePrivateStats
                  currentUser={currentUser}
                  profit={profit}
                  user={user}
                  router={router}
                />
              )}
              {!isCurrentUser && <UserFollowButton userId={user.id} />}
            </div>
            <ProfilePublicStats
              className="sm:text-md text-greyscale-6 hidden text-sm md:inline"
              user={user}
            />
          </Col>
        </Row>
        <Col className="mx-4 mt-2">
          <Spacer h={1} />
          <ProfilePublicStats
            className="text-greyscale-6 text-sm md:hidden"
            user={user}
          />
          <Spacer h={1} />
          {user.bio && (
            <>
              <div className="sm:text-md mt-2 text-sm sm:mt-0">
                <Linkify text={user.bio}></Linkify>
              </div>
              <Spacer h={2} />
            </>
          )}
          {(user.website || user.twitterHandle || user.discordHandle) && (
            <Row className="mb-2 flex-wrap items-center gap-2 sm:gap-4">
              {user.website && (
                <SiteLink
                  href={
                    'https://' +
                    user.website.replace('http://', '').replace('https://', '')
                  }
                >
                  <Row className="items-center gap-1">
                    <LinkIcon className="h-4 w-4" />
                    <span className="text-greyscale-4 text-sm">
                      {user.website}
                    </span>
                  </Row>
                </SiteLink>
              )}

              {user.twitterHandle && (
                <SiteLink
                  href={`https://twitter.com/${user.twitterHandle
                    .replace('https://www.twitter.com/', '')
                    .replace('https://twitter.com/', '')
                    .replace('www.twitter.com/', '')
                    .replace('twitter.com/', '')}`}
                >
                  <Row className="items-center gap-1">
                    <img
                      src="/twitter-logo.svg"
                      className="h-4 w-4"
                      alt="Twitter"
                    />
                    <span className="text-greyscale-4 text-sm">
                      {user.twitterHandle}
                    </span>
                  </Row>
                </SiteLink>
              )}

              {user.discordHandle && (
                <SiteLink href="https://discord.com/invite/eHQBNBqXuh">
                  <Row className="items-center gap-1">
                    <img
                      src="/discord-logo.svg"
                      className="h-4 w-4"
                      alt="Discord"
                    />
                    <span className="text-greyscale-4 text-sm">
                      {user.discordHandle}
                    </span>
                  </Row>
                </SiteLink>
              )}

              {isCurrentUser && (
                <div
                  className={clsx(
                    linkClass,
                    'text-greyscale-4 cursor-pointer text-sm'
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    copyToClipboard(referralUrl)
                    toast.success('Referral link copied!', {
                      icon: (
                        <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />
                      ),
                    })
                    track('copy referral link')
                  }}
                >
                  <Row className="items-center gap-1">
                    <LinkIcon className="h-4 w-4" />
                    Earn M$250 per referral
                  </Row>
                </div>
              )}
            </Row>
          )}
          <QueryUncontrolledTabs
            currentPageForAnalytics={'profile'}
            labelClassName={'pb-2 pt-1 sm:pt-4 '}
            tabs={[
              {
                title: 'Markets',
                stackedTabIcon: <ScaleIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <CreatorContractsList user={currentUser} creator={user} />
                  </>
                ),
              },
              {
                title: 'Portfolio',
                stackedTabIcon: <FolderIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <PortfolioValueSection userId={user.id} />
                    <Spacer h={4} />
                    <BetsList user={user} />
                  </>
                ),
              },
              {
                title: 'Comments',
                stackedTabIcon: <ChatIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <Col>
                      <UserCommentsList user={user} />
                    </Col>
                  </>
                ),
              },
            ]}
          />
        </Col>
      </Col>
    </Page>
  )
}

// Assign each user to a random default banner based on the hash of userId
// TODO: Consider handling banner uploads using our own storage bucket, like user avatars.
export function defaultBannerUrl(userId: string) {
  const defaultBanner = [
    'https://images.unsplash.com/photo-1501523460185-2aa5d2a0f981?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2131&q=80',
    'https://images.unsplash.com/photo-1458682625221-3a45f8a844c7?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1974&q=80',
    'https://images.unsplash.com/photo-1558517259-165ae4b10f7f?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2080&q=80',
    'https://images.unsplash.com/photo-1563260797-cb5cd70254c8?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2069&q=80',
    'https://images.unsplash.com/photo-1603399587513-136aa9398f2d?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1467&q=80',
  ]
  return defaultBanner[genHash(userId)() % defaultBanner.length]
}

export function ProfilePrivateStats(props: {
  currentUser: User | null | undefined
  profit: number
  user: User
  router: NextRouter
}) {
  const { currentUser, profit, user, router } = props
  const [showBettingStreakModal, setShowBettingStreakModal] = useState(false)
  const [showLoansModal, setShowLoansModal] = useState(false)

  useEffect(() => {
    const showBettingStreak = router.query['show'] === 'betting-streak'
    setShowBettingStreakModal(showBettingStreak)

    const showLoansModel = router.query['show'] === 'loans'
    setShowLoansModal(showLoansModel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <Row className={'justify-between gap-4 sm:justify-end'}>
        <Col className={'text-greyscale-4 text-md sm:text-lg'}>
          <span
            className={clsx(profit >= 0 ? 'text-green-600' : 'text-red-400')}
          >
            {formatMoney(profit)}
          </span>
          <span className="mx-auto text-xs sm:text-sm">profit</span>
        </Col>
        <Col
          className={clsx('text-,d cursor-pointer sm:text-lg ')}
          onClick={() => setShowBettingStreakModal(true)}
        >
          <span
            className={clsx(
              !hasCompletedStreakToday(user)
                ? 'opacity-50 grayscale'
                : 'grayscale-0'
            )}
          >
            🔥 {user.currentBettingStreak ?? 0}
          </span>
          <span className="text-greyscale-4 mx-auto text-xs sm:text-sm">
            streak
          </span>
        </Col>
        <Col
          className={
            'text-greyscale-4 text-md flex-shrink-0 cursor-pointer sm:text-lg'
          }
          onClick={() => setShowLoansModal(true)}
        >
          <span className="text-green-600">
            🏦 {formatMoney(user.nextLoanCached ?? 0)}
          </span>
          <span className="mx-auto text-xs sm:text-sm">next loan</span>
        </Col>
      </Row>
      {BettingStreakModal && (
        <BettingStreakModal
          isOpen={showBettingStreakModal}
          setOpen={setShowBettingStreakModal}
          currentUser={currentUser}
        />
      )}
      {showLoansModal && (
        <LoansModal isOpen={showLoansModal} setOpen={setShowLoansModal} />
      )}
    </>
  )
}

export function ProfilePublicStats(props: { user: User; className?: string }) {
  const { user, className } = props
  return (
    <Row className={'flex-wrap items-center gap-3'}>
      <FollowingButton user={user} className={className} />
      <FollowersButton user={user} className={className} />
      {/* <ReferralsButton user={user} className={className} /> */}
      <GroupsButton user={user} className={className} />
      {/* <UserLikesButton user={user} className={className} /> */}
    </Row>
  )
}
