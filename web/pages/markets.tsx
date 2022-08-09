import { useUser } from 'web/hooks/use-user'
import { ContractSearch } from '../components/contract-search'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'

// TODO: Rename endpoint to "Explore"
export default function Markets() {
  const user = useUser()
  return (
    <Page>
      <SEO
        title="Explore"
        description="Discover what's new, trending, or soon-to-close. Or search thousands of prediction markets."
        url="/markets"
      />
      <ContractSearch user={user} />
    </Page>
  )
}
