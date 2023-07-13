import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { Spacer } from 'web/components/layout/spacer'
import { getUser, User } from 'web/lib/firebase/users'
import { Row } from 'web/components/layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { SEO } from 'web/components/SEO'
import { EditInPlaceInput } from 'web/components/widgets/edit-in-place'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { getPortfolioBySlug } from 'web/lib/supabase/portfolio'
import { Portfolio, portfolioPath } from 'common/portfolio'
import { updatePortfolio } from 'web/lib/firebase/api'

export async function getStaticProps(props: {
  params: { portfolioSlug: string }
}) {
  const { portfolioSlug } = props.params

  const portfolio = await getPortfolioBySlug(portfolioSlug)
  const creator = portfolio ? await getUser(portfolio.creatorId) : null

  return {
    props: {
      portfolio,
      creator,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function PortfolioPage(props: {
  portfolio: Portfolio | null
  creator: User
}) {
  const { creator, portfolio } = props
  const user = useUser()

  if (!portfolio) {
    return <Custom404 />
  }
  const path = portfolioPath(portfolio.slug)
  const shareUrl = `https://${ENV_CONFIG.domain}${path}`

  const canEdit = !!user && user.id === portfolio.creatorId

  return (
    <Page>
      <SEO
        title={portfolio.name}
        description={'A portfolio of markets related to ' + portfolio.name}
        url={path}
      />
      <div className="mx-auto mt-1 flex w-full max-w-2xl flex-col">
        <EditInPlaceInput
          className="-m-px px-2 !text-3xl"
          initialValue={portfolio.name}
          onSave={(name) => updatePortfolio({ id: portfolio.id, name })}
          disabled={!canEdit}
        >
          {(value) => <Title className="!my-0 p-2" children={value} />}
        </EditInPlaceInput>
        <div className="h-2" />
        <Row className="mt-4 items-center">
          <div className="flex px-2">
            <div className="text-ink-500 mr-1">Portfolio by</div>
            <UserLink
              className="text-ink-700"
              name={creator.name}
              username={creator.username}
            />
          </div>
          <Row className="items-center sm:pr-2">
            <CopyLinkButton
              linkIconOnlyProps={{
                tooltip: 'Copy link to post',
              }}
              url={shareUrl}
              eventTrackingName={'copy post link'}
            />
          </Row>
        </Row>

        <Spacer h={2} />
        <div className="bg-canvas-0 rounded-lg px-6 py-4 sm:py-0">
          <div className="flex w-full flex-col py-2">...</div>
        </div>
      </div>
    </Page>
  )
}
