import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { useLiveContract } from 'web/hooks/use-contract'
import { db } from 'web/lib/supabase/db'
import { getContract, getContracts } from 'common/supabase/contracts'
import { contractPath, CPMMNumericContract } from 'common/contract'
import Link from 'next/link'
import clsx from 'clsx'
import { linkClass } from 'web/components/widgets/site-link'
import { getNumberExpectedValue } from 'common/src/number'
import { Clock } from 'web/components/clock/clock'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Contract } from 'common/contract'
import { ClickFrame } from 'web/components/widgets/click-frame'

const ENDPOINT = 'ai'

// Categories for AI markets
const CATEGORIES = [
  {
    id: 'milestones',
    title: 'AI Milestones',
    description: 'Key achievements and breakthroughs in AI development',
    contractIds: [
      'Gtv5mhjKaiLD6Bkvfhcv', // When AGI
      '9PQ4zEbNqDMUVYNDwzHH', // AGI by 2030 (this is a placeholder ID)
      'OmRqzdMXJpvbZ9TNw0i2', // LLM outperforms humans (this is a placeholder ID)
    ],
  },
  {
    id: 'capabilities',
    title: 'Current Capabilities',
    description: 'What can AI do right now?',
    contractIds: [
      'placeholder-1', // Claude 3 Opus (placeholder ID)
      'placeholder-2', // Stable Diffusion 3 (placeholder ID)
      'placeholder-3', // Gemini Ultra performance (placeholder ID)
    ],
  },
  {
    id: 'impact',
    title: 'Economic & Social Impact',
    description: 'How AI is changing our world',
    contractIds: [
      'placeholder-4', // AI in healthcare (placeholder ID)
      'placeholder-5', // AI job displacement (placeholder ID)
      'placeholder-6', // AI regulation (placeholder ID)
    ],
  },
  {
    id: 'risks',
    title: 'AI Risks & Safety',
    description: 'Potential concerns and safety measures',
    contractIds: [
      'placeholder-7', // AI alignment breakthroughs (placeholder ID)
      'placeholder-8', // AI risk reduction (placeholder ID)
      'placeholder-9', // Existential risk from AI (placeholder ID)
    ],
  }
]

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
    
    // Fetch all contracts for each category - only try to fetch valid IDs
    const allContractIds = CATEGORIES.flatMap(category => 
      category.contractIds.filter(id => id && !id.startsWith('placeholder-'))
    )
    
    let contracts = []
    if (allContractIds.length > 0) {
      try {
        contracts = await getContracts(db, allContractIds) || []
      } catch (error) {
        console.error('Error fetching contracts:', error)
        contracts = []
      }
    }
    
    return {
      props: {
        whenAgi: whenAgi || null,
        contracts: contracts || []
      },
      revalidate,
    }
  } catch (error) {
    console.error('Error in getStaticProps:', error)
    return {
      props: {
        whenAgi: null,
        contracts: []
      },
      revalidate,
    }
  }
}

interface AIDashboardProps {
  whenAgi: CPMMNumericContract | null
  contracts: Contract[]
}

