import {
  CashIcon,
  ChatAlt2Icon,
  ChevronDownIcon,
  PresentationChartLineIcon,
  ScaleIcon,
  ViewListIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { DIVISION_NAMES, getLeaguePath } from 'common/leagues'
import { getUserForStaticProps } from 'common/supabase/users'
import { isUserLikelySpammer } from 'common/user'
import { unauthedApi } from 'common/util/api'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { UserBetsTable } from 'web/components/bet/user-bets-table'
import { FollowButton } from 'web/components/buttons/follow-button'
import { TextButton } from 'web/components/buttons/text-button'
import { UserSettingButton } from 'web/components/buttons/user-settings-button'
import { UserCommentsList } from 'web/components/comments/profile-comments'
import { BackButton } from 'web/components/contract/back-button'
import { FollowList } from 'web/components/follow-list'
import { ManaCircleIcon } from 'web/components/icons/mana-circle-icon'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { QueryUncontrolledTabs, Tabs } from 'web/components/layout/tabs'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { BalanceChangeTable } from 'web/components/portfolio/balance-change-table'
import { PortfolioSummary } from 'web/components/portfolio/portfolio-summary'
import { PortfolioValueSection } from 'web/components/portfolio/portfolio-value-section'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { RedeemSweepsButtons } from 'web/components/profile/redeem-sweeps-buttons'
import { UserContractsList } from 'web/components/profile/user-contracts-list'
import { UserLikedContractsButton } from 'web/components/profile/user-liked-contracts-button'
import { SEO } from 'web/components/SEO'
import { UserHandles } from 'web/components/user/user-handles'
import { Avatar } from 'web/components/widgets/avatar'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import ImageWithBlurredShadow from 'web/components/widgets/image-with-blurred-shadow'
import { Linkify } from 'web/components/widgets/linkify'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { StackedUserNames, UserLink } from 'web/components/widgets/user-link'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { usePrivateUser, useUser, useWebsocketUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
import { db } from 'web/lib/supabase/db'
import { getAverageUserRating, getUserRating } from 'web/lib/supabase/reviews'
import Custom404 from 'web/pages/404'
import { UserPayments } from 'web/pages/payments'
import { formatMoney, formatWithCommas } from 'common/util/format'
import type { IconType } from 'react-icons'
import {
  TbCoin,
  TbUserPlus,
  TbChartLine,
  TbUsers,
  TbDroplet,
  TbCircleCheck,
  TbTrendingDown,
  TbTrophy,
  TbArrowDownRight,
  TbMedal,
  TbSparkles,
  TbDiamond,
  TbCrown,
  TbAward,
  TbCoins,
  TbWallet,
  TbMountain,
  TbBuildingBank,
  TbMessageDots,
  TbBolt,
  TbFilePlus,
  TbCalendar,
  TbFlame,
  TbShieldCheck,
  TbHeartHandshake,
  TbPigMoney,
} from 'react-icons/tb'
import { GiWhaleTail } from 'react-icons/gi'

const ACHIEVEMENT_ICONS: Record<string, IconType> = {
  totalProfitMana: TbCoin,
  totalVolumeMana: GiWhaleTail,
  totalReferrals: TbUserPlus,
  totalReferredProfitMana: TbChartLine,
  creatorTraders: TbUsers,
  totalLiquidityCreatedMarkets: TbDroplet,
  profitableMarketsCount: TbCircleCheck,
  unprofitableMarketsCount: TbTrendingDown,
  largestProfitableTradeValue: TbTrophy,
  largestUnprofitableTradeValue: TbArrowDownRight,
  seasonsGoldOrHigher: TbMedal,
  seasonsPlatinumOrHigher: TbSparkles,
  seasonsDiamondOrHigher: TbDiamond,
  seasonsMasters: TbCrown,
  largestLeagueSeasonEarnings: TbCoins,
  highestBalanceMana: TbWallet,
  highestNetworthMana: TbMountain,
  highestInvestedMana: TbPigMoney,
  highestLoanMana: TbBuildingBank,
  numberOfComments: TbMessageDots,
  totalTradesCount: TbBolt,
  totalMarketsCreated: TbFilePlus,
  accountAgeYears: TbCalendar,
  longestBettingStreak: TbFlame,
  modTicketsResolved: TbShieldCheck,
  charityDonatedMana: TbHeartHandshake,
}

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params

  const user = await getUserForStaticProps(db, username)

  const [contracts, posts] = user
    ? await Promise.all([
        db.from('contracts').select('id').eq('creator_id', user.id).limit(1),
        db.from('old_posts').select('id').eq('creator_id', user.id).limit(1),
      ])
    : []
  const hasCreatedQuestion = contracts?.data?.length || posts?.data?.length
  const { count, rating } = (user ? await getUserRating(user.id) : null) ?? {}
  const averageRating = user ? await getAverageUserRating(user.id) : undefined
  const shouldIgnoreUser = user
    ? await shouldIgnoreUserPage(user, !!hasCreatedQuestion)
    : false

  return {
    props: removeUndefinedProps({
      user,
      username,
      rating: rating,
      reviewCount: count,
      averageRating: averageRating,
      shouldIgnoreUser,
      hasCreatedQuestion,
    }),
    revalidate: 60,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  username: string
  rating?: number
  reviewCount?: number
  averageRating?: number
  shouldIgnoreUser: boolean
  hasCreatedQuestion: boolean
}) {
  const isAdminOrMod = useAdminOrMod()
  const { user, ...profileProps } = props
  const privateUser = usePrivateUser()
  const blockedByCurrentUser =
    privateUser?.blockedUserIds.includes(user?.id ?? '_') ?? false
  if (!user) return <Custom404 />
  else if (user.userDeleted && !isAdminOrMod) return <DeletedUser />

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <UserProfile user={user} {...profileProps} />
  )
}

