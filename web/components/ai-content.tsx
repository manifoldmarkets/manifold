import { useEffect, useState } from 'react'
import { Contract } from 'common/contract'
import { getAiContracts } from './ai-contracts'

import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { Col } from 'web/components/layout/col'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { HorizontalContractsCarousel } from './horizontal-contracts-carousel'

export interface AiContentData {
  newAiModel: Contract | null
  closingSoonContracts: Contract[]
  surveyContracts: Contract[]
  shortBenchmarks: Contract[]
  longBenchmarks: Contract[]
  aiPolicyContracts: Contract[]
  aiCompaniesContracts: Contract[]
  recentActivityContracts: Contract[]
  justResolvedContracts: Contract[]
}

async function getAiContentData(): Promise<AiContentData | null> {
  try {
    const aiContracts = await getAiContracts()
    if (!aiContracts) return null

    const {
      surveyContracts,
      closingSoonContracts,
      shortBenchmarks,
      longBenchmarks,
      aiPolicyContracts,
      aiCompaniesContracts,
      newAiModel,
      recentActivityContracts,
      justResolvedContracts,
    } = aiContracts

    return {
      newAiModel,
      closingSoonContracts,
      surveyContracts,
      shortBenchmarks,
      longBenchmarks,
      aiPolicyContracts,
      aiCompaniesContracts,
      recentActivityContracts,
      justResolvedContracts,
    }
  } catch (error) {
    console.error('Error fetching AI contracts:', error)
    return null
  }
}

export function AiContent() {
  const [data, setData] = useState<AiContentData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const aiData = await getAiContentData()
        setData(aiData)
      } catch (error) {
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  if (isLoading) {
    return <LoadingIndicator />
  }

  if (!data) {
    return <div>No AI data found.</div>
  }

  const {
    newAiModel,
    closingSoonContracts,
    surveyContracts,
    shortBenchmarks,
    longBenchmarks,
    aiPolicyContracts,
    aiCompaniesContracts,
    recentActivityContracts,
    justResolvedContracts,
  } = data

  const AI_TABS: Tab[] = [
    {
      title: 'Happening Now',
      content: (
        <Col className=" px-1 pt-2">
          <HorizontalContractsCarousel
            contracts={recentActivityContracts}
            title="Recent Activity"
            className="pt-2"
          />

          <HorizontalContractsCarousel
            contracts={closingSoonContracts}
            title="Closing Soon"
            className=" pt-2"
          />

          <HorizontalContractsCarousel
            contracts={justResolvedContracts}
            title="Most Recently Resolved"
            className=" pt-2"
          />
        </Col>
      ),
    },
    {
      title: 'Companies',
      content: (
        <Col className="mb-8 px-1">
          <ContractsTable contracts={aiCompaniesContracts} />
        </Col>
      ),
    },
    {
      title: 'AI Digest 2025',
      content: (
        <Col className="mb-8 px-1">
          <div className="pb-2 pt-3">
            Manifold has partnered with AI Digest to bring you high quality
            markets on AI benchmarks and indicators in 2025.{' '}
            <a
              href="https://ai2025.org"
              target="_blank"
              className="text-primary-600 hover:underline"
            >
              Complete their survey
            </a>{' '}
            and trade on our corresponding markets!
          </div>
          <ContractsTable contracts={surveyContracts} />
        </Col>
      ),
    },
    {
      title: 'Short Benchmarks',
      content: (
        <Col className="mt-1 px-1">
          <ContractsTable contracts={shortBenchmarks} />
        </Col>
      ),
    },
    {
      title: 'Long Benchmarks',
      content: (
        <Col className="mb-8 px-1">
          <ContractsTable contracts={longBenchmarks} />
        </Col>
      ),
    },
    {
      title: 'Policy',
      content: (
        <Col className="mb-8 px-1">
          <ContractsTable contracts={aiPolicyContracts} />
        </Col>
      ),
    },
  ]

  return (
    <Col className="px-1">
      {newAiModel && (
        <Col className="pb-4">
          <FeedContractCard contract={newAiModel} />
        </Col>
      )}
      <QueryUncontrolledTabs
        className="bg-canvas-50 sticky top-[2.9rem] z-10"
        tabs={AI_TABS}
        defaultIndex={0}
        labelsParentClassName="mr-4"
        trackingName="ai-tabs"
      />
    </Col>
  )
}
