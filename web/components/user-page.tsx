import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { LinkIcon } from '@heroicons/react/solid'
import { PencilIcon } from '@heroicons/react/outline'

import { User } from 'web/lib/firebase/users'
import { useUser } from 'web/hooks/use-user'
import { CreatorContractsList } from './contract/contracts-grid'
import { SEO } from './SEO'
import { Page } from './page'
import { SiteLink } from './site-link'
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
import { ReferralsButton } from 'web/components/referrals-button'
import { formatMoney } from 'common/util/format'
import { ShareIconButton } from 'web/components/share-icon-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { BettingStreakModal } from 'web/components/profile/betting-streak-modal'
import { LoansModal } from './profile/loans-modal'

export function UserLink(props: {
  name: string
  username: string
  showUsername?: boolean
  className?: string
  short?: boolean
}) {
  const { name, username, showUsername, className, short } = props
  const firstName = name.split(' ')[0]
  const maxLength = 10
  const shortName =
    firstName.length >= 3
      ? firstName.length < maxLength
        ? firstName
        : firstName.substring(0, maxLength - 3) + '...'
      : name.length > maxLength
      ? name.substring(0, maxLength) + '...'
      : name
  return (
    <SiteLink
      href={`/${username}`}
      className={clsx('z-10 truncate', className)}
    >
      {short ? shortName : name}
      {showUsername && ` (@${username})`}
    </SiteLink>
  )
}

export function UserPage(props: { user: User }) {
  const { user } = props
  const router = useRouter()
  const currentUser = useUser()
  const isCurrentUser = user.id === currentUser?.id
  const bannerUrl = user.bannerUrl ?? defaultBannerUrl(user.id)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showBettingStreakModal, setShowBettingStreakModal] = useState(false)
  const [showLoansModal, setShowLoansModal] = useState(false)

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    const showBettingStreak = router.query['show'] === 'betting-streak'
    setShowBettingStreakModal(showBettingStreak)
    setShowConfetti(claimedMana || showBettingStreak)

    const showLoansModel = router.query['show'] === 'loans'
    setShowLoansModal(showLoansModel)

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
      <BettingStreakModal
        isOpen={showBettingStreakModal}
        setOpen={setShowBettingStreakModal}
      />
      {showLoansModal && (
        <LoansModal isOpen={showLoansModal} setOpen={setShowLoansModal} />
      )}
      {/* Banner image up top, with an circle avatar overlaid */}
      <div
        className="h-32 w-full bg-cover bg-center sm:h-40"
        style={{
          backgroundImage: `url(${bannerUrl})`,
        }}
      ></div>
      <div className="relative mb-20">
        <div className="absolute -top-10 left-4">
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size={24}
            className="bg-white ring-4 ring-white"
          />
        </div>

        {/* Top right buttons (e.g. edit, follow) */}
        <div className="absolute right-0 top-0 mt-2 mr-4">
          {!isCurrentUser && <UserFollowButton userId={user.id} />}
          {isCurrentUser && (
            <SiteLink className="btn-sm btn" href="/profile">
              <PencilIcon className="h-5 w-5" />{' '}
              <div className="ml-2">Edit</div>
            </SiteLink>
          )}
        </div>
      </div>

      {/* Profile details: name, username, bio, and link to twitter/discord */}
      <Col className="mx-4 -mt-6">
        <Row className={'flex-wrap justify-between gap-y-2'}>
          <Col>
            <span
              className="text-2xl font-bold"
              style={{ wordBreak: 'break-word' }}
            >
              {user.name}
            </span>
            <span className="text-gray-500">@{user.username}</span>
          </Col>
          <Col className={'justify-center'}>
            <Row className={'gap-3'}>
              <Col className={'items-center text-gray-500'}>
                <span
                  className={clsx(
                    'text-md',
                    profit >= 0 ? 'text-green-600' : 'text-red-400'
                  )}
                >
                  {formatMoney(profit)}
                </span>
                <span>profit</span>
              </Col>
              <Col
                className={'cursor-pointer items-center text-gray-500'}
                onClick={() => setShowBettingStreakModal(true)}
              >
                <span>🔥 {user.currentBettingStreak ?? 0}</span>
                <span>streak</span>
              </Col>
              <Col
                className={
                  'flex-shrink-0 cursor-pointer items-center text-gray-500'
                }
                onClick={() => setShowLoansModal(true)}
              >
                <span className="text-green-600">
                  🏦 {formatMoney(user.nextLoanCached ?? 0)}
                </span>
                <span>next loan</span>
              </Col>
            </Row>
          </Col>
        </Row>
        <Spacer h={4} />
        {user.bio && (
          <>
            <div>
              <Linkify text={user.bio}></Linkify>
            </div>
            <Spacer h={4} />
          </>
        )}
        <Row className="flex-wrap items-center gap-2 sm:gap-4">
          {user.website && (
            <SiteLink
              href={
                'https://' +
                user.website.replace('http://', '').replace('https://', '')
              }
            >
              <Row className="items-center gap-1">
                <LinkIcon className="h-4 w-4" />
                <span className="text-sm text-gray-500">{user.website}</span>
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
                <span className="text-sm text-gray-500">
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
                <span className="text-sm text-gray-500">
                  {user.discordHandle}
                </span>
              </Row>
            </SiteLink>
          )}
        </Row>
        <Spacer h={5} />
        {currentUser?.id === user.id && (
          <Row
            className={
              'w-full items-center justify-center gap-2 rounded-md border-2 border-indigo-100 bg-indigo-50 p-2 text-indigo-600'
            }
          >
            <span>
              <SiteLink href="/referrals">
                Earn {formatMoney(500)} when you refer a friend!
              </SiteLink>{' '}
              You have <ReferralsButton user={user} currentUser={currentUser} />
            </span>
            <ShareIconButton
              copyPayload={`https://${ENV_CONFIG.domain}?referrer=${currentUser.username}`}
              toastClassName={'sm:-left-40 -left-40 min-w-[250%]'}
              buttonClassName={'h-10 w-10'}
              iconClassName={'h-8 w-8 text-indigo-700'}
            />
          </Row>
        )}
        <Spacer h={5} />
        <QueryUncontrolledTabs
          currentPageForAnalytics={'profile'}
          labelClassName={'pb-2 pt-1 '}
          tabs={[
            {
              title: 'Markets',
              content: (
                <CreatorContractsList user={currentUser} creator={user} />
              ),
            },
            {
              title: 'Comments',
              content: <UserCommentsList user={user} />,
            },
            {
              title: 'Bets',
              content: (
                <>
                  <PortfolioValueSection userId={user.id} />
                  <BetsList user={user} />
                </>
              ),
            },
            {
              title: 'Social',
              content: (
                <Row
                  className={'mt-2 flex-wrap items-center justify-center gap-6'}
                >
                  <FollowingButton user={user} />
                  <FollowersButton user={user} />
                  {currentUser &&
                    ['ian', 'Austin', 'SG', 'JamesGrugett'].includes(
                      currentUser.username
                    ) && <ReferralsButton user={user} />}
                  <GroupsButton user={user} />
                </Row>
              ),
            },
          ]}
        />
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