const shouldIgnoreUserPage = async (
  user: User,
  hasCreatedQuestion: boolean
) => {
  // lastBetTime isn't always reliable, so use the contract_bets table to be sure
  const bet = await unauthedApi('bets', { userId: user.id, limit: 1 })
  return (
    user.userDeleted ||
    isUserLikelySpammer(user, bet.length > 0, hasCreatedQuestion)
  )
}

export const DeletedUser = () => {
  return (
    <Page trackPageView={'deleted user profile'}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="flex h-full flex-col items-center justify-center">
        <Title>Deleted account</Title>
        <p>This user's account has been deleted.</p>
      </div>
    </Page>
  )
}

function UserProfile(props: {
  user: User
  rating?: number
  reviewCount?: number
  averageRating?: number
  shouldIgnoreUser: boolean
  hasCreatedQuestion: boolean
}) {
  const {
    rating,
    hasCreatedQuestion,
    shouldIgnoreUser,
    reviewCount,
    averageRating,
  } = props
  const user = useWebsocketUser(props.user.id) ?? props.user
  const isMobile = useIsMobile()
  const router = useRouter()
  const currentUser = useUser()
  useSaveReferral(currentUser, {
    defaultReferrerUsername: user.username,
  })
  const isCurrentUser = user.id === currentUser?.id
  const [expandProfileInfo, setExpandProfileInfo] = useState(false)
  useEffect(() => {
    // wait for user to load
    if (currentUser === undefined) return
    if (!user.isBannedFromPosting && !user.userDeleted && !isCurrentUser) {
      setExpandProfileInfo(true)
    }
  }, [user.isBannedFromPosting, user.userDeleted, currentUser, user.id])
  const [showConfetti, setShowConfetti] = useState(false)
  const [followsYou, setFollowsYou] = useState(false)
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    setShowConfetti(claimedMana)
    const query = { ...router.query }
    if (query.claimedMana || query.show) {
      const queriesToDelete = ['claimed-mana', 'show', 'badge']
      queriesToDelete.forEach((key) => delete query[key])
      router.replace(
        {
          pathname: router.pathname,
          query,
        },
        undefined,
        { shallow: true }
      )
    }
  }, [])

  useEffect(() => {
    if (currentUser && currentUser.id !== user.id) {
      db.from('user_follows')
        .select('user_id')
        .eq('follow_id', currentUser.id)
        .eq('user_id', user.id)
        .then(({ data }) => {
          setFollowsYou(
            data?.some(({ user_id }) => user_id === user.id) ?? false
          )
        })
    }
  }, [currentUser?.id, user?.id])

  const balanceChangesKey = 'balance-changes'

  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
      className={clsx(isCurrentUser ? 'lg:!mt-0' : 'lg:mt-4')}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={shouldIgnoreUser ? '' : user.bio ?? ''}
        url={`/${user.username}`}
        shouldIgnore={shouldIgnoreUser}
      />
      {showConfetti && <FullscreenConfetti />}

      <Col className="relative">
        <Row
          className={
            'bg-canvas-0 sticky top-0 z-10 h-12 w-full justify-between gap-1 sm:static sm:h-auto'
          }
        >
          {isMobile && (
            <>
              <BackButton className="px-6" />

              <div
                className={clsx(
                  'self-center opacity-0 transition-opacity first:ml-4',
                  headerStuck && 'opacity-100'
                )}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <UserLink user={user} noLink />
              </div>

              <UserSettingButton user={user} />
            </>
          )}
        </Row>

        <Row
          className={clsx('mx-4 flex-wrap justify-between gap-2 py-1')}
          ref={titleRef}
        >
          {isCurrentUser || shouldIgnoreUser ? (
            <button
              className="group flex gap-2 py-1 pr-2"
              onClick={() => setExpandProfileInfo((v) => !v)}
            >
              <Col className={'relative max-h-14'}>
                <ImageWithBlurredShadow
                  image={
                    <Avatar
                      username={user.username}
                      avatarUrl={user.avatarUrl}
                      size={'lg'}
                      className="bg-ink-1000"
                      noLink
                    />
                  }
                />

                <ChevronDownIcon
                  className={clsx(
                    'group-hover:bg-primary-700 bg-primary-600 shadow-primary-300 text-ink-0 absolute bottom-0 right-0 h-5 w-5 rounded-full p-0.5 shadow-sm transition-all',
                    expandProfileInfo ? 'rotate-180' : 'rotate-0'
                  )}
                />
              </Col>
              <StackedUserNames
                usernameClassName={'sm:text-base'}
                className={'font-bold sm:mr-0 sm:text-xl'}
                user={user}
                followsYou={followsYou}
              />
            </button>
          ) : (
            <Row className="gap-2 py-1">
              <ImageWithBlurredShadow
                image={
                  <Avatar
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                    size={'lg'}
                    className="bg-ink-1000"
                    noLink
                  />
                }
              />
              <StackedUserNames
                usernameClassName={'sm:text-base'}
                className={'font-bold sm:mr-0 sm:text-xl'}
                user={user}
                followsYou={followsYou}
              />
            </Row>
          )}

          <Row className={'items-center gap-1 sm:gap-2'}>
            {isCurrentUser ? (
              <AddFundsButton
                userId={user.id}
                className="mr-2 w-full whitespace-nowrap px-8 lg:hidden"
              />
            ) : (
              <>
                <SendMessageButton toUser={user} currentUser={currentUser} />
                <FollowButton userId={user.id} />
              </>
            )}

            {!isMobile && <UserSettingButton user={user} />}
          </Row>
        </Row>
        {expandProfileInfo && (
          <Col className={'mx-4 mt-1 gap-2'}>
            <ProfilePublicStats user={user} currentUser={currentUser} />
            {user.bio && (
              <div className="sm:text-md mt-1 text-sm">
                <Linkify text={user.bio}></Linkify>
              </div>
            )}
            <UserHandles
              website={user.website}
              twitterHandle={user.twitterHandle}
              discordHandle={user.discordHandle}
              className="mt-2"
            />
          </Col>
        )}

        {isCurrentUser && (
          <RedeemSweepsButtons
            user={user}
            className="m-2 w-48"
            redeemableCash={user.cashBalance}
          />
        )}

        <Col className="mx-4">
          <QueryUncontrolledTabs
            trackingName={'profile tabs'}
            labelsParentClassName={'gap-0 sm:gap-4'}
            labelClassName={'pb-2 pt-2'}
            saveTabInLocalStorageKey={
              isCurrentUser ? `profile-tabs-${user.id}` : undefined
            }
            tabs={buildArray(
              isCurrentUser && {
                title: 'Summary',
                prerender: true,
                stackedTabIcon: <PresentationChartLineIcon className="h-5" />,
                content: (
                  <>
                    {/* <Col className="mt-2 gap-2"> */}
                    {/* <VerifyPhoneNumberBanner user={currentUser} /> */}
                    {/* </Col> */}
                    <PortfolioSummary className="mt-4" user={user} />
                  </>
                ),
              },
              !!user.lastBetTime && {
                title: 'Trades',
                prerender: true,
                stackedTabIcon: <ManaCircleIcon className="h-5 w-5" />,
                content: (
                  <>
                    <Spacer h={2} />
                    {!isCurrentUser && (
                      <>
                        <PortfolioValueSection
                          user={user}
                          defaultTimePeriod={
                            currentUser?.id === user.id ? 'weekly' : 'monthly'
                          }
                        />

                        <div className="text-ink-800 border-ink-300 mx-2 mt-6 gap-2 border-t pt-4 text-xl font-semibold lg:mx-0">
                          Trades
                        </div>

                        <Spacer h={4} />
                      </>
                    )}
                    <UserBetsTable user={user} />
                  </>
                ),
              },
              hasCreatedQuestion && {
                title: 'Questions',
                prerender: true,
                stackedTabIcon: <ScaleIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserContractsList
                      creator={user}
                      rating={rating}
                      reviewCount={reviewCount}
                      averageRating={averageRating}
                    />
                  </>
                ),
              },
              {
                title: 'Achievements',
                prerender: true,
                stackedTabIcon: <TrophyIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <AchievementsSection userId={user.id} />
                  </>
                ),
              },
              {
                title: 'Balance log',
                stackedTabIcon: <ViewListIcon className="h-5" />,
                content: <BalanceChangeTable user={user} />,
                queryString: balanceChangesKey,
              },
              {
                title: 'Comments',
                stackedTabIcon: <ChatAlt2Icon className="h-5" />,
                content: (
                  <Col>
                    <UserCommentsList user={user} />
                  </Col>
                ),
              },
              {
                title: 'Payments',
                stackedTabIcon: <CashIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserPayments userId={user.id} />
                  </>
                ),
              }
            )}
          />
        </Col>
      </Col>
    </Page>
  )
}

