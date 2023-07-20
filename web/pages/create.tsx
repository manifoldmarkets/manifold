import { useRouter } from 'next/router'

import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { NewQuestionParams } from 'web/components/new-contract/new-contract-panel'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { ContractParamsForm } from 'web/components/new-contract/contract-params-form'
import { OutcomeType } from 'common/contract'

export type VisibilityTheme = 'private' | 'non-private'

export default function Create() {
  useTracking('view create page')
  useRedirectIfSignedOut()

  const user = useUser()
  const router = useRouter()
  const { params: jsonParams } = router.query
  const params = jsonParams
    ? JSON.parse(jsonParams as string)
    : ({} as NewQuestionParams)

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

      <ContractParamsForm
        outcomeType={(params.outcomeType as OutcomeType) ?? 'MULTIPLE_CHOICE'}
        params={params}
        creator={user}
      />
    </Page>
  )
}
