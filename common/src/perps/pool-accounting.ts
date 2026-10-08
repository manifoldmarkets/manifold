export type PerpPoolStatsPoint = {
  date: string
  totalPool: number
  /** Null when historical trader claims could not be reconstructed. */
  houseLiquidity: number | null
  isEstimate: boolean
}

export type PerpCashFlowTotals = {
  initialSubsidy: number
  addedSubsidy: number
  marginIn: number
  feesIn: number
  traderPayouts: number
  residualReturned: number
  cashIn: number
  cashOut: number
}

export type PerpContractPoolStats = {
  id: string
  slug: string
  question: string
  creatorUsername: string
  isResolved: boolean
  solvencyHalted: boolean
  poolLong: number
  poolShort: number
  openInterestLong: number
  openInterestShort: number
  reservedMarginLong: number
  reservedMarginShort: number
  markedPositionValue: number
  flows: PerpCashFlowTotals
  points: PerpPoolStatsPoint[]
}

export type PerpPoolStats = {
  trackingStartTime: number | null
  /** Latest complete capture of all currently listed markets. */
  lastCaptureTime: number | null
  points: PerpPoolStatsPoint[]
  flows: PerpCashFlowTotals
  contracts: PerpContractPoolStats[]
}