type FollowsDialogTab = 'following' | 'followers'

function ProfilePublicStats(props: {
  user: User
  currentUser: User | undefined | null
  className?: string
}) {
  const { user, className, currentUser } = props
  const isCurrentUser = user.id === currentUser?.id
  const [followsOpen, setFollowsOpen] = useState(false)
  const [followsTab, setFollowsTab] = useState<FollowsDialogTab>('following')
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)
  const openFollowsDialog = (tabName: FollowsDialogTab) => {
    setFollowsOpen(true)
    setFollowsTab(tabName)
  }

  const leagueInfo = useLeagueInfo(user.id)

  return (
    <Row
      className={clsx(
        'text-ink-600 flex-wrap items-center gap-x-2 text-sm',
        className
      )}
    >
      <TextButton onClick={() => openFollowsDialog('following')}>
        <span className={clsx('font-semibold')}>
          {followingIds?.length ?? ''}
        </span>{' '}
        Following
      </TextButton>
      <TextButton onClick={() => openFollowsDialog('followers')}>
        <span className={clsx('font-semibold')}>
          {followerIds?.length ?? ''}
        </span>{' '}
        Followers
      </TextButton>

      {isCurrentUser && <UserLikedContractsButton user={user} />}

      {leagueInfo && (
        <Link
          className={linkClass}
          href={getLeaguePath(
            leagueInfo.season,
            leagueInfo.division,
            leagueInfo.cohort,
            user.id
          )}
        >
          <TrophyIcon className="mb-1 mr-1 inline h-4 w-4" />
          <span className={clsx('font-semibold')}>
            {DIVISION_NAMES[leagueInfo.division ?? '']}
          </span>{' '}
          Rank {leagueInfo.rank}
        </Link>
      )}

      {/* {isCurrentUser && (
        <Link href={`/${user.username}/partner`} className={linkClass}>
          <FaCrown className="mb-1 mr-1 inline h-4 w-4" />
          Partner
        </Link>
      )} */}

      <FollowsDialog
        user={user}
        defaultTab={followsTab}
        followingIds={followingIds}
        followerIds={followerIds}
        isOpen={followsOpen}
        setIsOpen={setFollowsOpen}
      />
    </Row>
  )
}

