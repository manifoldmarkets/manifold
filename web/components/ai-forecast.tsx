import { BinaryContract, CPMMNumericContract, Contract, contractPath } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { useLiveContract } from 'web/hooks/use-contract'
import { getNumberExpectedValue } from 'common/src/number'
import { Clock } from 'web/components/clock/clock'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { HorizontalContractsCarousel } from './horizontal-contracts-carousel'
import Link from 'next/link'
import { formatPercent } from 'common/util/format'
import { getDisplayProbability } from 'common/calculate'

const ENDPOINT = 'ai'

export const AI_CAPABILITY_CARDS = [
  // Monthly markets
  {
    title: 'lmsys',
    description: 'Highest ranked model on lmsys',
    marketId: 'LsZPyLPI82', // Replace with actual ID
    type: 'monthly',
  },
  {
    title: 'AiderBench',
    description: 'Highest ranked model on AiderBench',
    marketId: 'OS06sL6OgU', // Replace with actual ID
    type: 'monthly',
  },
  {
    title: '??',
    description: 'Highest ranked model on ??',
    marketId: 'LNdOg08SsU', // Replace with actual ID
    type: 'monthly',
  },
  
  // Benchmarks
  {
    title: 'IMO',
    description: 'AI gets gold on IMO by EOY',
    marketId: 'placeholder-0', // Replace with actual ID
    type: 'benchmark',
  },
  {
    title: 'Frontier Math',
    description: '>80% on Frontier Math by EOY',
    marketId: 'LNdOg08SsU', // Replace with actual ID
    type: 'benchmark',
  },
  {
    title: 'SWE Bench',
    description: 'Top SWE Bench score by EOY',
    marketId: 'placeholder-2', // Replace with actual ID
    type: 'benchmark',
  },
  {
    title: 'Highest Humanity\'s last exam',
    description:'Highest score on Humanity\'s last exam by EOY',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'benchmark',
  },
  
  // Prizes
  {
    title: 'Millennium Prize',
    description: 'AI Solve Millennium Problem by EOY',
    marketId: 'placeholder-2', // Replace with actual ID
    type: 'prize',
  },
  {
    title: 'Arc AGI',
    description: 'Arc AGI prize by EOY',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'prize',
  },
  {
    title: 'Turing Test (Long Bets)',
    description: 'Will AI pass long bets Turing Test by EOY?',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'prize',
  },
  
  // AI misuse
  {
    title: 'Blackmail',
    description: 'AI Blackmails someone for >$1000',
    marketId: 'placeholder-4', // Replace with actual ID
    type: 'misuse',
  },
  {
    title: 'Hacking',
    description: 'AI independently hacks a system',
    marketId: 'placeholder-5', // Replace with actual ID
    type: 'misuse',
  },
  
  // Comparisons to humans
  {
    title: 'Creative Writing',
    description: 'AI-written novel wins major literary prize by 2027',
    marketId: 'placeholder-6', // Replace with actual ID
    type: 'human-comparison',
  },
  {
    title: 'Medical Diagnosis',
    description: 'AI outperforms average doctor in general diagnosis by 2026',
    marketId: 'placeholder-7', // Replace with actual ID
    type: 'human-comparison',
  }
]

