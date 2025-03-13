import React, { useState } from 'react'
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
import Link from 'next/link'
import { formatPercent } from 'common/util/format'
import { getDisplayProbability } from 'common/calculate'
import { SiOpenai, SiGooglegemini, SiAnthropic} from 'react-icons/si'
import { RiTwitterXLine } from 'react-icons/ri'
import { LuLink, LuInfo } from 'react-icons/lu'
import { GiSpermWhale } from "react-icons/gi"
import { PiBirdBold } from "react-icons/pi"
import { LiaKiwiBirdSolid } from "react-icons/lia"

// Shared background pattern for all cards
const BG_PATTERN_LIGHT = "bg-[url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.02' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")]"
const BG_PATTERN_DARK = "dark:bg-[url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23FFFFFF' fill-opacity='0.05' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")]"
const CARD_BG_PATTERN = `${BG_PATTERN_LIGHT} ${BG_PATTERN_DARK}`

const ENDPOINT = 'ai'

// Tooltip Component for benchmark terms
function Tooltip({ title, description }: { title: string, description: string }) {
  const [isVisible, setIsVisible] = useState(false)
  
  return (
    <div className="inline-flex items-center">
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-ink-500 hover:text-primary-600 transition-colors focus:outline-none"
        aria-label={`Info about ${title}`}
      >
        <LuInfo size={16} />
      </button>
      
      {isVisible && (
        <div className="absolute right-0 top-6 z-50 w-64 bg-canvas-0 shadow-lg rounded-md border border-ink-200 p-3 text-sm text-ink-700">
          <h4 className="font-medium mb-1">{title}</h4>
          <p>{description}</p>
        </div>
      )}
    </div>
  )
}

