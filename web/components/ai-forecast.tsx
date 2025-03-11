import React from 'react'
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
import { SiOpenai, SiGooglegemini, SiAnthropic} from 'react-icons/si'
import { RiTwitterXLine } from 'react-icons/ri'
import  { LuLink } from "react-icons/lu"

const ENDPOINT = 'ai'

// Define type for capability cards
export type AICapabilityCard = {
  title: string
  description: string
  marketId: string
  type: string
  displayType?: 'top-two-mcq' | 'top-one-mcq' | 'binary-odds' | 'date-numeric'
}

export const AI_CAPABILITY_CARDS: AICapabilityCard[] = [
  // Monthly markets
  {
    title: 'LMSYS',
    description: 'Highest ranked model on lmsys',
    marketId: 'LsZPyLPI82',
    type: 'monthly',
    displayType: 'top-two-mcq',
  },
  {
    title: 'AiderBench',
    description: 'Highest ranked model on Aider',
    marketId: '0t8A5ZA0zQ', // Top March
    type: 'monthly',
    displayType: 'top-one-mcq',
  },
  
  // Releases
  {
    title: 'GPT-5',
    description: 'GPT-4 model released by EOY',
    marketId: 'fSGBkooZ6BY6UQoCrGUo', // GPT-5 numeric market
    type: 'releases',
    displayType: 'date-numeric'
  },
  {
    title: 'Claude 4',
    description: '',
    marketId: 'dyttOfuYp7ZUefFiymcx', // multiple-choice quarter
    type: 'releases',
    displayType: 'top-one-mcq',
  },
  {
    title: 'Gemini 3',
    description: '',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'releases',
    displayType: 'date-numeric'
  },
  {
    title: 'Grok 4',
    description: '',
    marketId: 'placeholder-4', // Replace with actual ID
    type: 'releases',
    displayType: 'date-numeric'
  },

  // Benchmarks
  {
    title: 'IMO Gold',
    description: 'AI gets gold on IMO by EOY',
    marketId: 'tu2ouer9zq',
    type: 'benchmark',
    displayType: 'binary-odds'
  },
  {
    title: 'Frontier Math Passed',
    description: '>80% on Frontier Math by EOY',
    marketId: 'LNdOg08SsU', // Replace with actual ID
    type: 'benchmark',
    displayType: 'binary-odds'
  },
    {
    title: 'Frontier Math Performance',
    description: 'top performance on frontier math',
    marketId: 'Uu5q0usuQg', // Replace with actual ID
    type: 'benchmark',
    displayType: 'top-one-mcq'
  },
  {
    title: 'SWE Bench Top Score',
    description: 'Top SWE Bench score by EOY',
    marketId: 'placeholder-2', // Replace with actual ID
    type: 'benchmark',
    displayType: 'binary-odds'
  },
  {
    title: 'Highest Humanity\'s Last Exam Top Score',
    description:'Highest score on Humanity\'s last exam by EOY',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'benchmark',
    displayType: 'top-one-mcq'
  },
  
  // Prizes
  {
    title: 'Millennium Prize Claimed',
    description: 'AI Solve Millennium Problem by EOY',
    marketId: 'placeholder-2', // Replace with actual ID
    type: 'prize',
    displayType: 'binary-odds'
  },
  {
    title: 'Arc AGI Claimed',
    description: 'Arc AGI prize by EOY',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'prize',
    displayType: 'binary-odds'
  },
  {
    title: 'Turing Test (Long Bets) Passed',
    description: 'Will AI pass long bets Turing Test by EOY?',
    marketId: 'placeholder-3', // Replace with actual ID
    type: 'prize',
    displayType: 'binary-odds'
  },
  
  // AI misuse
  {
    title: 'AI Blackmail',
    description: 'AI Blackmails someone for >$1000',
    marketId: 's82955uAnR',
    type: 'misuse',
    displayType: 'binary-odds'
  },
  {
    title: 'Hacking',
    description: 'AI independently hacks a system',
    marketId: 'placeholder-5', // Replace with actual ID
    type: 'misuse',
    displayType: 'binary-odds'
  },
  
  // Comparisons to humans
  {
    title: 'Creative Writing',
    description: 'AI-written novel wins major literary prize by 2027',
    marketId: 'placeholder-6', // Replace with actual ID
    type: 'human-comparison',
    displayType: 'binary-odds'
  },
  {
    title: 'Medical Diagnosis',
    description: 'AI outperforms average doctor in general diagnosis by 2026',
    marketId: 'placeholder-7', // Replace with actual ID
    type: 'human-comparison',
    displayType: 'binary-odds'
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
  marketId, 
  type, 
  displayType,
  contracts,
  className = ""
}: { 
  title: string
  marketId: string
  type: string
  displayType?: 'top-two-mcq' | 'top-one-mcq' | 'binary-odds' | 'date-numeric' | undefined
  contracts: Contract[]
  className?: string
}) {
  // Find the actual contract by ID
  const contract = contracts.find(c => c.id === marketId)
  console.log(`[${displayType}] ${title} - contract found:`, !!contract, 'id:', marketId)
  const liveContract = contract ? useLiveContract(contract) : null
  console.log(`[${displayType}] ${title} - liveContract:`, !!liveContract, 'path:', liveContract ? contractPath(liveContract) : 'N/A')
  
  // Get the probability if it's a binary contract
  const probability = liveContract && liveContract.outcomeType === 'BINARY'
    ? liveContract.prob !== undefined 
      ? liveContract.prob
      : getDisplayProbability(liveContract as BinaryContract)
    : null
  
  // Get the expected value if it's a numeric contract
  const numericValue = liveContract && liveContract.outcomeType === 'NUMBER' 
    ? getNumberExpectedValue(liveContract as CPMMNumericContract) 
    : null
  
  // Get top two companies and their probabilities for "top-two-mcq" display type
  const getTopTwoOdds = () => {
    if (!liveContract || liveContract.outcomeType !== 'MULTIPLE_CHOICE') {
      return [{ text: '—', probability: 0 }, { text: '—', probability: 0 }]
    }
    
    const answers = liveContract.answers || []
    if (answers.length < 2) {
      return [{ text: '—', probability: 0 }, { text: '—', probability: 0 }]
    }
    
    console.log("Raw answers for top-two-mcq:", answers)
    
    // Sort answers by probability in descending order
    const sortedAnswers = [...answers].sort((a, b) => {
      const aProb = a.prob ?? 0
      const bProb = b.prob ?? 0
      return bProb - aProb
    })
    
    const result = [
      { 
        text: sortedAnswers[0].text || '—', 
        probability: sortedAnswers[0].prob ?? sortedAnswers[0].prob ?? 0
      },
      { 
        text: sortedAnswers[1].text || '—', 
        probability: sortedAnswers[1].prob ?? sortedAnswers[1].prob ?? 0 
      }
    ]
    
    console.log("Final top-two-mcq results:", result)
    return result
  }
  
  // Get top one model for "top-one-mcq" display type
  const getTopOneOdds = () => {
    if (displayType === 'top-one-mcq') {
      // Return dummy data based on the card title
      if (title.includes('Claude')) {
        return { text: 'Claude 4', probability: 0.75 }
      } else if (title.includes('Frontier')) {
        return { text: 'Claude Ultra', probability: 0.62 }
      } else if (title.includes('AiderBench')) {
        return { text: 'GPT-4o', probability: 0.68 }
      } else if (title.includes('SWE Bench')) {
        return { text: 'DeepSeek Coder', probability: 0.58 }
      } else if (title.includes('Humanity')) {
        return { text: 'Claude Opus', probability: 0.71 }
      } else {
        return { text: 'Anthropic', probability: 0.58 }
      }
    }
    
    if (!liveContract || liveContract.outcomeType !== 'MULTIPLE_CHOICE') {
      console.log("Contract not valid for top-one-mcq:", liveContract?.outcomeType)
      return { text: '—', probability: 0 }
    }
    
    const answers = liveContract.answers || []
    if (answers.length < 1) {
      console.log("No answers found for top-one-mcq")
      return { text: '—', probability: 0 }
    }
    
    console.log("Raw answers for top-one-mcq:", answers)
    
    // Sort answers by probability in descending order and get top one
    const sortedAnswers = [...answers].sort((a, b) => {
      const aProb = a.prob ?? 0
      const bProb = b.prob ?? 0
      return bProb - aProb
    })
    
    console.log("Sorted top answer for top-one-mcq:", sortedAnswers[0])
    
    // First try probability field, then fallback to prob
    const result = { 
      text: sortedAnswers[0].text || '—', 
      probability: sortedAnswers[0].prob ?? 0 
    }
    
    console.log("Final result for top-one-mcq:", result)
    return result
  }
  
  // Determine the value to display
  let displayValue = '—'
  let topCompanies = [{ text: '—', probability: 0 }, { text: '—', probability: 0 }]
  let topModel = { text: '—', probability: 0 }
  
  if (displayType === 'top-two-mcq' && liveContract && liveContract.outcomeType === 'MULTIPLE_CHOICE') {
    topCompanies = getTopTwoOdds()
  } else if (displayType === 'top-one-mcq' && liveContract && liveContract.outcomeType === 'MULTIPLE_CHOICE') {
    topModel = getTopOneOdds()
  } else if (displayType === 'binary-odds') {
    // Return dummy probabilities based on the card title
    if (title.includes('IMO Gold')) {
      displayValue = formatPercent(0.37)
    } else if (title.includes('Millennium Prize')) {
      displayValue = formatPercent(0.12)
    } else if (title.includes('Arc AGI')) {
      displayValue = formatPercent(0.21)
    } else if (title.includes('Turing Test')) {
      displayValue = formatPercent(0.43)
    } else if (title.includes('Blackmail')) {
      displayValue = formatPercent(0.09)
    } else if (title.includes('Hacking')) {
      displayValue = formatPercent(0.16)
    } else if (title.includes('Creative Writing')) {
      displayValue = formatPercent(0.65)
    } else if (title.includes('Medical Diagnosis')) {
      displayValue = formatPercent(0.79)
    } else if (title.includes('SWE Bench')) {
      displayValue = formatPercent(0.30)
    } else {
      displayValue = formatPercent(0.25)
    }
  } else if (displayType === 'date-numeric') {
    // Use dummy data for date-numeric
    if (title.includes('GPT-5')) {
      displayValue = 'Q3 2025'
    } else if (title.includes('Claude 4')) {
      displayValue = 'Q2 2024'
    } else if (title.includes('Gemini 3')) {
      displayValue = 'Q1 2025'
    } else if (title.includes('Grok 4')) {
      displayValue = 'Q4 2024'
    } else {
      displayValue = 'Q2 2026'
    }
  } else {
    // Set dummy values for other cards based on card title
    if (title.includes('Frontier Math Passed')) {
      displayValue = formatPercent(0.72)
    } else if (title.includes('Highest Humanity')) {
      displayValue = '85%'
    } else {
      // Default display behavior
      displayValue = probability !== null 
        ? formatPercent(probability) 
        : numericValue !== null 
          ? numericValue.toFixed(1) 
          : '—'
    }
  }
  
  // Determine the accent color based on type (works in both light/dark modes)
  const getAccentColor = () => {
    switch(type) {
      case 'monthly': return 'text-primary-600'
      case 'releases': return 'text-amber-600'
      case 'benchmark': return 'text-teal-600'
      case 'prize': return 'text-amber-600'
      case 'misuse': return 'text-rose-600'
      case 'human-comparison': return 'text-purple-600'
      default: return 'text-primary-600'
    }
  }
  
  if (displayType === 'top-two-mcq') {
    // Create handler function with debug
    const handleClick = () => {
      console.log(`[top-two-mcq] ${title} - Click handler called, marketId:`, marketId)
      console.log(`Contract found:`, !!contract, 'liveContract:', !!liveContract)
      
      if (liveContract) {
        try {
          // Try to get the path directly from liveContract
          const path = contractPath(liveContract)
          console.log(`[top-two-mcq] ${title} - Opening path from liveContract:`, path)
          window.open(path, '_blank')
        } catch (e) {
          console.error("Error opening contract path:", e)
          // If we have the original contract, try using that
          if (contract) {
            try {
              const path = contractPath(contract)
              console.log(`[top-two-mcq] ${title} - Opening fallback path from contract:`, path)
              window.open(path, '_blank')
            } catch (e2) {
              console.error("Error with fallback path too:", e2)
            }
          }
        }
      }
    }
    
    return (
      <ClickFrame
        className={`group cursor-pointer rounded-lg p-4 border border-ink-200 bg-canvas-0 transition-all hover:bg-canvas-50 min-h-[240px] ${className}`}
        onClick={handleClick}
      >
        <Col className="h-full space-y-2">
          <div>
            <h3 className={`font-semibold ${getAccentColor()} text-lg mb-1`}>{title}</h3>
          </div>
          
          {/* VS Match Layout */}
          <div className="rounded-md p-3 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between px-1">

              {/* Left Company */}
              <div className="text-center w-[38%]">
                {getCompanyLogo(topCompanies[0].text) ? (
                  <div className="flex flex-col items-center">
                    <div className="h-16 w-16 mb-2 flex items-center justify-center text-primary-600">
                      {React.createElement(getCompanyLogo(topCompanies[0].text) as React.FC<{className?: string}>, { 
                        className: "w-14 h-14" 
                      })}
                    </div>
                    <div className="text-xl font-bold text-ink-900">
                      {topCompanies[0].text}
                    </div>
                  </div>
                ) : (
                  <div className="text-3xl font-bold text-ink-900 truncate">
                    {topCompanies[0].text}
                  </div>
                )}
                <div className="text-base text-ink-600 mt-1 font-medium">
                  {formatPercent(topCompanies[0].probability)}
                </div>
              </div>
              
              {/* VS Badge */}
              <div className="text-primary-800 text-med font-black mx-4">
                VS
              </div>
              
              {/* Right Company */}
              <div className="text-center w-[38%]">
                {getCompanyLogo(topCompanies[1].text) ? (
                  <div className="flex flex-col items-center">
                    <div className="h-14 w-14 mb-1 flex items-center justify-center text-primary-600">
                      {React.createElement(getCompanyLogo(topCompanies[1].text) as React.FC<{className?: string}>, { 
                        className: "w-12 h-12" 
                      })}
                    </div>
                    <div className="text-lg font-bold text-ink-900">
                      {topCompanies[1].text}
                    </div>
                  </div>
                ) : (
                  <div className="text-lg font-bold text-ink-900 truncate">
                    {topCompanies[1].text}
                  </div>
                )}
                <div className="text-base text-ink-600 mt-1 font-medium">
                  {formatPercent(topCompanies[1].probability)}
                </div>
              </div>
            </div>
            
            {/* Probability Bar */}
            <div className="mt-4 h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
              {/* Calculate the width percentage based on probabilities */}
              <div 
                className="h-full bg-primary-600" 
                style={{
                  width: `${(topCompanies[0].probability / (topCompanies[0].probability + topCompanies[1].probability)) * 100}%` 
                }}
              />
            </div>
          </div>
        </Col>
      </ClickFrame>
    )
  }
  
  // For top-one-mcq display type
  if (displayType === 'top-one-mcq') {
    // Create handler function with debug
    const handleClick = () => {
      console.log(`[top-one-mcq] ${title} - Click handler called, marketId:`, marketId)
      console.log(`Contract found:`, !!contract, 'liveContract:', !!liveContract)
      
      if (liveContract) {
        try {
          // Try to get the path directly from liveContract
          const path = contractPath(liveContract)
          console.log(`[top-one-mcq] ${title} - Opening path from liveContract:`, path)
          window.open(path, '_blank')
        } catch (e) {
          console.error("Error opening contract path:", e)
          // If we have the original contract, try using that
          if (contract) {
            try {
              const path = contractPath(contract)
              console.log(`[top-one-mcq] ${title} - Opening fallback path from contract:`, path)
              window.open(path, '_blank')
            } catch (e2) {
              console.error("Error with fallback path too:", e2)
            }
          }
        }
      }
    }
    
    return (
      <ClickFrame
        className={`group cursor-pointer rounded-lg p-4 border border-ink-200 bg-canvas-0 transition-all hover:bg-canvas-50 min-h-[240px] ${className}`}
        onClick={handleClick}
      >
        <Col className="h-full space-y-2">
          <div>
            <h3 className={`font-semibold ${getAccentColor()} text-xl mb-1`}>{title}</h3>
          </div>
          
          <div className="rounded-md p-3 flex-1 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-center">
              <span className={`text-transparent bg-clip-text ${
                type === 'releases' 
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600'
                : type === 'benchmark'
                  ? 'bg-gradient-to-r from-teal-400 via-teal-500 to-teal-600'
                : 'bg-gradient-to-r from-primary-400 via-primary-600 to-primary-700'
              }`}>
                {topModel.text}
              </span>
            </div>
            <div className="text-lg font-medium mt-4">
              <span className={`text-transparent bg-clip-text ${
                type === 'releases' 
                ? 'bg-gradient-to-br from-amber-400 to-amber-600'
                : type === 'benchmark'
                  ? 'bg-gradient-to-br from-teal-400 to-teal-600'
                : 'bg-gradient-to-br from-primary-400 to-primary-600'
              }`}>
                {formatPercent(topModel.probability)}
              </span>
            </div>
          </div>
        </Col>
      </ClickFrame>
    )
  }

  // Standard card layout for other display types
  // Create handler function with debug
  const handleClick = () => {
    console.log(`[${displayType || 'standard'}] ${title} - Click handler called, marketId:`, marketId)
    console.log(`Contract found:`, !!contract, 'liveContract:', !!liveContract)
    
    if (liveContract) {
      try {
        // Try to get the path directly from liveContract
        const path = contractPath(liveContract)
        console.log(`[${displayType || 'standard'}] ${title} - Opening path from liveContract:`, path)
        window.open(path, '_blank')
      } catch (e) {
        console.error("Error opening contract path:", e)
        // If we have the original contract, try using that
        if (contract) {
          try {
            const path = contractPath(contract)
            console.log(`[${displayType || 'standard'}] ${title} - Opening fallback path from contract:`, path)
            window.open(path, '_blank')
          } catch (e2) {
            console.error("Error with fallback path too:", e2)
          }
        }
      }
    }
  }
  
  return (
    <ClickFrame
      className={`group cursor-pointer rounded-lg p-4 border border-ink-200 bg-canvas-0 transition-all hover:bg-canvas-50 min-h-[240px] ${className}`}
      onClick={handleClick}
    >
      <Col className="h-full">
        <div>
          <h3 className={`font-semibold ${getAccentColor()} text-xl mb-1`}>{title}</h3>
        </div>
        
        <div className="flex items-center justify-center flex-grow h-[160px]">
          {displayType === 'binary-odds' ? (
            <div className="flex flex-col items-center">
              <div className="text-5xl font-bold text-center">
                <span className="bg-gradient-to-br from-teal-400 via-teal-500 to-primary-600 text-transparent bg-clip-text">
                  {displayValue}
                </span>
              </div>
            </div>
          ) : displayType === 'date-numeric' ? (
            <div className="text-4xl font-bold text-center">
              <span className={`text-transparent bg-clip-text ${
                type === 'releases' 
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600' 
                : 'bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600'
              }`}>
                {displayValue}
              </span>
            </div>
          ) : (
            <div className="text-4xl font-bold text-center">
              <span className={`text-transparent bg-clip-text ${
                type === 'prize' 
                ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600'
                : type === 'misuse' 
                  ? 'bg-gradient-to-b from-rose-400 via-rose-500 to-rose-600'
                  : type === 'human-comparison'
                    ? 'bg-gradient-to-b from-purple-400 via-purple-500 to-purple-600'
                    : 'bg-gradient-to-b from-primary-400 via-primary-500 to-primary-700'
              }`}>
                {displayValue}
              </span>
            </div>
          )}
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
    'monthly': 'Best Model in March',
    'releases': 'Model Release Dates',
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
      
      {/* Card Categories */}
      {Object.entries(typeLabels).map(([type, label]) => (
        <Col key={type} className="mb-10" id={type}>
          <div className="mb-4">
            <Row className="items-center justify-between">
              <div>
                <h3 className={`items-center gap-1 font-semibold sm:text-lg ${
                  type === 'releases' ? 'text-amber-600' :
                  type === 'benchmark' ? 'text-teal-600' :
                  type === 'prize' ? 'text-amber-600' :
                  type === 'misuse' ? 'text-rose-600' :
                  type === 'human-comparison' ? 'text-purple-600' :
                  'text-primary-600'
                }`}>{label}</h3>
                <p className="text-ink-500 text-sm">
                  {type === 'monthly'? '': 
                   type === 'releases' ? '' :
                   type === 'benchmark' ? '' :
                   type === 'prize' ? '' :
                   type === 'misuse' ? '' :
                   ''}
                </p>
              </div>
              <Link 
                href={`#${type}`} 
                className="text-primary-500 hover:text-primary-700"
                scroll={false}
                aria-label={`Link to ${label} section`}
              >
                <LuLink />
              </Link>
            </Row>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {capabilityCardsByType[type]?.map((card, idx) => {
              // Special sizing for "monthly" type cards
              let cardClassName = "";
              
              // For "monthly" cards - make first card 2/3 width and second 1/3 width
              if (type === "monthly" && idx === 0) {
                cardClassName = "md:col-span-2"; // first card takes 2/3 width on desktop
              } else if (type === "monthly" && idx === 1) {
                cardClassName = ""; // Second card takes 1/3 width (default)
              }
              
              return (
                <CapabilityCard 
                  key={idx}
                  title={card.title}
                  marketId={card.marketId}
                  type={card.type}
                  displayType={card.displayType}
                  contracts={contracts}
                  className={cardClassName}
                />
              );
            })}
          </div>
        </Col>
      ))}
      
      {/* Categories of AI Markets */}
      {AI_CATEGORIES.map((category) => {
        const categoryContracts = getContractsByCategory(category.id);
        
        return (
          <Col key={category.id} className="mb-10">
            <div className="mb-4">
              <Row className="items-center justify-between">
                <div>
                  <h3 id={category.id} className="text-lg font-semibold text-primary-700">{category.title}</h3>
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
          className="fade-in bg-canvas-0 group relative cursor-pointer rounded-lg p-4 border border-ink-200 shadow-sm"
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

// Get company logo component based on company name
function getCompanyLogo(companyName: string): React.ComponentType | null {
  // Strip any trailing whitespace or periods that might be in the company name
  const normalizedName = companyName.trim().replace(/\.$/, '');
  
  switch (normalizedName.toLowerCase()) {
    case 'openai':
      return SiOpenai;
    case 'anthropic':
      return SiAnthropic; // Using Anthropic icon
    case 'google deepmind':
    case 'googledeepmind':
    case 'deepmind':
      return SiGooglegemini; // Using Google Gemini icon
    case 'xai':
      return RiTwitterXLine; // Using a generic AI icon for xAI
    default:
      return null; // No specific icon for other companies
  }
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