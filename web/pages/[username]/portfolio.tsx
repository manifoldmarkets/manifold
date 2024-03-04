import dayjs from 'dayjs'
import clsx from 'clsx'
import {
  CurrencyDollarIcon,
  ViewListIcon,
  ScaleIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/outline'

import { getFullUserByUsername } from 'web/lib/supabase/users'
import { shouldIgnoreUserPage, User } from 'common/user'
import { db } from 'web/lib/supabase/db'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/firebase/api'
import {
  AnyBalanceChangeType,
  BET_BALANCE_CHANGE_TYPES,
} from 'common/balance-change'
import { Col } from 'web/components/layout/col'
import { DAY_MS } from 'common/util/time'
import { SEO } from 'web/components/SEO'
import Head from 'next/head'
import { Row } from 'web/components/layout/row'
import { BackButton } from 'web/components/contract/back-button'
import { Page } from 'web/components/layout/page'
import Custom404 from 'web/pages/404'
import Link from 'next/link'
import { InvestmentValueCard } from 'web/components/portfolio/investment-value'

import { UserBetsTable } from 'web/components/bet/user-bets-table'
import { PortfolioValueSection } from 'web/components/portfolio/portfolio-value-section'
import {
  useIsAuthorized,
  usePrivateUser,
  useUser,
  useUserById,
} from 'web/hooks/use-user'
import {
  BalanceCard,
  BalanceChangeTable,
} from 'web/components/portfolio/balance-card'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { SupabaseSearch } from 'web/components/supabase-search'
import { buildArray } from 'common/util/array'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingContractRow } from 'web/components/contract/contracts-table'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { LuCrown } from 'react-icons/lu'
import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { getCutoff } from 'web/lib/util/time'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getFullUserByUsername(username)
  const shouldIgnoreUser = user ? await shouldIgnoreUserPage(user, db) : false
  const { count: portfolioPoints } = user
    ? await db
        .from('user_portfolio_history')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', user.id)
    : { count: 0 }
  const weeklyPortfolioData = user
    ? await getPortfolioHistory(user.id, getCutoff('weekly'), db)
    : []
  const oneWeekBalanceChanges = user
    ? await api('get-balance-changes', {
        userId: user.id,
        after: Date.now() - DAY_MS * 7,
      })
    : []
  const balanceChanges = oneWeekBalanceChanges.slice(0, 200)

  return {
    props: removeUndefinedProps({
      user,
      username,
      shouldIgnoreUser,
      balanceChanges,
      totalPortfolioPoints: portfolioPoints ?? 0,
      weeklyPortfolioData,
    }),
    revalidate: 60, // Regenerate after a minute
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPortfolio(props: {
  user: User | null
  username: string
  shouldIgnoreUser: boolean
  balanceChanges: AnyBalanceChangeType[]
  totalPortfolioPoints: number
  weeklyPortfolioData: PortfolioSnapshot[]
}) {
  const { user, ...rest } = props
  if (!user) return <Custom404 />
  return <UserPortfolioInternal user={user} {...rest} />
}

function UserPortfolioInternal(props: {
  user: User
  username: string
  shouldIgnoreUser: boolean
  balanceChanges: AnyBalanceChangeType[]
  totalPortfolioPoints: number
  weeklyPortfolioData: PortfolioSnapshot[]
}) {
  const {
    shouldIgnoreUser,
    balanceChanges,
    weeklyPortfolioData,
    totalPortfolioPoints,
  } = props
  const user = useUserById(props.user.id) ?? props.user
  const hasBetBalanceChanges = balanceChanges.some((b) =>
    BET_BALANCE_CHANGE_TYPES.includes(b.type)
  )
  const balanceChangesKey = 'balance-changes'
  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {shouldIgnoreUser && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}

      <Col className="relative mt-1">
        <Row
          className={
            ' bg-canvas-50 sticky top-0 z-10 w-full items-center justify-between gap-1 py-2 sm:gap-2 md:hidden'
          }
        >
          <Row className={'items-center gap-2'}>
            <BackButton />
            <span className={'text-primary-700 text-2xl'}>Your portfolio</span>
          </Row>
          <Row className="mx-3 items-end gap-3">
            <div className="flex flex-col items-center">
              <Link
                href={`/${user.username}/partner`}
                className={clsx('hover:text-primary-500  text-ink-600 text-xs')}
              >
                <LuCrown className="mx-auto text-2xl" />
                Partner
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <Link
                href={'/' + user.username}
                className={clsx('hover:text-primary-500  text-ink-600 text-xs')}
              >
                <Avatar
                  avatarUrl={user.avatarUrl}
                  username={user.username}
                  noLink
                  size="xs"
                  className={'mx-auto'}
                />
                Profile
              </Link>
            </div>
          </Row>
        </Row>
        <Row
          className={
            'mx-2 mb-4 hidden items-center justify-between md:inline-flex'
          }
        >
          <span className={'text-primary-700 text-2xl'}>Your portfolio</span>
          <Row className="items-end gap-4">
            <div className="flex flex-col items-center">
              <Link
                href={`/${user.username}/partner`}
                className={clsx('hover:text-primary-500  text-ink-600 text-xs')}
              >
                <LuCrown className="mx-auto text-2xl" />
                Partner
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <Link
                href={'/' + user.username}
                className={clsx('hover:text-primary-500  text-ink-600 text-xs')}
              >
                <Avatar
                  avatarUrl={user.avatarUrl}
                  username={user.username}
                  noLink
                  size="xs"
                  className={'mx-auto'}
                />
                Profile
              </Link>
            </div>
          </Row>
        </Row>

        <QueryUncontrolledTabs
          className={'mx-2 mb-3 gap-6'}
          renderAllTabs
          tabs={buildArray([
            {
              title: 'Summary',
              stackedTabIcon: <PresentationChartLineIcon className="h-5" />,
              content: (
                <PortfolioSummary
                  user={user}
                  balanceChanges={balanceChanges}
                  totalPortfolioPoints={totalPortfolioPoints}
                  weeklyPortfolioData={weeklyPortfolioData}
                />
              ),
            },
            (!!user.lastBetTime || hasBetBalanceChanges) && {
              title: 'Trades',
              stackedTabIcon: <CurrencyDollarIcon className="h-5" />,
              content: <UserBetsTable user={user} />,
            },
            {
              title: 'Balance log',
              stackedTabIcon: <ViewListIcon className="h-5" />,
              content: (
                <BalanceChangeTable
                  user={user}
                  balanceChanges={balanceChanges}
                />
              ),
              queryString: balanceChangesKey,
            },
            (user.creatorTraders.allTime > 0 ||
              (user.freeQuestionsCreated ?? 0) > 0) && {
              title: 'Questions',
              stackedTabIcon: <ScaleIcon className="h-5" />,
              content: (
                <SupabaseSearch
                  defaultFilter="all"
                  defaultSearchType={'Questions'}
                  defaultSort="newest"
                  additionalFilter={{
                    creatorId: user.id,
                  }}
                  persistPrefix={`user-contracts-list-${user.id}`}
                  useUrlParams
                  emptyState={
                    <>
                      <div className="text-ink-700 mx-2 mt-3 text-center">
                        No questions found
                      </div>
                    </>
                  }
                  contractsOnly
                />
              ),
            },
          ])}
        />
      </Col>
    </Page>
  )
}