function AchievementsSection(props: { userId: string }) {
  const { userId } = props
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    userId: string
    totalProfitMana: number
    creatorTraders: number
    totalReferrals: number
    totalReferredProfitMana: number
    totalVolumeMana: number
    seasonsGoldOrHigher: number
    seasonsPlatinumOrHigher: number
    seasonsDiamondOrHigher: number
    seasonsMasters: number
    numberOfComments: number
    totalLiquidityCreatedMarkets: number
    totalTradesCount: number
    totalMarketsCreated: number
    accountAgeYears: number
    profitableMarketsCount: number
    unprofitableMarketsCount: number
    largestProfitableTradeValue: number
    largestUnprofitableTradeValue: number
    longestBettingStreak: number
    modTicketsResolved: number
    charityDonatedMana: number
    largestLeagueSeasonEarnings: number
    highestBalanceMana: number
    highestInvestedMana: number
    highestNetworthMana: number
    highestLoanMana: number
    ranks: {
      volume: { rank: number | null; percentile: number | null }
      trades: { rank: number | null; percentile: number | null }
      marketsCreated: { rank: number | null; percentile: number | null }
      comments: { rank: number | null; percentile: number | null }
      seasonsMasters: { rank: number | null; percentile: number | null }
      largestLeagueSeasonEarnings: {
        rank: number | null
        percentile: number | null
      }
      liquidity: { rank: number | null; percentile: number | null }
      profitableMarkets: { rank: number | null; percentile: number | null }
      unprofitableMarkets: { rank: number | null; percentile: number | null }
      largestProfitableTrade: {
        rank: number | null
        percentile: number | null
      }
      largestUnprofitableTrade: {
        rank: number | null
        percentile: number | null
      }
      highestBalance: { rank: number | null; percentile: number | null }
      highestInvested: { rank: number | null; percentile: number | null }
      highestNetworth: { rank: number | null; percentile: number | null }
      highestLoan: { rank: number | null; percentile: number | null }
      modTickets: { rank: number | null; percentile: number | null }
      charityDonated: { rank: number | null; percentile: number | null }
    }
  } | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)
    unauthedApi('get-user-achievements', { userId })
      .then((resp) => {
        if (isMounted) setData(resp)
      })
      .catch((e) => {
        if (isMounted) setError(e?.message ?? 'Failed to load achievements')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [userId])

  if (loading)
    return (
      <Row className="text-ink-600 items-center gap-2">
        Loading achievements…
      </Row>
    )
  if (error) return <div className="text-error">{error}</div>
  if (!data) return null

  type Rankish =
    | { rank: number | null; percentile: number | null }
    | null
    | undefined

  const p = (r?: Rankish) => r?.percentile ?? null
  const r = (r?: Rankish) => r?.rank ?? null

  const ACHS = [
    {
      id: 'totalProfitMana',
      title: 'But Was It Realised?',
      desc: 'Highest total profit recorded.',
      value: formatMoney(data.totalProfitMana, 'MANA'),
      rank: null,
      percentile: null,
    },
    {
      id: 'totalVolumeMana',
      title: 'Any Whales?',
      desc: 'Total trading volume.',
      value: formatMoney(data.totalVolumeMana, 'MANA'),
      rank: r(data.ranks?.volume),
      percentile: p(data.ranks?.volume),
    },
    {
      id: 'totalReferrals',
      title: 'Manifold Hype Man',
      desc: 'Friends you brought to Manifold.',
      value: formatWithCommas(data.totalReferrals),
      rank: null,
      percentile: null,
    },
    {
      id: 'totalReferredProfitMana',
      title: 'Proud Parent',
      desc: 'Profit earned by your referrals.',
      value: formatMoney(data.totalReferredProfitMana, 'MANA'),
      rank: null,
      percentile: null,
    },
    {
      id: 'creatorTraders',
      title: 'Fan Favorite',
      desc: 'Unique traders on your markets.',
      value: formatWithCommas(data.creatorTraders),
      rank: null,
      percentile: null,
    },
    {
      id: 'totalLiquidityCreatedMarkets',
      title: 'No Slippage Here',
      desc: 'Total liquidity across all your created markets.',
      value: formatMoney(data.totalLiquidityCreatedMarkets, 'MANA'),
      rank: r(data.ranks?.liquidity),
      percentile: p(data.ranks?.liquidity),
    },
    {
      id: 'profitableMarketsCount',
      title: 'Market Maven',
      desc: 'Number of markets you made a profit on.',
      value: formatWithCommas(data.profitableMarketsCount),
      rank: r(data.ranks?.profitableMarkets),
      percentile: p(data.ranks?.profitableMarkets),
    },
    {
      id: 'unprofitableMarketsCount',
      title: `Ineffective Altruism`,
      desc: 'Number of markets you lost mana on.',
      value: formatWithCommas(data.unprofitableMarketsCount),
      rank: r(data.ranks?.unprofitableMarkets),
      percentile: p(data.ranks?.unprofitableMarkets),
    },
    {
      id: 'largestProfitableTradeValue',
      title: 'Biggest Win',
      desc: 'Largest profit made on a single market.',
      value: formatMoney(data.largestProfitableTradeValue, 'MANA'),
      rank: r(data.ranks?.largestProfitableTrade),
      percentile: p(data.ranks?.largestProfitableTrade),
    },
    {
      id: 'largestUnprofitableTradeValue',
      title: 'Wealth Redistributor',
      desc: 'Largest loss made on a single market.',
      value: formatMoney(data.largestUnprofitableTradeValue, 'MANA'),
      rank: r(data.ranks?.largestUnprofitableTrade),
      percentile: p(data.ranks?.largestUnprofitableTrade),
    },
    {
      id: 'seasonsGoldOrHigher',
      title: 'Gleaming Gold',
      desc: 'Seasons finished Gold or higher.',
      value: formatWithCommas(data.seasonsGoldOrHigher),
      rank: null,
      percentile: null,
    },
    {
      id: 'seasonsPlatinumOrHigher',
      title: 'Positively Platinum',
      desc: 'Seasons finished Platinum or higher.',
      value: formatWithCommas(data.seasonsPlatinumOrHigher),
      rank: null,
      percentile: null,
    },
    {
      id: 'seasonsDiamondOrHigher',
      title: 'Diamond Hands',
      desc: 'Seasons finished Diamond or higher.',
      value: formatWithCommas(data.seasonsDiamondOrHigher),
      rank: null,
      percentile: null,
    },
    {
      id: 'seasonsMasters',
      title: 'Master Mind',
      desc: 'Seasons finished Masters.',
      value: formatWithCommas(data.seasonsMasters),
      rank: r(data.ranks?.seasonsMasters),
      percentile: p(data.ranks?.seasonsMasters),
    },

    {
      id: 'largestLeagueSeasonEarnings',
      title: 'Sensational Season',
      desc: 'Largest earnings in a single season.',
      value: formatMoney(data.largestLeagueSeasonEarnings, 'MANA'),
      rank: r(data.ranks?.largestLeagueSeasonEarnings),
      percentile: p(data.ranks?.largestLeagueSeasonEarnings),
    },
    {
      id: 'highestBalanceMana',
      title: 'Scared?',
      desc: 'Highest balance reached.',
      value: formatMoney(data.highestBalanceMana, 'MANA'),
      rank: r(data.ranks?.highestBalance),
      percentile: p(data.ranks?.highestBalance),
    },
    {
      id: 'highestNetworthMana',
      title: 'Peak Net Worth',
      desc: 'Highest net worth reached.',
      value: formatMoney(data.highestNetworthMana, 'MANA'),
      rank: r(data.ranks?.highestNetworth),
      percentile: p(data.ranks?.highestNetworth),
    },
    {
      id: 'highestInvestedMana',
      title: 'Leeeeroooy Jenkins',
      desc: `Highest amount of mana you've had invested at once.`,
      value: formatMoney(data.highestInvestedMana, 'MANA'),
      rank: r(data.ranks?.highestInvested),
      percentile: p(data.ranks?.highestInvested),
    },
    {
      id: 'highestLoanMana',
      title: '@Tumbles Wannabe',
      desc: 'Highest outstanding loan.',
      value: formatMoney(data.highestLoanMana, 'MANA'),
      rank: r(data.ranks?.highestLoan),
      percentile: p(data.ranks?.highestLoan),
    },
    {
      id: 'numberOfComments',
      title: 'Chatterbox',
      desc: 'Comments you’ve posted.',
      value: formatWithCommas(data.numberOfComments),
      rank: r(data.ranks?.comments),
      percentile: p(data.ranks?.comments),
    },
    {
      id: 'totalTradesCount',
      title: 'High Frequency Trader',
      desc: 'Total number of trades executed (excludes API trades).',
      value: formatWithCommas(data.totalTradesCount),
      rank: r(data.ranks?.trades),
      percentile: p(data.ranks?.trades),
    },
    {
      id: 'totalMarketsCreated',
      title: 'Doing The Hard Part',
      desc: 'Number of markets you’ve created.',
      value: formatWithCommas(data.totalMarketsCreated),
      rank: r(data.ranks?.marketsCreated),
      percentile: p(data.ranks?.marketsCreated),
    },
    {
      id: 'accountAgeYears',
      title: 'Age Is Just A Number',
      desc: 'Account age in years.',
      value: data.accountAgeYears.toFixed(2),
      rank: null,
      percentile: null,
    },
    {
      id: 'longestBettingStreak',
      title: 'Longest Daily Streak',
      desc: 'Longest consecutive days trading.',
      value: formatWithCommas(data.longestBettingStreak),
      rank: null,
      percentile: null,
    },
    {
      id: 'modTicketsResolved',
      title: 'Helpful Moderator',
      desc: 'Mod tickets you’ve resolved.',
      value: formatWithCommas(data.modTicketsResolved),
      rank: r(data.ranks?.modTickets),
      percentile: p(data.ranks?.modTickets),
    },
    {
      id: 'charityDonatedMana',
      title: 'Giver',
      desc: 'Total mana donated to charity.',
      value: formatMoney(data.charityDonatedMana, 'MANA'),
      rank: r(data.ranks?.charityDonated),
      percentile: p(data.ranks?.charityDonated),
    },
  ] as const

  const bucketOf = (percentile: number | null) => {
    if (percentile == null) return 'All users'
    if (percentile <= 0.1) return 'Top 0.1%'
    if (percentile <= 1) return 'Top 1%'
    if (percentile <= 5) return 'Top 5%'
    if (percentile <= 25) return 'Top 25%'
    if (percentile <= 50) return 'Top 50%'
    return 'All users'
  }

  const bucketOrder = [
    'Top 0.1%',
    'Top 1%',
    'Top 5%',
    'Top 25%',
    'Top 50%',
    'All users',
  ] as const
  const byBucket: Record<
    (typeof bucketOrder)[number],
    (typeof ACHS)[number][]
  > = {
    'Top 0.1%': [],
    'Top 1%': [],
    'Top 5%': [],
    'Top 25%': [],
    'Top 50%': [],
    'All users': [],
  }

  ACHS.forEach((a) => {
    byBucket[bucketOf(a.percentile)].push(a as any)
  })

  return (
    <Col className="gap-6">
      {bucketOrder.map((bucket) => {
        const items = byBucket[bucket]
        if (!items.length) return null
        return (
          <Col key={bucket} className="gap-3">
            <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              {bucket}
              <span className="bg-ink-200 h-px flex-1" />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <AchievementBadgeCard
                  key={a.id}
                  title={a.title}
                  description={a.desc}
                  value={a.value}
                  rank={a.rank}
                  percentile={a.percentile}
                  icon={ACHIEVEMENT_ICONS[a.id]}
                  bucket={bucket}
                />
              ))}
            </div>
          </Col>
        )
      })}
    </Col>
  )
}

