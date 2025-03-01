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
        title="AI Dashboard | Manifold Markets"
        description="A curated dashboard of AI-related prediction markets - track progress, capabilities, and forecasts"
        image="/ai.png"
      />
      
      {/* Hero Section with AGI Clock */}
      <div className="relative w-full overflow-hidden bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 py-16 text-white">
        {/* Abstract AI-themed background patterns */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-blue-400 blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/3 h-48 w-48 rounded-full bg-purple-400 blur-3xl"></div>
          <div className="absolute right-1/4 top-1/2 h-40 w-40 rounded-full bg-indigo-400 blur-3xl"></div>
        </div>
        
        <Col className="mx-auto max-w-6xl px-4">
          <Row className="mb-8 items-center justify-between">
            <h1 className="bg-gradient-to-r from-blue-200 to-indigo-100 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
              AI Progress Dashboard
            </h1>
            <CopyLinkOrShareButton
              url={`https://${ENV_CONFIG.domain}/${ENDPOINT}`}
              eventTrackingName="copy ai share link"
              tooltip="Share"
              className="hidden sm:flex"
            />
          </Row>
          
          {liveWhenAgi ? (
            <Col className="mb-8 items-center">
              <Row className="mb-4 items-center gap-2">
                <Link
                  href={contractPath(liveWhenAgi)}
                  className={clsx('text-3xl font-bold text-white transition hover:text-blue-200')}
                >
                  Countdown to AGI
                </Link>
              </Row>
              <p className="mb-8 max-w-3xl text-center text-xl">
                Manifold forecasters predict artificial general intelligence by{' '}
                <span className="font-bold text-blue-200">{expectedYear.getFullYear()}</span>.
                What's your prediction?
              </p>
              <div className="rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
                <Row className="w-full justify-center">
                  <Col className="w-fit gap-6">
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
              </div>
            </Col>
          ) : (
            <Col className="mb-8 items-center text-center">
              <h2 className="mb-4 text-3xl font-bold text-blue-200">
                The Future of Intelligence
              </h2>
              <p className="mb-8 max-w-3xl text-xl leading-relaxed">
                Track AI progress through prediction markets &mdash; from forecasting AGI timelines
                to assessing current capabilities and potential impacts on society.
              </p>
              <Link 
                href="/create" 
                className="inline-block rounded-md bg-white px-8 py-3 text-lg font-medium text-indigo-900 shadow-md transition hover:bg-blue-50"
              >
                Create an AI market
              </Link>
            </Col>
          )}
        </Col>
      </div>
      
      {/* Main Dashboard Content */}
      <Col className="mx-auto max-w-6xl px-4 py-12">
        <Row className="mb-8 items-center justify-between">
          <h2 className="bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-3xl font-bold text-transparent">
            AI Prediction Markets
          </h2>
          <Link 
            href="/create" 
            className="rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-2.5 text-white shadow-md transition hover:from-indigo-700 hover:to-blue-700"
          >
            Create a market
          </Link>
        </Row>
        
        <div className="mb-12 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
          <p className="text-lg leading-relaxed text-gray-700">
            This dashboard showcases prediction markets related to artificial intelligence &mdash; tracking AI progress
            from major milestones to current capabilities and potential societal impacts. Each probability 
            represents the collective wisdom of thousands of forecasters on Manifold Markets.
          </p>
        </div>
        
        {/* Categories of AI Markets */}
        {CATEGORIES.map((category) => {
          // Cache the result to avoid calculating it twice
          const categoryContracts = getContractsByCategory(category.id);
          
          return (
            <Col key={category.id} className="mb-16">
              <div className="mb-6 border-l-4 border-indigo-500 pl-4">
                <Row className="items-center justify-between">
                  <div>
                    <h3 id={category.id} className="text-2xl font-bold text-indigo-900">{category.title}</h3>
                    <p className="text-gray-600">{category.description}</p>
                  </div>
                  <Link 
                    href={`#${category.id}`} 
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 transition hover:bg-indigo-200"
                    scroll={false}
                    aria-label={`Link to ${category.title} section`}
                  >
                    #
                  </Link>
                </Row>
              </div>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {categoryContracts.length > 0 ? (
                  categoryContracts.map((contract) => (
                    <div key={contract.id} className="transform transition duration-200 hover:scale-[1.02] hover:shadow-lg">
                      <FeedContractCard 
                        contract={contract} 
                        size="md"
                        trackingPostfix="ai dashboard"
                      />
                    </div>
                  ))
                ) : (
                  <div className="col-span-full rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="mb-4 text-lg font-medium text-gray-700">Markets in this category will appear here</p>
                    <p className="mb-6 text-gray-500">Create a market to contribute to our collective intelligence on AI</p>
                    <Link 
                      href="/create" 
                      className="inline-block rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-2.5 text-white shadow-md transition hover:from-indigo-700 hover:to-blue-700"
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
        <div className="mt-16 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 shadow-xl">
          <div className="relative p-8">
            {/* Background decorative elements */}
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600 opacity-10 blur-3xl"></div>
            <div className="absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-indigo-400 opacity-10 blur-3xl"></div>
            
            <h3 className="mb-6 text-2xl font-bold text-white">AI Resources</h3>
            <p className="mb-8 text-lg text-blue-100">
              Expand your knowledge on AI progress and possibilities with these curated resources:
            </p>
            
            <div className="grid gap-6 md:grid-cols-2">
              <ResourceCard 
                title="AI Timeline"
                description="Major milestones in artificial intelligence history"
                link="https://aimultiple.com/ai-timeline"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
              
              <ResourceCard 
                title="LessWrong AI Capabilities"
                description="Community discussions on AI progress and potential"
                link="https://www.lesswrong.com/tag/ai-capabilities"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                }
              />
              
              <ResourceCard 
                title="Alignment Forum"
                description="Research discussions on AI safety and alignment"
                link="https://www.alignmentforum.org/"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
              />
              
              <ResourceCard 
                title="Future of Life Institute"
                description="AI policy, governance, and safety research"
                link="https://futureoflife.org/ai/"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                }
              />
            </div>
          </div>
        </div>
      </Col>
    </Page>
  )
}

// Helper component for resource cards
function ResourceCard({ title, description, link, icon }: { 
  title: string, 
  description: string, 
  link: string,
  icon: React.ReactNode
}) {
  return (
    <Link href={link} target="_blank" rel="noopener noreferrer" className="group">
      <div className="rounded-xl bg-white/10 p-6 transition duration-200 hover:bg-white/20">
        <Row className="mb-3 items-center gap-3">
          <div className="rounded-full bg-indigo-800 p-2">
            {icon}
          </div>
          <h4 className="text-lg font-bold text-white group-hover:text-blue-200">{title}</h4>
        </Row>
        <p className="text-indigo-100">{description}</p>
      </div>
    </Link>
  )
}