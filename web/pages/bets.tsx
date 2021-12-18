import { BetsList } from '../components/bets-list'
import { Header } from '../components/header'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'

export default function BetsPage() {
  const user = useUser()

  return (
    <div className="max-w-4xl px-4 pb-8 mx-auto">
      <SEO title="Your bets" description="Your bets" url="/bets" />
      <Header />
      <Title text="Your bets" />
      {user && <BetsList user={user} />}
    </div>
  )
}
