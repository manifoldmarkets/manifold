import { Contract, MultiContract } from 'common/contract'

export type BenchmarkCategory = 'reasoning' | 'coding' | 'safety' | 'capabilities'

export interface BenchmarkData {
  name: string
  description: string
  category: BenchmarkCategory
  contract: Contract | null
  currentValue?: string
  previousValue?: string
  changeValue?: number
  link?: string
}

export interface AITimelineData {
  name: string
  description: string
  contract: Contract | null
  date?: string
  probability?: number
}

export interface AILabData {
  name: string
  model: string
  score: number
  winRate: number
  previousRank?: number
  probability: number
  contract: Contract | null
}

export interface AiBenchmarkPageProps {
  frontierMathContract: Contract | null
  humanityLastExamContract: Contract | null
  sweBenchContract: Contract | null
  agiTimelineContract: MultiContract | null
  gpuCapacityContract: Contract | null
  chatbotArenaContract: Contract | null
  topLabs: AILabData[]
  benchmarks: {
    reasoning: BenchmarkData[]
    coding: BenchmarkData[]
    safety: BenchmarkData[]
    capabilities: BenchmarkData[]
  }
  aiTimeline: AITimelineData[]
  trendingDashboard: any
}
