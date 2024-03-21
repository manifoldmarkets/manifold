import clsx from 'clsx'

import { AnyBalanceChangeType } from 'common/balance-change'
import { User } from 'common/user'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { useUser, usePrivateUser, useIsAuthorized } from 'web/hooks/use-user'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { getCutoff } from 'web/lib/util/time'
import { LoadingContractRow } from '../contract/contracts-table'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { SupabaseSearch } from '../supabase-search'
import { BalanceCard } from './balance-card'
import { InvestmentValueCard } from './investment-value'
import { PortfolioValueSection } from './portfolio-value-section'

export const PortfolioSummary = (props: {
  user: User
  balanceChanges: AnyBalanceChangeType[]
  totalPortfolioPoints: number
  weeklyPortfolioData: PortfolioSnapshot[]
  className?: string
}) => {
  const {
    user,
    totalPortfolioPoints,
    weeklyPortfolioData,
    balanceChanges,
    className,
  } = props
  const router = useRouter()
  const pathName = usePathname()
  const currentUser = useUser()
  const privateUser = usePrivateUser()
  const CARD_CLASS =
    'h-fit relative w-full min-w-[300px] cursor-pointer justify-between px-0 py-0 sm:w-[48%]'
  const balanceChangesKey = 'balance-changes'
  const isAuthed = useIsAuthorized()
  const isCurrentUser = currentUser?.id === user.id

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
            size="sm"
          />
        </Col>
      )}

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
