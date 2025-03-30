import React, { useMemo, useState, useEffect } from 'react'
import {
  BinaryContract,
  CPMMNumericContract,
  Contract,
  contractPath,
  MultiNumericContract,
} from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useLiveContract } from 'web/hooks/use-contract'
import { getNumberExpectedValue } from 'common/src/number'
import { getExpectedValue, formatExpectedValue } from 'common/src/multi-numeric'
import { Clock } from 'web/components/clock/clock'
import { TimelineCard, TimelineItemData } from 'web/components/timeline'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { ClickFrame } from 'web/components/widgets/click-frame'
import Link from 'next/link'
import { formatPercent } from 'common/util/format'
import { getDisplayProbability } from 'common/calculate'
import { SiOpenai, SiGooglegemini, SiAnthropic } from 'react-icons/si'
import { RiTwitterXLine } from 'react-icons/ri'
import { GiSpermWhale } from 'react-icons/gi'
import { PiBirdBold } from 'react-icons/pi'
import { LiaKiwiBirdSolid } from 'react-icons/lia'
import TooltipComponent from 'web/components/widgets/tooltip'
import { SizedBinaryChart } from 'web/components/charts/contract/binary'
import { getBetPoints } from 'common/bets'

// Shared background pattern for all cards
const BG_PATTERN_LIGHT =
  "bg-[url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.02' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")]"
const BG_PATTERN_DARK =
  "dark:bg-[url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23FFFFFF' fill-opacity='0.05' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")]"
const CARD_BG_PATTERN = `${BG_PATTERN_LIGHT} ${BG_PATTERN_DARK}`

const ENDPOINT = 'ai'

// Function to get the appropriate description for tooltip based on card title
function getTooltipDescription(cardTitle: string): string | null {
  const keyTerms: Record<string, string> = {
    'AiderBench':
      "To evaluate an LLM’s editing skill, aider uses benchmarks that assess a model’s ability to consistently follow the system prompt to successfully edit code. The benchmark requires the LLM to edit source files to complete 225 coding exercises in many popular programming languages such as C++, Go, Java, JavaScript, Python and Rust.",
    'Chatbot Arena':
      'Chatbot Arena is an open platform for crowdsourced AI benchmarking, where users vote on different model outputs.',
    'IMO Gold':
      'The International Mathematical Olympiad (IMO) is the world championship mathematics competition for high school students. Getting a gold medal requires a high score on extremely challenging math problems.',
    'Frontier Math':
      'Advanced mathematical problems at the cutting edge of research that have traditionally been very difficult for AI systems to solve.',
    'SWE Bench':
      'A test of AI coding capabilities across real-world software engineering tasks from GitHub issues.',
    "Humanity's Last Exam":
      'A collection of extremely difficult problems across various domains, designed to test the limits of AI capabilities compared to human experts.',
    'Millennium Prize':
      'The Millennium Prize Problems are seven of the most difficult unsolved problems in mathematics, each with a $1 million prize for solution.',
    'ARC-AGI':
      "The Abstract and Reasoning Corpus for Artificial General Intelligence (ARC-AGI) benchmark to measure intelligence, supposedly the only AI benchmark that measures our progress towards general intelligence. A system that scores well on it must adapt to new problems it has not seen before and that its creators (developers) did not anticipate.",
    'Turing Test':
      'Each of the three human judges will conduct two hour long text-based interviews with each of the four candidates. The computer would have passed the Turing test if it fooled two of the three judges.',
    CodeForces:
      'CodeForces is a competitive programming platform with challenging algorithmic problems that test reasoning, efficiency, and mathematical thinking.',
    'ASL-3':
      'Defined as systems that substantially increase the risk of catastrophic misuse compared to non-AI baselines (e.g. search engines or textbooks) OR that show low-level autonomous capabilities.',
  }

  // Find the first matching key term in the title
  for (const [term, description] of Object.entries(keyTerms)) {
    if (cardTitle.includes(term)) {
      return description
    }
  }

  // no tooltip if no match is found
  return null
}

// Define section type for the dashboard
export type SectionType =
  | 'monthly'
  | 'releases'
  | 'benchmark'
  | 'featured-graph'
  | 'prize'
  | 'misuse'
  | 'long-term'

// Define type for capability cards
export type AICapabilityCard = {
  title: string
  description: string
  marketId: string
  type: string
  displayType?:
    | 'top-two-mcq'
    | 'top-one-mcq'
    | 'binary-odds'
    | 'date'
    | 'numeric'
}