// Function to get the appropriate description for tooltip based on card title
function getTooltipDescription(cardTitle: string): string {
  const keyTerms: Record<string, string> = {
    'IMO Gold': 'The International Mathematical Olympiad (IMO) is the world championship mathematics competition for high school students. Getting a gold medal requires a high score on extremely challenging math problems.',
    'Frontier Math': 'Advanced mathematical problems at the cutting edge of research that have traditionally been very difficult for AI systems to solve.',
    'SWE Bench': 'A test of AI coding capabilities across real-world software engineering tasks from GitHub issues.',
    'Humanity\'s Last Exam': 'A collection of extremely difficult problems across various domains, designed to test the limits of AI capabilities compared to human experts.',
    'Millennium Prize': 'The Millennium Prize Problems are seven of the most difficult unsolved problems in mathematics, each with a $1 million prize for solution.',
    'Arc AGI': 'Anthropic\'s Rubric for AI Capability Evaluation - a comprehensive benchmark designed to evaluate artificial general intelligence capabilities.',
    'Turing Test': 'Each of the three human judges will conduct two hour long text-based interviews with each of the four candidates. The computer would have passed the Turing test if it fooled two of the three judges.',
    'CodeForces': 'CodeForces is a competitive programming platform with challenging algorithmic problems that test reasoning, efficiency, and mathematical thinking.'
  }
  
  // Find the first matching key term in the title
  for (const [term, description] of Object.entries(keyTerms)) {
    if (cardTitle.includes(term)) {
      return description
    }
  }
  
  // Default description if no match is found
  return `Please Google for more information about "${cardTitle}" benchmark.`
}

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
    description: 'GPT-5 model released by EOY',
    marketId: 'XAsltiEcvy7KwJveXQ42',
    type: 'releases',
    displayType: 'top-one-mcq'
  },
  {
    title: 'Claude 3.7 Opus',
    description: '',
    marketId: 'REZNpc8dQO',
    type: 'releases',
    displayType: 'top-one-mcq',
  },
  {
    title: 'Gemini 3',
    description: '',
    marketId: 'placeholder-3',
    type: 'releases',
    displayType: 'date-numeric'
  },
  {
    title: 'Grok 4',
    description: '',
    marketId: 'QUyRsPRhgd',
    type: 'releases',
    displayType: 'top-one-mcq'
  },
  {
    title: 'Deepseek R2',
    description: '',
    marketId: 'hZ8ytzn9gh',
    type: 'releases',
    displayType: 'top-one-mcq'
  },
  {
    title: 'Deepseek V4',
    description: '',
    marketId: 'yLnQQZsc2E',
    type: 'releases',
    displayType: 'top-one-mcq'
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
    title: 'CodeForces Top Score',
    description: '>80% on Frontier Math by EOY',
    marketId: 'RSAcZtOZyl',
    type: 'benchmark',
    displayType: 'top-one-mcq'
  },
    {
    title: 'Frontier Math Top Score',
    description: 'top performance on frontier math',
    marketId: 'Uu5q0usuQg',
    type: 'benchmark',
    displayType: 'top-one-mcq'
  },
  {
    title: 'SWE Bench Top Score',
    description: 'Top SWE Bench score by EOY',
    marketId: 'placeholder-2',
    type: 'benchmark',
    displayType: 'binary-odds'
  },
  {
    title: 'Highest Humanity\'s Last Exam Top Score',
    description:'Highest score on Humanity\'s last exam by EOY',
    marketId: 'tzsZCn85RQ',
    type: 'benchmark',
    displayType: 'binary-odds'
  },
  
  // Prizes
  {
    title: 'Millennium Prize',
    description: 'AI Solve Millennium Problem by EOY',
    marketId: 'KmvP3Ggw5z7vFATu5urA',
    type: 'prize',
    displayType: 'binary-odds'
  },
  {
    title: 'Arc AGI',
    description: 'Arc AGI prize by EOY',
    marketId: 'W1KGdImLB5cb1p75M88e',
    type: 'prize',
    displayType: 'binary-odds'
  },
  {
    title: 'Turing Test (Long Bets)',
    description: 'Will AI pass long bets Turing Test by EOY?',
    marketId: 'nKyHon3IPOqJYzaWTHJB',
    type: 'prize',
    displayType: 'binary-odds'
  },
  
  // AI misuse
  {
    title: 'AI Blackmail by 2028',
    description: 'AI Blackmails someone for >$1000',
    marketId: 'W1KGdImLB5cb1p75M88e',
    type: 'misuse',
    displayType: 'binary-odds'
  },
  {
    title: 'Hacking',
    description: 'AI independently hacks a system',
    marketId: 's82955uAnR',
    type: 'misuse',
    displayType: 'binary-odds'
  },
  
  // Comparisons to humans
  {
    title: 'Creative Writing',
    description: 'AI-written novel wins major literary prize by 2027',
    marketId: 'placeholder-6',
    type: 'human-comparison',
    displayType: 'binary-odds'
  },
  {
    title: 'Medical Diagnosis',
    description: 'AI outperforms average doctor in general diagnosis by 2026',
    marketId: 'placeholder-7',
    type: 'human-comparison',
    displayType: 'binary-odds'
  }
]

export interface AIForecastProps {
  whenAgi: CPMMNumericContract | null
  contracts: Contract[]
  hideTitle?: boolean
}

// Base card component with shared styling
function CardBase({ 
  onClick, 
  children, 
  className = "",
  minHeight = "min-h-[240px]"
}: { 
  onClick: () => void, 
  children: React.ReactNode, 
  className?: string,
  minHeight?: string
}) {
  return (
    <ClickFrame
      className={`group cursor-pointer rounded-lg p-4 border border-ink-200 dark:border-ink-300 bg-canvas-0 
      transition-all hover:bg-canvas-50 dark:hover:bg-canvas-50 ${minHeight}
      shadow-[2px_2px_4px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.15)] 
      relative ${CARD_BG_PATTERN} ${className}`}
      onClick={onClick}
    >
      {children}
    </ClickFrame>
  );
}

// Component for card title with optional icon
// Component for card title with tooltip for benchmarks and prizes
function CardTitle({ 
  title, 
  type, 
  showModelIcon = false,
  showTooltip = false
}: { 
  title: string, 
  type: string, 
  showModelIcon?: boolean,
  showTooltip?: boolean 
}) {
  return (
    <div className="flex items-center justify-between w-full mb-1">
      <div className="flex items-center">
        {showModelIcon && (
          <div className="mr-2 text-ink-600">
            <AIModelIcon title={title} />
          </div>
        )}
        <h3 className={`font-semibold ${getAccentColor(type)} text-lg`}>{title}</h3>
      </div>
      
      {/* Conditionally show tooltip for benchmark and prize cards */}
      {showTooltip && (
        <div className="ml-2">
          <Tooltip title={title} description={getTooltipDescription(title)} />
        </div>
      )}
    </div>
  );
}

