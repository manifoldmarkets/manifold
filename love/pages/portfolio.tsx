import { LovePage } from 'love/components/love-page'
import { useUser } from 'web/hooks/use-user'
import { PortfolioValueSection } from 'web/components/portfolio/portfolio-value-section'
import { UserBetsTable } from 'web/components/bet/user-bets-table'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'

export default function PortfolioPage() {
  const user = useUser()

  return (
    <LovePage trackPageView="love portfolio">
      {user && (
        <Col className="w-full p-2">
          <PortfolioValueSection
            userId={user.id}
            defaultTimePeriod={'weekly'}
            lastUpdatedTime={user.metricsLastUpdated}
            isCurrentUser={true}
            
          />
          <Spacer h={4} />
          <UserBetsTable user={user} />
        </Col>
      )}
    </LovePage>
  )
}