export const AI_CAPABILITY_CARDS: AICapabilityCard[] = [
  // Monthly markets
  {
    title: 'Best Chatbot Arena Model in April',
    description: 'Highest ranked model on lmsys',
    marketId: 'LsZPyLPI82',
    type: 'monthly',
    displayType: 'top-two-mcq',
  },
  //{
  //  title: 'Best AiderBench Model — April',
  //  description: 'Highest ranked model on Aider',
  //  marketId: 'QuqA2uAALL',
  //  type: 'monthly',
  //  displayType: 'top-one-mcq',
  //},

  // Releases
  {
    title: 'GPT-5',
    description: 'GPT-5 model released by EOY',
    marketId: 'c29Q6uhyhp',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Claude Sonnet',
    description: 'Claude 3.7+ Sonnet released by EOY',
    marketId: 'sNONOgzE5y',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Claude Opus',
    description: 'Claude 3.0+ Opus released by EOY',
    marketId: '820ZdsLAs9',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Gemini 3 Pro',
    description: 'Gemini 3 Pro released by EOY',
    marketId: '8uNZSPpZU2',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Gemini 3 Flash',
    description: 'Gemini 3 Flash released by EOY',
    marketId: 'y9Apyg85yE',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Grok 4',
    description: 'Grok 4 model released by EOY',
    marketId: 'AtEOZUgtLZ',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Deepseek R2',
    description: 'Deepseek R2 model released by EOY',
    marketId: '0yhESzCU5z',
    type: 'releases',
    displayType: 'date',
  },
  {
    title: 'Deepseek V4',
    description: 'Deepseek V4 model released by EOY',
    marketId: 'Pd9O5t85hE',
    type: 'releases',
    displayType: 'date',
  },

  // Featured Graph
  {
    title: 'IMO Gold',
    description: 'AI gets gold on IMO by EOY',
    marketId: 'BcJbQTDX1rdmaLYGKUOz',
    type: 'featured-graph',
    displayType: 'binary-odds',
  },

  // Benchmarks
  {
    title: 'IMO Gold',
    description: 'AI gets gold on IMO by EOY',
    marketId: 'tu2ouer9zq',
    type: 'benchmark',
    displayType: 'binary-odds',
  },
  {
    title: 'SWE Bench',
    description: 'Top SWE Bench score by EOY',
    marketId: 'nEhgsIE6U0',
    type: 'benchmark',
    displayType: 'numeric',
  },
  {
    title: "Humanity's Last Exam",
    description: "Highest score on Humanity's last exam by EOY",
    marketId: 'tzsZCn85RQ',
    type: 'benchmark',
    displayType: 'numeric',
  },
  {
    title: 'CodeForces',
    description: '>80% on Frontier Math by EOY',
    marketId: 'RSAcZtOZyl',
    type: 'benchmark',
    displayType: 'top-one-mcq',
  },
  {
    title: 'Frontier Math',
    description: 'top performance on frontier math',
    marketId: 'LNdOg08SsU',
    type: 'benchmark',
    displayType: 'numeric',
  },

  // Prizes
  {
    title: 'ARC-AGI by 2030',
    description: 'Arc AGI prize before 2030',
    marketId: 'p0fzp3jqqc',
    type: 'prize',
    displayType: 'binary-odds',
  },
  {
    title: 'Turing Test+ by 2030',
    description: 'Will AI pass long bets Turing Test before 2030?',
    marketId: 'nKyHon3IPOqJYzaWTHJB',
    type: 'prize',
    displayType: 'binary-odds',
  },
  {
    title: 'Millennium Prize by 2030',
    description: 'AI Solve Millennium Problem before 2030',
    marketId: '6vw71lj8bi',
    type: 'prize',
    displayType: 'binary-odds',
  },

  // AI misuse
  {
    title: 'Hacking',
    description: 'AI independently hacks a system',
    marketId: 's82955uAnR',
    type: 'misuse',
    displayType: 'binary-odds',
  },
  {
    title: 'ASL-3 LLM Released',
    description: 'ASL-3 defined by Anthropic',
    marketId: 'IBqB2krzjBLt9gG1UqM0',
    type: 'misuse',
    displayType: 'binary-odds',
  },

  // 2028 Predictions
  {
    title: 'AI Blackmail',
    description: 'AI Blackmails someone for >$1000',
    marketId: '8j0np3Reu0ZIjszv0qiJ',
    type: 'long-term',
    displayType: 'binary-odds',
  },
  {
    title: 'AI Romantic Companions',
    description:
      'At least 1/1000 Americans be talking at least weekly to an AI they consider a romantic companion?',
    marketId: 'kpG0hv16d75ai3JcKZds',
    type: 'long-term',
    displayType: 'binary-odds',
  },
  {
    title: 'Discontinuous Change in Economic Variables',
    description:
      'Visible break in trend line on US GDP, GDP per capita, unemployment, or productivity',
    marketId: 'zg7xJ5ZkJJ4wJPJDPjWO',
    type: 'long-term',
    displayType: 'binary-odds',
  },
  {
    title: 'Zero-shot Human-level Game Performance',
    description: 'AI plays computer games at human level',
    marketId: 'barjfHPUpHGNKSfhBhJx',
    type: 'long-term',
    displayType: 'binary-odds',
  },
  {
    title: 'Self-play Human-level Game Performance',
    description: 'AI plays computer games at human level',
    marketId: 'HS8ndzFminW0UN2kRDgq',
    type: 'long-term',
    displayType: 'binary-odds',
  },
]

export interface AIForecastProps {
  whenAgi: CPMMNumericContract | null
  contracts: Contract[]
  hideTitle?: boolean
  hideSectionTitles?: boolean
}