function AchievementBadgeCard(props: {
  title: string
  description: string
  value: string
  rank: number | null
  percentile: number | null
  bucket: 'Top 0.1%' | 'Top 1%' | 'Top 5%' | 'Top 25%' | 'Top 50%' | 'All users'
  icon?: IconType
}) {
  const { title, description, value, rank, percentile, bucket, icon } = props
  const Icon = icon ?? TbAward

  const bucketStyle: Record<typeof props.bucket, string> = {
    'Top 0.1%': 'from-fuchsia-500 to-indigo-500',
    'Top 1%': 'from-indigo-500 to-sky-500',
    'Top 5%': 'from-sky-500 to-teal-500',
    'Top 25%': 'from-emerald-500 to-lime-500',
    'Top 50%': 'from-slate-500 to-zinc-500',
    'All users': 'from-zinc-400 to-zinc-600',
  }

  return (
    <div
      className="border-ink-200 group relative aspect-[11/12] min-h-[280px] rounded-xl border p-[1px] transition-shadow hover:shadow-lg"
      aria-label={title}
    >
      {/* gradient ring */}
      <div
        className={clsx(
          'h-full rounded-xl bg-gradient-to-br',
          bucketStyle[bucket]
        )}
      >
        <div className="bg-canvas-0 flex h-full flex-col items-center rounded-[11px] px-4 pt-6">
          <div className=" ring-ink-300/50 flex  h-24 w-24 items-center justify-center rounded-lg ring-1">
            <Icon className="h-10 w-10 " />
          </div>
          <div className=" pt-5 text-center">
            <div className="text-ink-900  text-lg font-semibold">{title}</div>
            <div className="text-ink-600 text-sm ">{description}</div>
            <div className="text-ink-900 mt-3 text-lg">{value}</div>
          </div>

          {/* side hover tooltip */}
          <div className="pointer-events-none absolute left-full top-4 z-20 hidden pl-3 group-hover:block">
            <div className="bg-canvas-0 text-ink-900 border-ink-200 w-64 rounded-md border p-3 shadow-xl">
              <div className="text-ink-600 text-xs uppercase tracking-wider">
                {bucket}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {percentile != null
                  ? `In the top ${(() => {
                      const s = Number(percentile.toFixed(2)).toString()
                      return s
                    })()}% of users`
                  : 'N/A'}
              </div>
              <div className="text-ink-600 mt-1 text-sm">
                Rank: {rank ?? 'N/A'}
              </div>
              <div className="text-ink-600 text-sm">Value: {value}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FollowsDialog(props: {
  user: User
  followingIds: string[] | undefined
  followerIds: string[] | undefined
  defaultTab: FollowsDialogTab
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, followingIds, followerIds, defaultTab, isOpen, setIsOpen } =
    props

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 max-h-[90vh] rounded pt-6">
        <div className="px-6 pb-1 text-center text-xl">{user.name}</div>
        <Tabs
          className="mx-6"
          tabs={[
            {
              title: 'Following',
              content: <FollowList userIds={followingIds} />,
            },
            {
              title: 'Followers',
              content: <FollowList userIds={followerIds} />,
            },
          ]}
          defaultIndex={defaultTab === 'following' ? 0 : 1}
        />
      </Col>
    </Modal>
  )
}
