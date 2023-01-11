export type Stats = {
  startDate: number
  dailyActiveUsers: number[]
  dailyActiveUsersWeeklyAvg: number[]
  avgDailyUserActions: number[]
  weeklyActiveUsers: number[]
  monthlyActiveUsers: number[]
  dailySales: number[]
  d1: number[]
  d1WeeklyAvg: number[]
  nd1: number[]
  nd1WeeklyAvg: number[]
  nw1: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  dailySignups: number[]
  weekOnWeekRetention: number[]
  monthlyRetention: number[]
  dailyActivationRate: number[]
  dailyActivationRateWeeklyAvg: number[]
  manaBet: {
    daily: number[]
    weekly: number[]
    monthly: number[]
  }
}