// Component for showing AI model icon
function AIModelIcon({ title, className = "h-5 w-5" }: { title: string, className?: string }) {
  if (title.includes('GPT')) return <SiOpenai className={className} />;
  if (title.includes('Claude')) return <SiAnthropic className={className} />;  
  if (title.includes('Gemini')) return <SiGooglegemini className={className} />;
  if (title.includes('Grok')) return <RiTwitterXLine className={className} />;
  if (title.includes('Deepseek')) return <GiSpermWhale className={className} />;
  if (title.includes('Qwen')) return <PiBirdBold className={className} />;
  return null;
}

// Get accent color based on card type
function getAccentColor(type: string) {
  switch(type) {
    case 'monthly': return 'text-primary-600 dark:text-primary-500';
    case 'releases': return 'text-fuchsia-700 dark:text-fuchsia-500';
    case 'benchmark': return 'text-teal-700 dark:text-teal-500';
    case 'prize': return 'text-amber-700 dark:text-amber-500';
    case 'misuse': return 'text-rose-700 dark:text-rose-500';
    case 'human-comparison': return 'text-cyan-700 dark:text-cyan-500';
    default: return 'text-primary-600 dark:text-primary-500';
  }
}

// Get gradient based on card type
function getGradient(type: string, isText = true) {
  const textPrefix = isText ? 'text-transparent bg-clip-text ' : '';
  
  switch(type) {
    case 'releases':
      return `${textPrefix}bg-gradient-to-r from-fuchsia-500 via-fuchsia-600 to-fuchsia-700 dark:from-fuchsia-400 dark:via-fuchsia-500 dark:to-fuchsia-600`;
    case 'benchmark':
      return `${textPrefix}bg-gradient-to-r from-teal-500 via-teal-600 to-teal-700 dark:from-teal-400 dark:via-teal-500 dark:to-teal-600`;
    case 'prize':
      return `${textPrefix}bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 dark:from-amber-400 dark:via-amber-500 dark:to-amber-600`;
    case 'misuse':
      return `${textPrefix}bg-gradient-to-br from-rose-500 via-rose-600 to-rose-700 dark:from-rose-400 dark:via-rose-500 dark:to-rose-600`;
    case 'human-comparison':
      return `${textPrefix}bg-gradient-to-br from-cyan-500 via-cyan-600 to-cyan-700 dark:from-cyan-400 dark:via-cyan-500 dark:to-cyan-600`;
    default:
      return `${textPrefix}bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 dark:from-primary-400 dark:via-primary-500 dark:to-primary-600`;
  }
}

