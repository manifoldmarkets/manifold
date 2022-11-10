import { useRouter } from 'next/router'

import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { User } from 'common/user'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract-panel'
import { SiteLink } from 'web/components/widgets/site-link'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  return { props: { auth: await getUserAndPrivateUser(creds.uid) } }
})

export default function Create(props: { auth: { user: User } }) {
  useTracking('view create page')
  const { user } = props.auth
  const router = useRouter()
  const params = router.query as NewQuestionParams

  if (!router.isReady) return <div />

  if (user.isBannedFromPosting)
    return (
      <Page>
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-lg px-6 py-4 sm:py-0">
            <Title className="!mt-0" text="Create a market" />
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
          <Title className="!mt-0" text="Create a market" />

          <div className="mb-4 text-gray-700">
            Set up your own play-money prediction market on any question.{' '}
            <SiteLink
              href="https://help.manifold.markets/manifold-101#ec8a2d8520654fe2be28caf61fb5d0e6"
              className="text-indigo-700"
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
