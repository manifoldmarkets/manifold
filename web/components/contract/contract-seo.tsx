import { Contract, contractPath } from 'common/contract'
import { getSeoDescription, getContractOGProps } from 'common/contract-seo'
import { removeUndefinedProps } from 'common/util/object'
import { parseJsonContentToText } from 'common/util/parse'

import { JsonLd } from 'web/components/JsonLd'
import { SEO } from 'web/components/SEO'
import { buildMarketQAPage, buildBreadcrumbs } from 'web/lib/json-ld'

export function ContractSEO(props: {
  contract: Contract
  /** Base64 encoded points */
  points?: string
}) {
  const { contract, points } = props
  const { question } = contract

  const seoDesc = getSeoDescription(contract)
  const ogCardProps = removeUndefinedProps({
    ...getContractOGProps(contract),
    points,
  })

  const seo = (
    <SEO
      title={question}
      description={seoDesc}
      url={contractPath(contract)}
      ogProps={{ props: ogCardProps, endpoint: 'market' }}
      shouldIgnore={contract.visibility !== 'public'}
    />
  )

  // Build JSON-LD for eligible market types
  const descriptionText = parseJsonContentToText(contract.description)
  const answers =
    'answers' in contract
      ? contract.answers.slice(0, 10).map((a) => ({
          text: a.text,
          prob: a.prob,
          resolution: a.resolution,
        }))
      : undefined

  const jsonLd = buildMarketQAPage({
    question: contract.question,
    description: descriptionText,
    url: `https://manifold.markets${contractPath(contract)}`,
    creatorName: contract.creatorName,
    creatorUsername: contract.creatorUsername,
    createdTime: contract.createdTime,
    closeTime: contract.closeTime ?? undefined,
    resolutionTime: contract.resolutionTime ?? undefined,
    resolution: contract.resolution ?? undefined,
    outcomeType: contract.outcomeType,
    probability: 'prob' in contract ? (contract as any).prob : undefined,
    uniqueBettorCount: contract.uniqueBettorCount ?? 0,
    answers,
    lastUpdatedTime: contract.lastUpdatedTime,
    coverImageUrl: contract.coverImageUrl ?? undefined,
    visibility: contract.visibility,
    deleted: contract.deleted,
  })

  const breadcrumbs = jsonLd
    ? buildBreadcrumbs([
        { name: 'Home', url: 'https://manifold.markets' },
        {
          name: contract.creatorName,
          url: `https://manifold.markets/${contract.creatorUsername}`,
        },
        { name: contract.question }, // Last item omits URL per Google docs
      ])
    : null

  return (
    <>
      {seo}
      <JsonLd data={jsonLd} id="market" />
      <JsonLd data={breadcrumbs} id="breadcrumbs" />
    </>
  )
}