const PortfolioSummary = (props: {
  user: User
  balanceChanges: AnyBalanceChangeType[]
  totalPortfolioPoints: number
  weeklyPortfolioData: PortfolioSnapshot[]
}) => {
  const { user, totalPortfolioPoints, weeklyPortfolioData } = props
  const router = useRouter()
  const pathName = usePathname()
  const currentUser = useUser()
  const privateUser = usePrivateUser()
  const CARD_CLASS =
    'h-fit relative w-full min-w-[300px] cursor-pointer justify-between px-0 py-0 sm:w-[48%]'
  const balanceChangesKey = 'balance-changes'
  const isAuthed = useIsAuthorized()
  const isCurrentUser = currentUser?.id === user.id

  const { data: newBalanceChanges } = useAPIGetter('get-balance-changes', {
    userId: user.id,
    after: dayjs().startOf('day').subtract(7, 'day').valueOf(),
  })
  const balanceChanges = newBalanceChanges ?? props.balanceChanges

  return (
    <Col className="gap-4">
      <Row className={'flex-wrap gap-x-6 gap-y-3 px-3 lg:px-0 '}>
        <BalanceCard
          onSeeChanges={() => {
            router.replace(pathName + '?tab=' + balanceChangesKey, undefined, {
              shallow: true,
            })
          }}
          user={user}
          balanceChanges={balanceChanges}
          className={clsx(CARD_CLASS, 'border-ink-200 border-b pb-1')}
        />
        <InvestmentValueCard
          user={user}
          className={clsx(CARD_CLASS, 'border-ink-200 border-b pb-1')}
          weeklyPortfolioData={weeklyPortfolioData}
        />
      </Row>

      {totalPortfolioPoints > 1 && (
        <Col className={'px-1 md:pr-8'}>
          <PortfolioValueSection
            userId={user.id}
            onlyShowProfit={true}
            defaultTimePeriod={
              currentUser?.id === user.id ? 'weekly' : 'monthly'
            }
            preloadPoints={{ [getCutoff('weekly')]: weeklyPortfolioData }}
            lastUpdatedTime={user.metricsLastUpdated}
            isCurrentUser={currentUser?.id === user.id}
            hideAddFundsButton={true}
          />
        </Col>
      )}

      {isCurrentUser && (
        <Col className="mb-6 gap-2">
          <div className="text-ink-800 mx-2 text-xl lg:mx-0">Recent</div>
          {!isAuthed && (
            <Col>
              <LoadingContractRow />
              <LoadingContractRow />
              <LoadingContractRow />
            </Col>
          )}
          {isAuthed && (
            <SupabaseSearch
              persistPrefix="recent"
              additionalFilter={{
                excludeContractIds: privateUser?.blockedContractIds,
                excludeGroupSlugs: privateUser?.blockedGroupSlugs,
                excludeUserIds: privateUser?.blockedUserIds,
              }}
              useUrlParams={false}
              isWholePage={false}
              headerClassName={'!hidden'}
              topicSlug="recent"
              contractsOnly
              hideContractFilters
              hideSearch
            />
          )}
        </Col>
      )}
    </Col>
  )
}
