import clsx from 'clsx'

import { AnyBalanceChangeType } from 'common/balance-change'
import { User } from 'common/user'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { useUser, usePrivateUser, useIsAuthorized } from 'web/hooks/use-user'
import { LoadingContractRow } from '../contract/contracts-table'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { SupabaseSearch } from '../supabase-search'
import { BalanceCard } from './balance-card'
import { InvestmentValueCard } from './investment-value'
import { PortfolioValueSection } from './portfolio-value-section'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export const PortfolioSummary = (props: {
  user: User
  balanceChanges: AnyBalanceChangeType[]
  className?: string
}) => {
  const { user, balanceChanges, className } = props
  const router = useRouter()
  const pathName = usePathname()
  const currentUser = useUser()
  const privateUser = usePrivateUser()
  const CARD_CLASS =
    'h-fit relative w-full min-w-[300px] cursor-pointer justify-between px-0 py-0 sm:w-[48%]'
  const balanceChangesKey = 'balance-changes'
  const isAuthed = useIsAuthorized()
  const isCurrentUser = currentUser?.id === user.id
  const isCreatedInLastWeek =
    user.createdTime > Date.now() - 7 * 24 * 60 * 60 * 1000

  const weeklyPortfolioData = usePortfolioHistory(user.id, 'weekly') ?? []

  const { data: portfolioData, refresh: refreshPortfolio } = useAPIGetter('get-user-portfolio', {
    userId: user.id,
  })

  return (
    <Col className={clsx(className, 'gap-4')}>
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
          loanTotal={portfolioData?.loanTotal}
          refreshPortfolio={refreshPortfolio}
        />
      </Row>

      <PortfolioValueSection
        userId={user.id}
        defaultTimePeriod={
          isCreatedInLastWeek
            ? 'allTime'
            : currentUser?.id === user.id
            ? 'weekly'
            : 'monthly'
        }
        lastUpdatedTime={user.metricsLastUpdated}
        isCurrentUser={isCurrentUser}
        hideAddFundsButton
      />

      {isCurrentUser && (
        <Col className="mb-6 mt-2 gap-2">
          <div className="text-ink-800 mx-2 text-xl lg:mx-0">
            Recently viewed
          </div>
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
