export type Stats = {
  startDate: number
  dailyActiveUsers: number[]
  weeklyActiveUsers: number[]
  monthlyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  dailySignups: number[]
  weekOnWeekRetention: number[]
  monthlyRetention: number[]
  weeklyActivationRate: number[]
  topTenthActions: {
    daily: number[]
    weekly: number[]
    monthly: number[]
  }
  manaBet: {
    daily: number[]
    weekly: number[]
    monthly: number[]
  }
}
