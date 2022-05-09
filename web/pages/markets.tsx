import { ContractSearch } from '../components/contract-search'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'

// TODO: Rename endpoint to "Explore"
export default function Markets() {
  return (
    <Page>
      <SEO
        title="Explore"
        description="Discover what's new, trending, or soon-to-close. Or search among our hundreds of markets."
        url="/markets"
      />
      <ContractSearch />
    </Page>
  )
}
