import { useRouter } from 'next/router'

import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract-panel'
import { useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useState } from 'react'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { LockClosedIcon } from '@heroicons/react/solid'

export default function Create() {
  useTracking('view create page')
  useRedirectIfSignedOut()

  const user = useUser()
  const router = useRouter()
  const params = router.query as NewQuestionParams
  const [theme, setTheme] = useState<'private' | 'non-private'>('non-private')

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
      <div
        className={clsx(
          'mx-auto w-full max-w-2xl px-6 py-4 transition-colors ',
          theme == 'private' ? ' bg-primary-100' : 'bg-canvas-0'
        )}
      >
        <Row className="w-full justify-between">
          <Title
            className={clsx(
              'transition-colors',
              theme == 'private' ? 'text-ink-1000' : ''
            )}
          >
            Create a market
          </Title>
          {theme == 'private' && (
            <LockClosedIcon className="text-ink-1000 h-8 w-8" />
          )}
        </Row>

        <div className="text-ink-700 mb-4">
          Set up your own play-money prediction market on any question.
        </div>

        <NewContractPanel params={params} creator={user} setTheme={setTheme} />
      </div>
    </Page>
  )
}
