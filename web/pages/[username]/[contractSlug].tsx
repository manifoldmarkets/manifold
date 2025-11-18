import { ContractParams, MaybeAuthedContractParams } from 'common/contract'
import { getContractParams } from 'common/contract-params'
import { base64toPoints } from 'common/edge/og'
import { getContractFromSlug } from 'common/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { ContractPageContent } from 'web/components/contract/contract-page'
import { ContractSEO } from 'web/components/contract/contract-seo'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from '../404'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()
  const contract = await getContractFromSlug(adminDb, contractSlug)

  if (!contract) {
    return {
      notFound: true,
    }
  }

  if (contract.deleted) {
    return {
      props: {
        state: 'deleted',
        slug: contract.slug,
        visibility: contract.visibility,
      },
    }
  }

  const props = await getContractParams(contract, adminDb)

  return {
    props: {
      state: 'authed',
      params: removeUndefinedProps(props),
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: MaybeAuthedContractParams) {
  if (props.state === 'deleted') {
    return (
      <Page trackPageView={false}>
        <div className="flex h-[50vh] flex-col items-center justify-center">
          <Title>Question deleted</Title>
        </div>
      </Page>
    )
  }

  return <NonPrivateContractPage contractParams={props.params} />
}

function NonPrivateContractPage(props: { contractParams: ContractParams }) {
  const { contract, pointsString } = props.contractParams

  const points = pointsString ? base64toPoints(pointsString) : []

  const inIframe = useIsIframe()
  if (!contract) {
    return <Custom404 customText="Unable to fetch question" />
  }
  if (inIframe) {
    return <ContractEmbedPage contract={contract} points={points} />
  }

  return (
    <Page trackPageView={false} className="xl:col-span-10">
      <ContractSEO contract={contract} points={pointsString} />
      <ContractPageContent key={contract.id} {...props.contractParams} />
    </Page>
  )
}
