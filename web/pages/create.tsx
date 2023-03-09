import { useRouter } from 'next/router'

import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract-panel'
import { SiteLink } from 'web/components/widgets/site-link'
import { useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'

export default function Create() {
  useTracking('view create page')
  useRedirectIfSignedOut()

  const user = useUser()
  const router = useRouter()
  const params = router.query as NewQuestionParams

  if (!user || !router.isReady) return <div />

  if (user.isBannedFromPosting)
    return (
      <Page>
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-lg px-6 py-4 sm:py-0">
            <Title>Create a market</Title>
            <p>Sorry, you are currently banned from creating a market.</p>
          </div>
        </div>
      </Page>
    )

  return (
    <Page>
      <SEO
        title="Create a market"
        description="Create a play-money prediction market on any question."
        url="/create"
      />
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-lg px-6 py-4 sm:py-0">
          <Title>Create a market</Title>

          <div className="text-ink-700 mb-4">
            Set up your own play-money prediction market on any question.{' '}
            <SiteLink
              href="https://help.manifold.markets/manifold-101#ec8a2d8520654fe2be28caf61fb5d0e6"
              className="text-primary-700"
            >
              Learn more...
            </SiteLink>
          </div>

          <NewContractPanel params={params} creator={user} />
        </div>
      </div>
    </Page>
  )
}
