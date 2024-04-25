import clsx from 'clsx'

import { AnyBalanceChangeType } from 'common/balance-change'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { LoadingContractRow } from '../contract/contracts-table'
import { Col } from '../layout/col'
import { SupabaseSearch } from '../supabase-search'
import { PortfolioValueSection } from './portfolio-value-section'

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
  const isNewUser = user.createdTime > Date.now() - DAY_MS

  const { data: portfolioData, refresh: refreshPortfolio } = useAPIGetter(
    'get-user-portfolio',
    {
      userId: user.id,
    }
  )

  return (
    <Col className={clsx(className, 'gap-4')}>
      {!isNewUser && (
        <PortfolioValueSection
          user={user}
          defaultTimePeriod={
            isCreatedInLastWeek
              ? 'allTime'
              : currentUser?.id === user.id
              ? 'weekly'
              : 'monthly'
          }
          lastUpdatedTime={user.metricsLastUpdated}
          portfolio={portfolioData}
          balanceChanges={balanceChanges}
        />
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
