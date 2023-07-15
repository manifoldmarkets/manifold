import { useRouter } from 'next/router'

import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract/new-contract-panel'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'

export type VisibilityTheme = 'private' | 'non-private'

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
            <Title>Create a question</Title>
            <p>Sorry, you are currently banned from creating a question.</p>
          </div>
        </div>
      </Page>
    )

  return (
    <Page>
      <SEO
        title="Create a question"
        description="Create a play-money prediction market on any question."
        url="/create"
      />

      <NewContractPanel params={params} creator={user} />
    </Page>
  )
}
