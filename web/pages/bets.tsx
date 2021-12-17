import { BetsList } from '../components/bets-list'
import { Header } from '../components/header'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { User } from '../lib/firebase/users'

export default function BetsPage(props: { user: User; currentUser?: User }) {
  const { user } = props

  return (
    <div>
      <SEO title="Your bets" description="Your bets" url="/bets" />

      <Header />

      <div className="max-w-4xl pt-8 pb-0 sm:pb-8 mx-auto">
        <div>
          <Title text="Your bets" />

          <BetsList user={user} />
        </div>
      </div>
    </div>
  )
}