// Create contract click handler
function createContractClickHandler(contract: Contract | null, liveContract: Contract | null, title: string, marketId: string, displayType?: string) {
  return () => {
    console.log(`[${displayType || 'standard'}] ${title} - Click handler called, marketId:`, marketId);
    console.log(`Contract found:`, !!contract, 'liveContract:', !!liveContract);
    
    if (liveContract) {
      try {
        // Try to get the path directly from liveContract
        const path = contractPath(liveContract);
        console.log(`[${displayType || 'standard'}] ${title} - Opening path from liveContract:`, path);
        window.open(path, '_blank');
      } catch (e) {
        console.error("Error opening contract path:", e);
        // If we have the original contract, try using that
        if (contract) {
          try {
            const path = contractPath(contract);
            console.log(`[${displayType || 'standard'}] ${title} - Opening fallback path from contract:`, path);
            window.open(path, '_blank');
          } catch (e2) {
            console.error("Error with fallback path too:", e2);
          }
        }
      }
    }
  };
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
        probability: sortedAnswers[0].prob ?? 0
      },
      { 
        text: sortedAnswers[1].text || '—', 
        probability: sortedAnswers[1].prob ?? 0 
      }
    ]
    
    console.log("Final top-two-mcq results:", result)
    return result
  }
  
  // Get top one model for "top-one-mcq" display type
  const getTopOneOdds = () => {
    if (!liveContract || 
        (liveContract.outcomeType !== 'MULTIPLE_CHOICE')) {
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
    
    const result = { 
      text: sortedAnswers[0].text || '—', 
      probability: sortedAnswers[0].prob ?? 0 
    }
    
    console.log("Final result for top-one-mcq:", result)
    return result
  }
  
  // Determine the value to display
  let displayValue = formatPercent(0.25) // '-'
  let topCompanies = [{ text: '—', probability: 0 }, { text: '—', probability: 0 }]
  let topModel = { text: '—', probability: 0 }
  
  if (displayType === 'top-two-mcq' && liveContract && liveContract.outcomeType === 'MULTIPLE_CHOICE') {
  topCompanies = getTopTwoOdds()
} else if (displayType === 'top-one-mcq') {
  topModel = getTopOneOdds()
  console.log(`[${title}] topModel set to:`, topModel)
} else if (displayType === 'binary-odds') {
  if (liveContract && liveContract.outcomeType === 'BINARY') {
    const prob = liveContract.prob !== undefined 
      ? liveContract.prob 
      : getDisplayProbability(liveContract as BinaryContract)
    displayValue = formatPercent(prob)
  } 
} else {
  const probability = 0.25
  displayValue = probability !== null 
    ? formatPercent(probability) 
    : numericValue !== null 
      ? numericValue.toFixed(1)
      : '—'
  }
  
  // Create click handler for the card
  const clickHandler = createContractClickHandler(contract ?? null, liveContract, title, marketId, displayType)
  
  if (displayType === 'top-two-mcq') {
    return (
      <CardBase onClick={clickHandler} className={className}>
        <Col className="h-full space-y-2">
          <div className="w-full">
            <CardTitle 
              title={title} 
              type={type} 
              showModelIcon={type === 'releases'} 
              showTooltip={type === 'benchmark' || type === 'prize'}
            />
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
            <div className="mt-4 h-1.5 w-full rounded-full bg-ink-200 dark:bg-ink-700 overflow-hidden">
              {/* Calculate the width percentage based on probabilities */}
              <div 
                className="h-full bg-primary-600 dark:bg-primary-500" 
                style={{
                  width: `${(topCompanies[0].probability / (topCompanies[0].probability + topCompanies[1].probability)) * 100}%` 
                }}
              />
            </div>
          </div>
        </Col>
      </CardBase>
    )
  }
  
  // For top-one-mcq display type
  if (displayType === 'top-one-mcq') {
    // For monthly type, display similar to top-two-mcq but with only one company
    if (type === 'monthly') {
      return (
        <CardBase onClick={clickHandler} className={className}>
          <Col className="h-full space-y-2">
            <div className="w-full">
              <CardTitle 
                title={title} 
                type={type} 
                showModelIcon
                showTooltip
              />
            </div>
            
            {/* Company Layout single company */}
            <div className="rounded-md p-3 flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-center">
                {/* Company Display */}
                <div className="text-center">
                  {getCompanyLogo(topModel.text) ? (
                    <div className="flex flex-col items-center">
                      <div className="h-16 w-16 mb-2 flex items-center justify-center text-primary-600">
                        {React.createElement(getCompanyLogo(topModel.text) as React.FC<{className?: string}>, { 
                          className: "w-14 h-14" 
                        })}
                      </div>
                      <div className="text-xl font-bold text-ink-900">
                        {topModel.text}
                      </div>
                    </div>
                  ) : (
                    <div className="text-3xl font-bold text-ink-900 truncate">
                      {topModel.text}
                    </div>
                  )}
                  <div className="text-base text-ink-600 mt-1 font-medium">
                    {formatPercent(topModel.probability)}
                  </div>
                </div>
              </div>
            </div>
          </Col>
        </CardBase>
      )
    }
    
    return (
      <CardBase onClick={clickHandler} className={className}>
        <Col className="h-full space-y-2">
          <div className="w-full">
            <CardTitle 
              title={title} 
              type={type} 
              showModelIcon={type === 'releases'} 
              showTooltip={type === 'benchmark' || type === 'prize'}
            />
          </div>
          
          <div className="flex flex-col h-full justify-between">
            {/* Main content - centered model name */}
            <div className="rounded-md p-3 flex-1 flex items-center justify-center">
              <div className={`font-bold text-center ${topModel.text.length > 15 ? 'text-2xl' : topModel.text.length > 10 ? 'text-3xl' : 'text-4xl'}`}>
                <span className={getGradient(type)}>
                  {topModel.text}
                </span>
              </div>
            </div>
            
            {/* Bottom-aligned probability display */}
            <div className="text-ink-600 text-sm mt-3 text-left w-full px-1">
              Probability: <span className="font-medium">{formatPercent(topModel.probability)}</span>
            </div>
          </div>
        </Col>
      </CardBase>
    )
  }

  // Standard card layout for remaining display types
  return (
    <CardBase onClick={clickHandler} className={className}>
      <Col className="h-full">
        <div className="w-full mb-1">
          <CardTitle 
            title={title} 
            type={type} 
            showModelIcon={type === 'releases'} 
            showTooltip={type === 'benchmark' || type === 'prize'}
          />
        </div>
        
        <div className="flex flex-col items-center justify-center flex-grow mt-2">
          {displayType === 'binary-odds' ? (
            <div className="flex flex-col justify-between h-full w-full">
              <div className="flex-1 flex items-center justify-center">
                <div className={`font-bold text-center ${displayValue.length > 5 ? 'text-5xl' : 'text-6xl'}`}>
                  <span className={getGradient(type)}>
                    {displayValue}
                  </span>
                </div>
              </div>
              {/* Brief descriptive text under percentages */}
              {(type === 'benchmark' || type === 'prize' || type === 'misuse' || type === 'human-comparison') && (
                <p className="text-ink-600 text-sm mt-3 text-left w-full px-1">
                  {type === 'benchmark' && title.includes('IMO Gold') && 'An LLM gets a IMO gold medal'}
                  {type === 'benchmark' && title.includes('Frontier Math') && 'An LLM gets 80%+'}
                  {type === 'benchmark' && title.includes('SWE Bench') && 'LLM Top Sscore'}
                  {type === 'benchmark' && title.includes('Last Exam') && 'LLM > Human'}
                  {type === 'prize' && title.includes('Millennium') && 'Chance of solving a million-dollar math problem'}
                  {type === 'prize' && title.includes('Arc AGI') && 'Probability of meeting AGI criteria by 2025'}
                  {type === 'prize' && title.includes('Turing Test') && 'Odds of passing rigorous human-indistinguishability test'}
                  {type === 'misuse' && title.includes('Blackmail') && 'Risk of AI being used for automated blackmail'}
                  {type === 'misuse' && title.includes('Hacking') && 'Probability of AI independently compromising systems'}
                  {type === 'human-comparison' && 'Likelihood of surpassing human-level performance'}
                </p>
              )}
            </div>
          ) : displayType === 'date-numeric' ? (
            <div className="h-full flex-1 flex items-center justify-center">
              <div className={`font-bold text-center ${displayValue.length > 5 ? 'text-3xl' : displayValue.length > 3 ? 'text-4xl' : 'text-5xl'}`}>
                <span className={getGradient(type)}>
                  {displayValue}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-full flex-1 flex items-center justify-center">
              <div className={`font-bold text-center ${displayValue.length > 5 ? 'text-3xl' : displayValue.length > 3 ? 'text-4xl' : 'text-5xl'}`}>
                <span className={getGradient(type)}>
                  {displayValue}
                </span>
              </div>
            </div>
          )}
        </div>
      </Col>
    </CardBase>
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
      return SiAnthropic;
    case 'google deepmind':
    case 'googledeepmind':
    case 'deepmind':
      return SiGooglegemini;
    case 'xai':
      return RiTwitterXLine; // Using X icon for xAI
    default:
      return LiaKiwiBirdSolid; // No specific icon for other companies
  }
}

