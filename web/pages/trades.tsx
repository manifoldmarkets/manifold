import { BetsList } from '../components/bets-list'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'

export default function TradesPage() {
  const user = useUser()

  return (
    <Page>
      <SEO title="Your trades" description="Your trades" url="/trades" />
      <Title text="Your trades" />
      {user && <BetsList user={user} />}
    </Page>
  )
}
