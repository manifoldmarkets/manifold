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
import clsx from 'clsx'
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
import { useUser } from 'web/hooks/use-user'
import { RxAvatar } from 'react-icons/rx'
import { BalanceCard } from 'web/components/portfolio/balance-card'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { SupabaseSearch } from 'web/components/supabase-search'
import { buildArray } from 'common/util/array'

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
  const balanceChanges = user
    ? await api('get-balance-changes', {
        userId: user.id,
        after: Date.now() - DAY_MS,
      })
    : []
  return {
    props: removeUndefinedProps({
      user,
      username,
      shouldIgnoreUser,
      balanceChanges,
      portfolioPoints: portfolioPoints ?? 0,
    }),
    // revalidate: 60 * 5, // Regenerate after 5 minutes
    revalidate: 4,
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
  portfolioPoints: number
}) {
  if (!props.user) return <Custom404 />
  return (
    <UserPortfolioInternal
      user={props.user}
      username={props.username}
      shouldIgnoreUser={props.shouldIgnoreUser}
      balanceChanges={props.balanceChanges}
      portfolioPoints={props.portfolioPoints}
    />
  )
}
function UserPortfolioInternal(props: {
  user: User
  username: string
  shouldIgnoreUser: boolean
  balanceChanges: AnyBalanceChangeType[]
  portfolioPoints: number
}) {
  const { user, shouldIgnoreUser, balanceChanges, portfolioPoints } = props
  const currentUser = useUser()
  const hasBetBalanceChanges = balanceChanges.some((b) =>
    BET_BALANCE_CHANGE_TYPES.includes(b.type)
  )
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
          <Link
            className={clsx('text-ink-500 hover:text-primary-500')}
            href={'/' + user.username}
          >
            <Col className={'items-center px-3 text-sm'}>
              <RxAvatar className={'h-7 w-7'} />
            </Col>
          </Link>
        </Row>
        <Row
          className={
            'mx-1 my-4 hidden items-center justify-between md:inline-flex'
          }
        >
          <span className={'text-primary-700   text-2xl'}>Your portfolio</span>
          <Link
            className={clsx('text-ink-500 hover:text-primary-500')}
            href={'/' + user.username}
          >
            <Col className={'items-center px-3 text-sm'}>
              <RxAvatar className={'h-7 w-7'} />
            </Col>
          </Link>
        </Row>
        <Row className={'flex-wrap gap-4 px-2 sm:px-0 '}>
          <BalanceCard
            user={user}
            balanceChanges={balanceChanges}
            className={
              'bg-canvas-0 relative w-full min-w-[300px] cursor-pointer justify-between rounded-md p-2 sm:w-[48%]'
            }
          />
          <InvestmentValueCard
            user={user}
            className={
              'bg-canvas-0 w-full min-w-[300px] cursor-pointer justify-between rounded-md p-2 sm:w-[49%]'
            }
          />
        </Row>
        <Col className={'mt-5'}>
          {portfolioPoints > 1 && (
            <Col className={'px-1 md:pr-8'}>
              <PortfolioValueSection
                userId={user.id}
                onlyShowProfit={true}
                defaultTimePeriod={
                  currentUser?.id === user.id ? 'weekly' : 'monthly'
                }
                lastUpdatedTime={user.metricsLastUpdated}
                isCurrentUser={currentUser?.id === user.id}
                hideAddFundsButton={true}
              />
            </Col>
          )}
          <Col className={'px-1'}>
            <UncontrolledTabs
              className={'mx-2 mb-3 mt-2 gap-6'}
              minimalist={true}
              tabs={buildArray([
                (!!user.lastBetTime || hasBetBalanceChanges) && {
                  title: 'Your trades',
                  content: <UserBetsTable user={user} />,
                },
                (user.creatorTraders.allTime > 0 ||
                  (user.freeQuestionsCreated ?? 0) > 0) && {
                  title: 'Your questions',
                  content: (
                    <SupabaseSearch
                      defaultFilter="all"
                      hideAvatars={true}
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
        </Col>
      </Col>
    </Page>
  )
}