export function AIForecast({ whenAgi, contracts = [], hideTitle }: AIForecastProps) {
  const liveWhenAgi = whenAgi && whenAgi.id ? useLiveContract(whenAgi) : null
  const expectedValueAGI = liveWhenAgi ? getNumberExpectedValue(liveWhenAgi) : 2030
  const eventYear = Math.floor(expectedValueAGI)
  const eventMonth = Math.round((expectedValueAGI - eventYear) * 12)
  const expectedYear = new Date(eventYear, eventMonth, 1)
  
  const capabilityCardsByType = AI_CAPABILITY_CARDS.reduce((grouped, card) => {
    if (!grouped[card.type]) {
      grouped[card.type] = []
    }
    grouped[card.type].push(card)
    return grouped
  }, {} as Record<string, typeof AI_CAPABILITY_CARDS>)
  
  const typeInfo = { // controls sorting
    'monthly': {
      label: 'Best Model in March',
      description: 'What\'s the best model this month?'
    },
    'releases': {
      label: 'Model Releases',
      description: 'When will [insert lab here] release the next model?'
    },
    'benchmark': {
      label: 'Benchmarks',
      description: 'How smart will the LLMs be?'
    },
    'prize': {
      label: 'Prizes',
      description: 'Will any model claim this prize?'
    },
    'misuse': {
      label: 'AI Misuse',
      description: 'How misaligned are these models?'
    },
    'human-comparison': {
      label: 'Comparisons to Humans',
      description: 'Do we still have a comparative advantage?'
    }
  }

  return (
    <Col className="mb-8 gap-4 px-1 sm:gap-6 sm:px-2">
      <Col className={hideTitle ? 'hidden' : ''}>
        <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
          Manifold AI Forecast
        </div>
        <div className="text-ink-500 text-md mt-2 flex font-normal">
          Manifold market odds on AI progress
        </div>
      </Col>
      
      {/* Card Categories */}
      {Object.entries(typeInfo).map(([type, info], index) => (
        <Col key={type} className={`${index > 0 ? 'mt-12 pt-8 border-t border-ink-200 dark:border-ink-800/50' : 'mt-6'}`} id={type}>
          <div className="mb-3">
            <Row className="items-center justify-between">
              <div>
                <h3 className={`items-center gap-1 font-semibold text-xl ${getAccentColor(type)}`}>
                  {info.label}
                </h3>
                <p className="text-ink-500 text-sm mt-1">
                  {info.description}
                </p>
              </div>
              <Link 
                href={`#${type}`} 
                className="flex items-center justify-center p-2 text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-full transition-all duration-200"
                scroll={false}
                aria-label={`Link to ${info.label} section`}
              >
                <LuLink size={18} />
              </Link>
            </Row>
          </div>
          
          <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-2 relative rounded-lg ${CARD_BG_PATTERN}`}>
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
      
      {/* AGI Clock Card */}
      {liveWhenAgi && (
        <CardBase
          onClick={() => window.location.href = contractPath(liveWhenAgi)}
          className="fade-in group relative bg-canvas-50"
          minHeight=""
        >
          <Row className="justify-between">
            <Link
              href={contractPath(liveWhenAgi)}
              className="hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg"
            >
              When will we achieve artificial general intelligence?
            </Link>
            <div className="p-1 rounded-full hover:bg-primary-50 transition-colors duration-200">
              <CopyLinkOrShareButton
                url={`https://${ENV_CONFIG.domain}/${ENDPOINT}`}
                eventTrackingName="copy ai share link"
                tooltip="Share"
              />
            </div>
          </Row>
          
          <Row className="mt-4 justify-between flex-wrap md:flex-nowrap">
            <Col className="w-full gap-3">
              <div className="text-left mb-2">
                <p className="text-lg">
                  The market expects AGI by{' '}
                  <span className="font-semibold">{expectedYear.getFullYear()}</span>
                  {' '}. What do you think?
                </p>
              </div>
              <div className="w-full flex justify-center">
                <div className="w-full">
                  <Clock year={expectedValueAGI} />
                </div>
              </div>
              <NumericBetPanel
                contract={liveWhenAgi}
                labels={{
                  lower: 'sooner',
                  higher: 'later',
                }}
              />
            </Col>
          </Row>
        </CardBase>
      )}
    </Col>
  )
}