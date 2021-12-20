import { BetsList } from '../components/bets-list'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'

export default function BetsPage() {
  const user = useUser()

  return (
    <Page>
      <SEO title="Your bets" description="Your bets" url="/bets" />
      <Title text="Your bets" />
      {user && <BetsList user={user} />}
    </Page>
  )
}
