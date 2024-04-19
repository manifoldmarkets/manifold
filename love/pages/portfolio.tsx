import { LovePage } from 'love/components/love-page'
import { useUser } from 'web/hooks/use-user'
import { UserBetsTable } from 'web/components/bet/user-bets-table'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'

export default function PortfolioPage() {
  const user = useUser()

  return (
    <LovePage trackPageView="love portfolio">
      {user && (
        <Col className="w-full p-2">
          See full portfolio value history on Manifold main site
          <Spacer h={4} />
          <UserBetsTable user={user} />
        </Col>
      )}
    </LovePage>
  )
}