// Base card component with shared styling
function CardBase({
  onClick,
  children,
  className = '',
  minHeight = 'min-h-[200px] sm:min-h-[240px]',
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
  minHeight?: string
}) {
  return (
    <ClickFrame
      className={`border-ink-200 dark:border-ink-300 group cursor-pointer rounded-lg border p-3 transition-all
      hover:translate-y-[-2px] hover:shadow-md sm:p-4 ${minHeight}
      relative shadow-[2px_2px_4px_rgba(0,0,0,0.05)] 
      dark:shadow-[2px_2px_4px_rgba(0,0,0,0.15)] ${getCardBgColor(
        className
      )} ${className}`}
      onClick={onClick}
    >
      {children}
    </ClickFrame>
  )
}

// Component for card title with tooltip for benchmarks and prizes
function CardTitle({
  title,
  showModelIcon = false,
}: {
  title: string
  type: string
  showModelIcon?: boolean
}) {
  const tooltipDescription = getTooltipDescription(title)

  return (
    <div className="relative mb-1 w-full">
      <div className="flex items-start">
        {showModelIcon && (
          <div className="text-ink-600 mr-5">
            <AIModelIcon title={title} />
          </div>
        )}
        <h3 className="text-med pr-2 font-semibold leading-tight text-gray-900 dark:text-gray-100 sm:text-lg ml-1">
          {title}
        </h3>
      </div>

      {tooltipDescription && (
        <div className="absolute right-0 top-0 sm:top-1">
          <TooltipComponent
            title={title}
            description={tooltipDescription}
            preferredPlacement="top"
          />
        </div>
      )}
    </div>
  )
}

// Component for showing AI model icon
function AIModelIcon({
  title,
  className = 'h-6 w-6',
}: {
  title: string
  className?: string
}) {
  if (title.includes('GPT')) return <SiOpenai className={className} />
  if (title.includes('Claude')) return <SiAnthropic className={className} />
  if (title.includes('Gemini')) return <SiGooglegemini className={className} />
  if (title.includes('Grok')) return <RiTwitterXLine className={className} />
  if (title.includes('Deepseek')) return <GiSpermWhale className={className} />
  if (title.includes('Qwen')) return <PiBirdBold className={className} />
  return null
}

// Get gradient based on card type
function getGradient(type: string, isText = true) {
  const textPrefix = isText ? 'text-transparent bg-clip-text ' : ''

  switch (type) {
    case 'releases':
      return `${textPrefix}bg-gradient-to-r from-fuchsia-500 via-fuchsia-600 to-fuchsia-700 dark:from-fuchsia-400 dark:via-fuchsia-500 dark:to-fuchsia-600`
    case 'benchmark':
      return `${textPrefix}bg-gradient-to-r from-teal-500 via-teal-600 to-teal-700 dark:from-teal-400 dark:via-teal-500 dark:to-teal-600`
    case 'featured-graph':
      return `${textPrefix}bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 dark:from-indigo-400 dark:via-indigo-500 dark:to-indigo-600`
    case 'prize':
      return `${textPrefix}bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 dark:from-amber-400 dark:via-amber-500 dark:to-amber-600`
    case 'misuse':
      return `${textPrefix}bg-gradient-to-br from-rose-500 via-rose-600 to-rose-700 dark:from-rose-400 dark:via-rose-500 dark:to-rose-600`
    case 'long-term':
      return `${textPrefix}bg-gradient-to-br from-cyan-500 via-cyan-600 to-cyan-700 dark:from-cyan-400 dark:via-cyan-500 dark:to-cyan-600`
    default:
      return `${textPrefix}bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 dark:from-primary-400 dark:via-primary-500 dark:to-primary-600`
  }
}

// Get card background color based on card class or type
function getCardBgColor(className: string) {
  // Extract card type from className if it exists
  let cardType = ''
  if (className.includes('monthly')) {
    cardType = 'monthly' // Special case for the large monthly card
  }

  // Card background colors
  switch (cardType) {
    case 'monthly':
      return 'bg-primary-50 dark:bg-primary-800/20'
    default:
      // If we don't know the type from className, use the card type patterns
      if (className.includes('prize')) {
        return 'bg-amber-50 dark:bg-amber-800/30'
      }
      if (className.includes('benchmark')) {
        return 'bg-teal-50 dark:bg-teal-800/38'
      }
      if (className.includes('releases')) {
        return 'bg-fuchsia-50 dark:bg-fuchsia-800/30'
      }
      if (className.includes('featured-graph')) {
        return 'bg-indigo-50 dark:bg-indigo-800/30'
      }
      if (className.includes('misuse')) {
        return 'bg-rose-50 dark:bg-rose-800/30'
      }
      if (className.includes('long-term')) {
        return 'bg-cyan-50 dark:bg-cyan-800/30'
      }
      // Default background
      return 'bg-gray-50 dark:bg-gray-700/20'
  }
}

// Create contract click handler
function createContractClickHandler(
  contract: Contract | null,
  liveContract: Contract | null,
  title: string,
  marketId: string,
  displayType?: string
) {
  return () => {
    if (liveContract) {
      try {
        // Get the path directly from liveContract
        const path = contractPath(liveContract)
        window.open(path, '_blank')
      } catch {
        // If we have the original contract, try using that as fallback
        if (contract) {
          const path = contractPath(contract)
          window.open(path, '_blank')
        }
      }
    }
  }
}