// Categories for AI markets
export const AI_CATEGORIES = [
  {
    id: 'milestones',
    title: 'AI Milestones',
    description: 'Key achievements and breakthroughs in AI development',
    contractIds: [
      'LsZPyLPI82', // Best company by end of April
      'OS06sL6OgU', // Grammarly replacement
      'LNdOg08SsU', // Frontier Math score by end of 2025
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

export interface AIForecastProps {
  whenAgi: CPMMNumericContract | null
  contracts: Contract[]
  hideTitle?: boolean
}

// Capability Card Component for the static cards with market data
function CapabilityCard({ 
  title, 
  description, 
  marketId, 
  type, 
  contracts 
}: { 
  title: string
  description: string
  marketId: string
  type: string
  contracts: Contract[]
}) {
  // Find the actual contract by ID
  const contract = contracts.find(c => c.id === marketId)
  const liveContract = contract ? useLiveContract(contract) : null
  
  // Get the probability if it's a binary contract
  const probability = liveContract && 'prob' in liveContract 
    ? getDisplayProbability(liveContract as BinaryContract) 
    : null
  
  // Get the expected value if it's a numeric contract
  const numericValue = liveContract && liveContract.outcomeType === 'NUMBER' 
    ? getNumberExpectedValue(liveContract as CPMMNumericContract) 
    : null
  
  // Determine the value to display
  const displayValue = probability !== null 
    ? formatPercent(probability) 
    : numericValue !== null 
      ? numericValue.toFixed(1) 
      : '—'
  
  // Determine the accent color based on type (works in both light/dark modes)
  const getAccentColor = () => {
    switch(type) {
      case 'monthly': return 'text-primary-600'
      case 'benchmark': return 'text-teal-600'
      case 'prize': return 'text-amber-600'
      case 'misuse': return 'text-rose-600'
      case 'human-comparison': return 'text-purple-600'
      default: return 'text-primary-600'
    }
  }
  
  // Use site's standard border/bg classes for light/dark mode compatibility
  return (
    <ClickFrame
      className="group cursor-pointer rounded-lg p-4 border border-ink-200 bg-canvas-0 transition-all hover:bg-canvas-50"
      onClick={() => liveContract && window.open(contractPath(liveContract), '_blank')}
    >
      <Col className="justify-between h-full">
        <div>
          <h3 className={`font-semibold ${getAccentColor()} text-lg mb-1`}>{title}</h3>
          <p className="text-ink-600 text-sm mb-4 line-clamp-3">{description}</p>
        </div>
        
        <div className="mt-auto">
          <div className="text-lg font-bold text-ink-900">{displayValue}</div>
          {/* <div className={`text-xs ${getAccentColor()} mt-1`}>
            {liveContract ? 'Current forecast' : 'Market data unavailable'}
          </div> */}
        </div>
      </Col>
    </ClickFrame>
  )
}

export function AIForecast({ whenAgi, contracts = [], hideTitle }: AIForecastProps) {
  const liveWhenAgi = whenAgi && whenAgi.id ? useLiveContract(whenAgi) : null
  const expectedValueAGI = liveWhenAgi ? getNumberExpectedValue(liveWhenAgi) : 2030
  const eventYear = Math.floor(expectedValueAGI)
  const eventMonth = Math.round((expectedValueAGI - eventYear) * 12)
  const expectedYear = new Date(eventYear, eventMonth, 1)
  
  // Get contracts by category
  const getContractsByCategory = (categoryId: string) => {
    const category = AI_CATEGORIES.find(c => c.id === categoryId)
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
  
  // Group capability cards by type
  const capabilityCardsByType = AI_CAPABILITY_CARDS.reduce((grouped, card) => {
    if (!grouped[card.type]) {
      grouped[card.type] = []
    }
    grouped[card.type].push(card)
    return grouped
  }, {} as Record<string, typeof AI_CAPABILITY_CARDS>)
  
  // Type labels for UI
  const typeLabels = {
    'monthly': 'Monthly Markets',
    'benchmark': 'Benchmarks',
    'prize': 'Prizes',
    'misuse': 'AI Misuse',
    'human-comparison': 'Comparisons to Humans'
  }

  return (
    <Col className="mb-8 gap-6 px-1 sm:gap-8 sm:px-2">
      <Col className={hideTitle ? 'hidden' : ''}>
        <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
          Manifold AI Forecast
        </div>
        <div className="text-ink-500 text-md mt-2 flex font-normal">
          Live prediction market odds on artificial intelligence progress
        </div>
      </Col>
      
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
      
      {/* Capabilities Section */}
      <Col className="mb-10" id="capabilities">
        <div className="mb-4">
          <Row className="items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-primary-700">Capabilities</h3>
              <p className="text-ink-500 text-sm">Current forecasts on AI capabilities and potential</p>
            </div>
            <Link 
              href="#capabilities" 
              className="text-primary-500 hover:text-primary-700"
              scroll={false}
              aria-label="Link to Capabilities section"
            >
              #
            </Link>
          </Row>
        </div>
        
        {/* Capability Cards by Type */}
        {Object.entries(typeLabels).map(([type, label]) => (
          <Col key={type} className="mb-8">
            <h4 className="text-md font-medium text-ink-700 mb-3">{label}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {capabilityCardsByType[type]?.map((card, idx) => (
                <CapabilityCard 
                  key={idx}
                  title={card.title}
                  description={card.description}
                  marketId={card.marketId}
                  type={card.type}
                  contracts={contracts}
                />
              ))}
            </div>
          </Col>
        ))}
      </Col>
      
      {/* Categories of AI Markets */}
      {AI_CATEGORIES.map((category) => {
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
            
            {categoryContracts.length > 0 ? (
              <HorizontalContractsCarousel contracts={categoryContracts} />
            ) : (
              <div className="rounded-lg border border-ink-200 p-5 text-center bg-canvas-50">
                <p className="text-ink-600">Markets in this category will appear here</p>
                <Link 
                  href="/create" 
                  className="mt-3 inline-block rounded-md bg-primary-500 px-4 py-2 text-white hover:bg-primary-600"
                >
                  Create an AI market
                </Link>
              </div>
            )}
          </Col>
        );
      })}
      
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