export default function AIDashboard({ whenAgi, contracts = [] }: AIDashboardProps) {
  // Only use useLiveContract if whenAgi exists and has an id
  const liveWhenAgi = whenAgi && whenAgi.id ? useLiveContract(whenAgi) : null
  const expectedValueAGI = liveWhenAgi ? getNumberExpectedValue(liveWhenAgi) : 2030
  const eventYear = Math.floor(expectedValueAGI)
  const eventMonth = Math.round((expectedValueAGI - eventYear) * 12)
  const expectedYear = new Date(eventYear, eventMonth, 1)
  
  // Get contracts by category
  const getContractsByCategory = (categoryId: string) => {
    const category = CATEGORIES.find(c => c.id === categoryId)
    if (!category) return []
    
    // Make sure we have contracts
    if (!contracts || !Array.isArray(contracts)) return []
    
    // Only return contracts that exist and have valid IDs
    return category.contractIds
      .map(id => contracts.find(contract => 
        contract !== null && 
        contract !== undefined && 
        contract.id === id
      ))
      .filter(contract => contract !== undefined && contract !== null) as Contract[]
  }

  return (
    <Page trackPageView="ai dashboard">
      <SEO
        title="Manifold AI Forecast"
        description="Live prediction market odds on artificial intelligence progress"
        image="/ai.png"
      />
      
      <Col className="mb-8 gap-6 px-1 sm:gap-8 sm:px-2">
        <Col>
          <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
            Manifold AI Forecast
          </div>
          <div className="text-ink-500 text-md mt-2 flex font-normal">
            Live prediction market odds on artificial intelligence progress
          </div>
        </Col>
        
        {/* AGI Clock Card */}
        {liveWhenAgi && (
          <ClickFrame
            className="fade-in bg-canvas-0 group relative cursor-pointer rounded-lg p-4 shadow-sm"
            onClick={() => window.location.href = contractPath(liveWhenAgi)}
          >
            <Row className="justify-between">
              <Link
                href={contractPath(liveWhenAgi)}
                className="hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg"
              >
                When will we achieve artificial general intelligence?
              </Link>
              <CopyLinkOrShareButton
                url={`https://${ENV_CONFIG.domain}/${ENDPOINT}`}
                eventTrackingName="copy ai share link"
                tooltip="Share"
              />
            </Row>
            
            <Row className="mt-4 justify-between flex-wrap md:flex-nowrap">
              <Col className="mb-4 md:mb-0 md:max-w-lg">
                <p className="text-lg">
                  The market expects AGI by{' '}
                  <span className="font-semibold">{expectedYear.getFullYear()}</span>
                </p>
                <p className="mt-2 text-sm text-ink-500">
                  Based on thousands of predictions from Manifold forecasters
                </p>
              </Col>
              
              <Col className="w-full md:w-fit gap-4">
                <Clock year={expectedValueAGI} />
                <NumericBetPanel
                  contract={liveWhenAgi}
                  labels={{
                    lower: 'sooner',
                    higher: 'later',
                  }}
                />
              </Col>
            </Row>
          </ClickFrame>
        )}
        
        {/* Trending Markets Section */}
        <Row className="items-center gap-1 font-semibold sm:text-lg">
          <div className="relative">
            <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
            <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
          </div>
          <span>AI Prediction Markets</span>
        </Row>
        
        <p className="text-ink-500 -mt-2">
          Track the future of AI through prediction markets - from major milestones to capabilities,
          economic impact, and safety concerns
        </p>
        
        {/* Categories of AI Markets */}
        {CATEGORIES.map((category) => {
          // Cache the result to avoid calculating it twice
          const categoryContracts = getContractsByCategory(category.id);
          
          return (
            <Col key={category.id} className="mb-10">
              <div className="mb-4">
                <Row className="items-center justify-between">
                  <div>
                    <h3 id={category.id} className="text-lg font-semibold text-primary-700">{category.title}</h3>
                    <p className="text-ink-500 text-sm">{category.description}</p>
                  </div>
                  <Link 
                    href={`#${category.id}`} 
                    className="text-primary-500 hover:text-primary-700"
                    scroll={false}
                    aria-label={`Link to ${category.title} section`}
                  >
                    #
                  </Link>
                </Row>
              </div>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categoryContracts.length > 0 ? (
                  categoryContracts.map((contract) => (
                    <FeedContractCard 
                      key={contract.id} 
                      contract={contract} 
                      size="md"
                      trackingPostfix="ai dashboard"
                    />
                  ))
                ) : (
                  <div className="col-span-full rounded-lg border border-ink-200 p-5 text-center bg-canvas-50">
                    <p className="text-ink-600">Markets in this category will appear here</p>
                    <Link 
                      href="/create" 
                      className="mt-3 inline-block rounded-md bg-primary-500 px-4 py-2 text-white hover:bg-primary-600"
                    >
                      Create an AI market
                    </Link>
                  </div>
                )}
              </div>
            </Col>
          );
        })}
        
        {/* Resources Section */}
        <Col className="mt-8 rounded-lg border border-ink-200 bg-canvas-50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-primary-700">AI Resources</h3>
          <p className="mb-4 text-ink-500">
            Expand your knowledge on AI progress with these resources:
          </p>
          
          <div className="grid gap-4 md:grid-cols-2">
            <ResourceCard 
              title="AI Timeline"
              description="Major milestones in AI history"
              link="https://aimultiple.com/ai-timeline"
            />
            
            <ResourceCard 
              title="LessWrong AI Capabilities"
              description="Community discussions on AI progress"
              link="https://www.lesswrong.com/tag/ai-capabilities"
            />
            
            <ResourceCard 
              title="Alignment Forum"
              description="Research on AI safety and alignment"
              link="https://www.alignmentforum.org/"
            />
            
            <ResourceCard 
              title="Future of Life Institute"
              description="AI policy and governance research"
              link="https://futureoflife.org/ai/"
            />
          </div>
        </Col>
      </Col>
    </Page>
  )
}

// Helper component for resource cards
function ResourceCard({ title, description, link }: { 
  title: string, 
  description: string, 
  link: string,
}) {
  return (
    <Link href={link} target="_blank" rel="noopener noreferrer" className="group">
      <div className="rounded-md border border-ink-200 bg-canvas-0 p-4 transition hover:bg-canvas-50">
        <h4 className="text-primary-600 font-medium group-hover:underline">{title}</h4>
        <p className="text-sm text-ink-500">{description}</p>
      </div>
    </Link>
  )
}