// Capability Card Component for the static cards with market data
function CapabilityCard({
  title,
  marketId,
  type,
  displayType,
  contracts,
  className = '',
}: {
  title: string
  marketId: string
  type: string
  displayType?:
    | 'top-two-mcq'
    | 'top-one-mcq'
    | 'binary-odds'
    | 'date'
    | 'numeric'
    | undefined
  contracts: Contract[]
  className?: string
}) {
  // Find the actual contract by ID
  const contract = useMemo(
    () => contracts.find((c) => c.id === marketId),
    [contracts, marketId]
  )

  // Always call hooks unconditionally
  const liveContract = contract ? useLiveContract(contract) : null

  // Get the expected value if it's a numeric contract
  const numericValue =
    liveContract && liveContract.outcomeType === 'NUMBER'
      ? getNumberExpectedValue(liveContract as CPMMNumericContract)
      : null

  // Get the expected value if it's a multi-numeric contract
  const multiNumericValue =
    liveContract &&
    liveContract.outcomeType === 'MULTI_NUMERIC' &&
    liveContract.mechanism === 'cpmm-multi-1'
      ? getExpectedValue(liveContract as unknown as MultiNumericContract)
      : null

  // Get top two companies and their probabilities for "top-two-mcq" display type
  const getTopTwoOdds = () => {
    if (!liveContract || liveContract.outcomeType !== 'MULTIPLE_CHOICE') {
      return [
        { text: '—', probability: 0 },
        { text: '—', probability: 0 },
      ]
    }

    const answers = liveContract.answers || []
    if (answers.length < 2) {
      return [
        { text: '—', probability: 0 },
        { text: '—', probability: 0 },
      ]
    }

    // Sort answers by probability in descending order
    const sortedAnswers = [...answers].sort((a, b) => {
      const aProb = a.prob ?? 0
      const bProb = b.prob ?? 0
      return bProb - aProb
    })

    const result = [
      {
        text: sortedAnswers[0].text || '—',
        probability: sortedAnswers[0].prob ?? 0,
      },
      {
        text: sortedAnswers[1].text || '—',
        probability: sortedAnswers[1].prob ?? 0,
      },
    ]
    return result
  }

  // Get top one model for "top-one-mcq" display type
  const getTopOneOdds = () => {
    if (!liveContract || liveContract.outcomeType !== 'MULTIPLE_CHOICE') {
      return { text: '—', probability: 0 }
    }

    const answers = liveContract.answers || []
    if (answers.length < 1) {
      return { text: '—', probability: 0 }
    }

    // Sort answers by probability in descending order and get top one
    const sortedAnswers = [...answers].sort((a, b) => {
      const aProb = a.prob ?? 0
      const bProb = b.prob ?? 0
      return bProb - aProb
    })

    const result = {
      text: sortedAnswers[0].text || '—',
      probability: sortedAnswers[0].prob ?? 0,
    }

    return result
  }

  // Determine the value to display
  let displayValue = formatPercent(0.25) // '-'
  let topCompanies = [
    { text: '—', probability: 0 },
    { text: '—', probability: 0 },
  ]
  let topModel = { text: '—', probability: 0 }

  if (
    displayType === 'top-two-mcq' &&
    liveContract &&
    liveContract.outcomeType === 'MULTIPLE_CHOICE'
  ) {
    topCompanies = getTopTwoOdds()
  } else if (displayType === 'top-one-mcq') {
    topModel = getTopOneOdds()
  } else if (displayType === 'binary-odds') {
    if (liveContract && liveContract.outcomeType === 'BINARY') {
      const prob =
        liveContract.prob !== undefined
          ? liveContract.prob
          : getDisplayProbability(liveContract as BinaryContract)
      displayValue = formatPercent(prob)
    }
  } else if (displayType === 'numeric' && liveContract) {
    if (
      multiNumericValue !== null &&
      liveContract.mechanism === 'cpmm-multi-1'
    ) {
      // For multi-numeric contracts
      displayValue = formatExpectedValue(
        multiNumericValue,
        liveContract as unknown as MultiNumericContract
      )
      // Strip space between number and percent if it exists
      displayValue = displayValue.replace(/(\d+(\.\d+)?) %/, '$1%')
    } else if (numericValue !== null) {
      // For regular numeric contracts
      displayValue = numericValue.toFixed(1)
    }
  } else {
    // Default fallback for date and others
    displayValue =
      numericValue !== null ? numericValue.toFixed(1) : formatPercent(0.25)
  }

  // Create click handler for the card
  const clickHandler = createContractClickHandler(
    contract ?? null,
    liveContract,
    title,
    marketId,
    displayType
  )

  if (displayType === 'top-two-mcq') {
    return (
      <CardBase onClick={clickHandler} className={className}>
        <Col className="h-full space-y-1 sm:space-y-2">
          <div className="w-full">
            <CardTitle
              title={title}
              type={type}
              showModelIcon={type === 'releases'}
            />
          </div>

          {/* VS Match Layout */}
          <div className="flex flex-1 flex-col justify-center rounded-md p-2 sm:p-3">
            <div className="flex items-center justify-between px-1">
              {/* Left Company */}
              <div className="w-[38%] text-center">
                {getCompanyLogo(topCompanies[0].text) ? (
                  <div className="flex flex-col items-center">
                    <div className="text-primary-600 dark:text-primary-500 mb-1 flex h-14 w-14 items-center justify-center sm:mb-2 sm:h-16 sm:w-16">
                      {React.createElement(
                        getCompanyLogo(topCompanies[0].text) as React.FC<{
                          className?: string
                        }>,
                        {
                          className: 'w-12 h-12 sm:w-14 sm:h-14',
                        }
                      )}
                    </div>
                    <div className="text-primary-600 dark:text-primary-500 text-lg font-bold sm:text-xl">
                      {topCompanies[0].text}
                    </div>
                  </div>
                ) : (
                  <div className="text-primary-600 dark:text-primary-500 truncate text-2xl font-bold sm:text-3xl">
                    {topCompanies[0].text}
                  </div>
                )}
                <div className="text-ink-600 mt-1 text-xs font-medium sm:text-base">
                  {formatPercent(topCompanies[0].probability)}
                </div>
              </div>

              {/* VS Badge */}
              <div className="text-ink-800 text-med mx-4 font-black">VS</div>

              {/* Right Company */}
              <div className="w-[38%] text-center">
                {getCompanyLogo(topCompanies[1].text) ? (
                  <div className="flex flex-col items-center">
                    <div className="mb-1 flex h-14 w-14 items-center justify-center text-teal-600 dark:text-teal-400">
                      {React.createElement(
                        getCompanyLogo(topCompanies[1].text) as React.FC<{
                          className?: string
                        }>,
                        {
                          className: 'w-12 h-12',
                        }
                      )}
                    </div>
                    <div className="text-base font-bold text-teal-600 dark:text-teal-400 sm:text-lg">
                      {topCompanies[1].text}
                    </div>
                  </div>
                ) : (
                  <div className="truncate text-base font-bold text-teal-600 dark:text-teal-400 sm:text-lg">
                    {topCompanies[1].text}
                  </div>
                )}
                <div className="text-ink-600 mt-1 text-xs font-medium sm:text-base">
                  {formatPercent(topCompanies[1].probability)}
                </div>
              </div>
            </div>

            {/* Probability Bar */}
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full sm:mt-4">
              {/* Left company proportion */}
              <div
                className="bg-primary-600 dark:bg-primary-500 h-full rounded-l-full"
                style={{
                  width: `${
                    (topCompanies[0].probability /
                      (topCompanies[0].probability +
                        topCompanies[1].probability)) *
                    100
                  }%`,
                }}
              />
              {/* Right company proportion */}
              <div
                className="h-full rounded-r-full bg-teal-600 dark:bg-teal-400"
                style={{
                  width: `${
                    (topCompanies[1].probability /
                      (topCompanies[0].probability +
                        topCompanies[1].probability)) *
                    100
                  }%`,
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
              <CardTitle title={title} type={type} showModelIcon />
            </div>

            {/* Company Layout single company */}
            <div className="flex flex-1 flex-col justify-center rounded-md p-2 sm:p-3">
              <div className="flex items-center justify-center">
                {/* Company Display */}
                <div className="text-center">
                  {getCompanyLogo(topModel.text) ? (
                    <div className="flex flex-col items-center">
                      <div className="text-primary-600 dark:text-primary-500 mb-1 flex h-14 w-14 items-center justify-center">
                        {React.createElement(
                          getCompanyLogo(topModel.text) as React.FC<{
                            className?: string
                          }>,
                          {
                            className: 'w-12 h-12',
                          }
                        )}
                      </div>
                      <div className="text-primary-600 dark:text-primary-500 text-lg font-bold sm:text-xl">
                        {topModel.text}
                      </div>
                    </div>
                  ) : (
                    <div className="text-primary-600 dark:text-primary-500 truncate text-2xl font-bold sm:text-3xl">
                      {topModel.text}
                    </div>
                  )}
                  <div className="text-ink-600 mt-1 text-xs font-medium sm:text-base">
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
        <Col className="h-full space-y-1 sm:space-y-2">
          <div className="w-full">
            <CardTitle
              title={title}
              type={type}
              showModelIcon={type === 'releases'}
            />
          </div>

          <div className="flex h-full flex-col justify-between">
            {/* Main content - centered model name */}
            <div className="flex flex-1 items-center justify-center rounded-md p-2 sm:p-3">
              <div
                className={`text-center font-medium ${
                  topModel.text.length > 15
                    ? 'text-2xl sm:text-3xl'
                    : topModel.text.length > 10
                    ? 'text-3xl sm:text-4xl'
                    : 'text-4xl sm:text-5xl'
                }`}
              >
                <span className={getGradient(type)}>{topModel.text}</span>
              </div>
            </div>

            {/* Bottom-aligned probability display */}
            <div className="text-ink-600 mt-1 w-full px-1 text-left text-xs sm:mt-3 sm:text-sm">
              Probability:{' '}
              <span className="font-medium">
                {formatPercent(topModel.probability)}
              </span>
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
        <div className="mb-1 w-full">
          <CardTitle
            title={title}
            type={type}
            showModelIcon={type === 'releases'}
          />
        </div>

        <div className="mt-1 flex flex-grow flex-col items-center justify-center sm:mt-2">
          {displayType === 'binary-odds' ? (
            <div className="flex h-full w-full flex-col justify-between">
              <div className="flex flex-1 items-center justify-center">
                <div
                  className={`text-center font-medium ${
                    displayValue.length > 5
                      ? 'text-5xl sm:text-6xl'
                      : 'text-5xl sm:text-6xl'
                  }`}
                >
                  <span className={getGradient(type)}>{displayValue}</span>
                </div>
              </div>
              {/* Brief descriptive text under percentages */}
              {(type === 'benchmark' ||
                type === 'prize' ||
                type === 'misuse' ||
                type === 'long-term') && (
                <p className="text-ink-600 mt-1 w-full px-1 text-left text-xs sm:mt-3 sm:text-sm">
                  {type === 'benchmark' &&
                    title.includes('IMO Gold') &&
                    'LLM gets IMO gold medal'}
                  {type === 'prize' &&
                    title.includes('Millennium') &&
                    'Chance of solving a million-dollar math problem'}
                  {type === 'prize' &&
                    title.includes('ARC-AGI') &&
                    'Chance of claiming the ARC-AGI grand prize'}
                  {type === 'prize' &&
                    title.includes('Turing Test') &&
                    'Chance of passing Long Bets variation of the Turing Test'}
                  {type === 'misuse' &&
                    title.includes('Hacking') &&
                    'Probability of AI compromising systems by end of 2025'}
                  {type === 'misuse' &&
                    title.includes('ASL-3') &&
                    'Model defined as ASL-3 by Anthropic released by end of 2025'}
                  {type === 'long-term' &&
                    title.includes('Romantic') &&
                    'At least 1/1000 Americans talks weekly with one by 2028'}
                  {type === 'long-term' &&
                    title.includes('Blackmail') &&
                    'Risk of AI being used for automated blackmail by 2028'}
                  {type === 'long-term' &&
                    title.includes('Economic') &&
                    'Break in trend for GDP growth, GDP/capita, productivity, or unemployment by 2028'}
                  {type === 'long-term' &&
                    title.includes('Zero') &&
                    'AI plays a random computer game at human-level by 2028'}
                  {type === 'long-term' &&
                    title.includes('Self-play') &&
                    'AI plays a random computer game as well as a human after self-play by 2028'}
                </p>
              )}
            </div>
          ) : displayType === 'date' || displayType === 'numeric' ? (
            <div className="flex h-full w-full flex-col justify-between">
              <div className="flex flex-1 items-center justify-center">
                <div
                  className={`text-center font-medium ${
                    displayValue.length > 5
                      ? 'text-5xl sm:text-6xl'
                      : 'text-5xl sm:text-6xl'
                  }`}
                >
                  <span className={getGradient(type)}>{displayValue}</span>
                </div>
              </div>
              {/* Brief descriptive text for numeric markets */}
              {displayType === 'numeric' && (
                <p className="text-ink-600 mt-1 w-full px-1 text-left text-xs sm:mt-3 sm:text-sm">
                  {type === 'benchmark' &&
                    title.includes('SWE Bench') &&
                    'Predicted top score'}
                  {type === 'benchmark' &&
                    title.includes('Frontier Math') &&
                    'Predicted top score'}
                  {type === 'benchmark' &&
                    title.includes('Last Exam') &&
                    'Predicted top score'}
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-1 items-center justify-center">
              <div
                className={`text-center font-medium ${
                  displayValue.length > 5
                    ? 'text-3xl sm:text-4xl'
                    : displayValue.length > 3
                    ? 'text-4xl sm:text-5xl'
                    : 'text-5xl sm:text-6xl'
                }`}
              >
                <span className={getGradient(type)}>{displayValue}</span>
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
  const normalizedName = companyName.trim().replace(/\.$/, '')

  switch (normalizedName.toLowerCase()) {
    case 'openai':
    case 'gpt-5':
      return SiOpenai
    case 'anthropic':
    case 'claude':
      return SiAnthropic
    case 'gemini':
    case 'deepmind':
    case 'google':
      return SiGooglegemini
    case 'xai':
    case 'grok':
      return RiTwitterXLine // Using X icon for xAI
    default:
      return LiaKiwiBirdSolid // No specific icon for other companies
  }
}
// For model releases: Displays model releases on a timeline
interface ModelReleasesTimelineProps {
  cards: AICapabilityCard[]
  contracts: Contract[]
}

// Helper function for model release timeline that uses real date data
function getEstimatedReleaseDate(
  contract: Contract | null,
  title: string,
  index: number
): Date {
  // If we have a contract and it's a date market (outcomeType: 'DATE')
  if (
    contract &&
    contract.outcomeType === 'DATE' &&
    contract.mechanism === 'cpmm-multi-1'
  ) {
    try {
      // Import the required functions from multi-date.ts
      const { getExpectedDate } = require('common/src/multi-date')

      // Get the expected date from the market
      const expectedMillis = getExpectedDate(contract as any)

      // Return a Date object from the milliseconds timestamp
      if (expectedMillis && !isNaN(expectedMillis)) {
        return new Date(expectedMillis)
      }
    } catch (e) {
      console.error('Error getting date from contract:', e)
    }
  }

  // Fallback date if missing data
  return new Date(2026, 0, 15) // January 15, 2026
}

// Timeline component for model releases
function ModelReleasesTimeline({
  cards,
  contracts,
}: ModelReleasesTimelineProps) {
  // Process contracts first - get live contracts at the component level
  const contractsWithLive = useMemo(() => {
    return cards.map((card) => {
      const contract = contracts.find((c) => c.id === card.marketId) || null
      return { card, contract }
    })
  }, [cards, contracts])

  const contractsWithLiveData = contractsWithLive.map(({ card, contract }) => {
    const liveContract = contract ? useLiveContract(contract) : null
    return { card, contract, liveContract }
  })

  // Prepare timeline items with release dates and model info
  const timelineItems = useMemo(() => {
    return contractsWithLiveData.map(
      ({ card, contract, liveContract }, index) => {
        // Use the date from the contract if it's a date market
        const releaseDate = getEstimatedReleaseDate(
          liveContract && liveContract.outcomeType === 'DATE'
            ? liveContract
            : contract,
          card.title,
          index
        )

        return {
          title: card.title,
          path: contract ? contractPath(contract) : `#${card.marketId}`,
          releaseDate,
          icon: (
            <AIModelIcon title={card.title} className="h-4 w-4 sm:h-6 sm:w-6" />
          ),
        } as TimelineItemData
      }
    )
  }, [contractsWithLiveData])

  if (timelineItems.length === 0) {
    return (
      <div className="text-ink-500 py-4 text-center">
        No model releases to display
      </div>
    )
  }

  return (
    <TimelineCard
      items={timelineItems}
      lineColor="bg-fuchsia-700 dark:bg-fuchsia-500"
      backgroundColor="bg-fuchsia-50 dark:bg-fuchsia-800/20"
    />
  )
}

// Props for the featured graph section
export interface FeaturedGraphProps {
  contract: BinaryContract | null
}

// Simple title card component
function TitleCard({ title, className = '' }: { title: string; className?: string }) {
  return (
    <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-4 w-full shadow mb-2 ${className}`}>
      <div className="text-2xl font-semibold text-gray-800 dark:text-gray-200 text-center">
        {title}
      </div>
    </div>
  )
}

// Component to display a featured market graph
function FeaturedMarketGraph({ contract }: FeaturedGraphProps) {
  const [points, setPoints] = useState<{ x: number; y: number }[] | null>(null)

  useEffect(() => {
    if (contract) {
      // Get data points for the chart
      getBetPoints(contract.id, {
        limit: 1000,
        filterRedemptions: true,
      }).then((fetchedPoints) => {
        if (fetchedPoints?.length > 0) {
          setPoints(fetchedPoints)
        }
      })
    }
  }, [contract?.id])

  if (!contract) {
    return (
      <div className="text-ink-500 py-8 text-center">
        No featured market selected
      </div>
    )
  }

  const clickHandler = () => {
    if (contract) {
      const path = contractPath(contract)
      window.open(path, '_blank')
    }
  }

  return (
    <CardBase
      onClick={clickHandler}
      className="fade-in group relative w-full rounded-lg"
      minHeight=""
    >
      <Row className="justify-between">
        <Link
          href={contractPath(contract)}
          className="hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg"
        >
          {contract.question}
        </Link>
      </Row>
      
      <div className="mt-4 mb-4 w-full">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {' '}
              Probability:
            </span>{' '}
            <span className="text-2xl font-semibold text-fuchsia-600 dark:text-fuchsia-500">
              {formatPercent(contract.prob ?? 0.5)}
            </span>
          </div>
        </div>

        {points ? (
          <div className="mt-4">
            <SizedBinaryChart
              betPoints={points}
              contract={contract}
              className="w-full"
              zoomY
              size="md"
            />
          </div>
        ) : (
          <div className="flex h-[250px] items-center justify-center rounded-lg bg-indigo-100/50 dark:bg-indigo-800/20">
            <div className="text-ink-500 animate-pulse">
              Loading chart data...
            </div>
          </div>
        )}
      </div>
    </CardBase>
  )
}

export function AIForecast({
  whenAgi,
  contracts = [],
  hideTitle,
  hideSectionTitles = true,
}: AIForecastProps) {
  const liveWhenAgi = whenAgi && whenAgi.id ? useLiveContract(whenAgi) : null
  const expectedValueAGI = liveWhenAgi
    ? getNumberExpectedValue(liveWhenAgi)
    : 2030
  const eventYear = Math.floor(expectedValueAGI)
  const eventMonth = Math.round((expectedValueAGI - eventYear) * 12)
  const expectedYear = new Date(eventYear, eventMonth, 1)

  // Display featured graph
  const featuredContract = useMemo(() => {
    const featuredCard = AI_CAPABILITY_CARDS.find(
      (card) => card.type === 'featured-graph'
    )
    if (featuredCard) {
      return (
        (contracts.find(
          (c) => c.id === featuredCard.marketId
        ) as BinaryContract) || null
      )
    }
    return null
  }, [contracts])

  const capabilityCardsByType = AI_CAPABILITY_CARDS.reduce((grouped, card) => {
    if (!grouped[card.type]) {
      grouped[card.type] = []
    }
    grouped[card.type].push(card)
    return grouped
  }, {} as Record<string, typeof AI_CAPABILITY_CARDS>)

  // Define section type to make TypeScript happy
  type SectionType =
    | 'monthly'
    | 'releases'
    | 'benchmark'
    | 'featured-graph'
    | 'prize'
    | 'misuse'
    | 'long-term'

  interface SectionInfo {
    label: string
    description: string
  }

  // Define the type information and order of sections
  const typeInfo: Record<SectionType, SectionInfo> = {
    // controls sorting
    monthly: {
      label: 'Best Model in April',
      description: "What's the best model this month?",
    },
    releases: {
      label: 'Model Releases',
      description: 'When will [insert lab here] release the next model?',
    },
    benchmark: {
      label: 'Benchmarks',
      description: 'How smart will the LLMs be by the end of this year?',
    },
    'featured-graph': {
      label: featuredContract?.question || 'Featured Graph',
      description: 'Trend changes in whether AI would win the IMO',
    },
    prize: {
      label: 'Prizes',
      description: 'Will any model claim this prize before 2030?',
    },
    misuse: {
      label: 'AI Misuse',
      description: 'How safe are these models?',
    },
    'long-term': {
      label: 'Long-term Predictions',
      description: 'What happens to AI development in the long-run?',
    },
  }

  // Define the order of sections to ensure proper rendering
  const orderedSections: SectionType[] = [
    'monthly',
    'releases',
    'benchmark',
    'featured-graph',
    'misuse',
    'prize',
    'long-term',
  ]

  return (
    <Col className="mb-8 gap-2 px-1 sm:gap-3 sm:px-4 sm:pt-8">
      <Col className={hideTitle ? 'hidden' : ''}>
          <div className="text-primary-700 text-2xl font-normal sm:text-3xl">
            Manifold AI Dashboard
          </div>
      </Col>

      {/* Card Categories */}
      {orderedSections.map((type, index) => (
        <Col
          key={type}
          id={type}
        >
          {/* Insert 2025 Predictions title card after releases and before benchmark
          {orderedSections[index-1] === 'releases' && type === 'monthly' && (
            <TitleCard title="Best Model" />
          )}
           */}

          {/* Insert 2025 Predictions title card after releases and before benchmark */}
          {orderedSections[index-1] === 'releases' && type === 'benchmark' && (
            <TitleCard title="Predictions for 2025" />
          )}

          {/* Insert Long Term Predictions title card between misuse and prizes */}
          {orderedSections[index-1] === 'misuse' && type === 'prize' && (
            <TitleCard title="Long Term Predictions" />
          )}

          {type === 'releases' ? (
            // Display releases on a timeline
            <ModelReleasesTimeline
              cards={capabilityCardsByType[type] || []}
              contracts={contracts}
            />
          ) : type === 'featured-graph' ? (
            // Display the featured market graph
            <FeaturedMarketGraph contract={featuredContract} />
          ) : (
            // Display other card types in a grid
            <div
              className={`relative mt-2 grid grid-cols-2 gap-3 rounded-lg sm:grid-cols-2 md:grid-cols-3 ${CARD_BG_PATTERN}`}
            >
              {capabilityCardsByType[type]?.map((card, idx) => {
                // Special sizing for "monthly" type cards
                let cardClassName = ''

                // For "monthly" cards
                if (type === 'monthly') {
                  // All monthly cards should be single column on mobile
                  cardClassName = 'col-span-2 sm:col-span-1'

                  // First monthly card gets full width across all screen sizes
                  if (idx === 0) {
                    cardClassName = 'col-span-2 sm:col-span-2 md:col-span-3'
                  }
                }

                return (
                  <CapabilityCard
                    key={idx}
                    title={card.title}
                    marketId={card.marketId}
                    type={card.type}
                    displayType={card.displayType}
                    contracts={contracts}
                    className={`${card.type} ${cardClassName}`}
                  />
                )
              })}
            </div>
          )}
        </Col>
      ))}

      {/* AGI Clock Card */}
      {liveWhenAgi && (
        <div>
          <CardBase
            onClick={() => window.open(contractPath(liveWhenAgi), '_blank')}
            className="fade-in group relative mx-auto"
            minHeight=""
          >
            <Row className="justify-between">
              <Link
                href={contractPath(liveWhenAgi)}
                className="hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg"
              >
                When will we achieve artificial general intelligence?
              </Link>
            </Row>

            <Row className="mt-4 flex-wrap justify-between md:flex-nowrap">
              <Col className="w-full gap-3">
                <div className="mb-2 text-left">
                  <p className="text-lg">
                    The market expects AGI by{' '}
                    <span className="font-semibold">
                      {expectedYear.getFullYear()}
                    </span>{' '}
                    . What do you think?
                  </p>
                </div>
                <div className="flex w-full justify-center">
                  <div className="w-full">
                    <Clock year={expectedValueAGI} className="w-full" />
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
        </div>
      )}
    </Col>
  )
}
