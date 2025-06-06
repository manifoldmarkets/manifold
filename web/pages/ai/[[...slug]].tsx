import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { db } from 'web/lib/supabase/db'
import { getContract, getContracts } from 'common/supabase/contracts'
import { CPMMNumericContract, Contract } from 'common/contract'
import { AIForecast, AI_CAPABILITY_CARDS } from 'web/components/ai-forecast'

const ENDPOINT = 'ai'

// For static generation
export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

// Revalidate every minute
const revalidate = 60

export async function getStaticProps() {
  try {
    // Fetch the "When AGI" contract for the hero section
    const whenAgi = await getContract(db, 'Gtv5mhjKaiLD6Bkvfhcv')

    // Fetch all contracts from AI_CAPABILITY_CARDS - only try to fetch valid IDs
    const allContractIds = AI_CAPABILITY_CARDS.map(
      (card) => card.marketId
    ).filter((id) => id && !id.startsWith('placeholder-'))

    let contracts: Contract[] = []
    if (allContractIds.length > 0) {
      try {
        contracts = (await getContracts(db, allContractIds)) || []
      } catch (error) {
        console.error('Error fetching contracts:', error)
        contracts = []
      }
    }

    return {
      props: {
        whenAgi: whenAgi || null,
        contracts: contracts || [],
      },
      revalidate,
    }
  } catch (error) {
    console.error('Error in getStaticProps:', error)
    return {
      props: {
        whenAgi: null,
        contracts: [],
      },
      revalidate,
    }
  }
}

interface AIDashboardProps {
  whenAgi: CPMMNumericContract | null
  contracts: Contract[]
}

export default function AIDashboard({
  whenAgi,
  contracts = [],
}: AIDashboardProps) {
  return (
    <Page trackPageView="ai dashboard">
      <SEO
        title="Manifold AI Forecast"
        description="Live prediction market odds on artificial intelligence progress"
        image="/ai.png"
      />

      <AIForecast whenAgi={whenAgi} contracts={contracts} />
    </Page>
  )
}
