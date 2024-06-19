import { useEffect } from 'react'
import { db } from '../lib/supabase/db'
import { usePersistentLocalState } from './use-persistent-local-state'
import { Row as rowFor } from 'common/supabase/utils'

export type MonthlyBetsType = {
  month: string
  bet_count: number
  total_amount: number
}

async function getMonthlyBets(userId: string) {
  const { data, error } = await db.rpc('get_monthly_bet_count_and_amount', {
    user_id_input: userId,
  })
  if (error) {
    console.error('Error fetching monthly bets:', error)
    // Handle the error appropriately
    return null
  }
  const monthlyBets: MonthlyBetsType[] = []

  for (let month = 0; month < 12; month++) {
    // Construct the date for the first day of each month at midnight UTC
    const monthDate = new Date(Date.UTC(2023, month, 1))

    // Find if the month exists in the data
    const formattedMonth = monthDate.toISOString().substring(0, 7)
    const monthData = ((data as MonthlyBetsType[]) ?? []).find((d) =>
      d.month.startsWith(formattedMonth)
    )

    // If the month is present in the data, use its bet count; otherwise, default to 0
    monthlyBets.push({
      month: `${formattedMonth}-01T00:00:00.000Z`, // ISO string for the first of the month in UTC
      bet_count: monthData ? monthData.bet_count : 0,
      total_amount: monthData ? monthData.total_amount : 0,
    })
  }

  return monthlyBets
}

export function useMonthlyBets(userId: string) {
  const [monthlyBets, setMonthlyBets] = usePersistentLocalState<
    MonthlyBetsType[] | undefined | null
  >(undefined, `wrapped-2023-${userId}-monthly-bets`)
  useEffect(() => {
    getMonthlyBets(userId).then((data) => {
      setMonthlyBets((data as MonthlyBetsType[]) ?? [])
    })
  }, [userId])

  return monthlyBets
}

export function useTotalProfit(userId: string) {
  const [totalProfit, setTotalProfit] = usePersistentLocalState<
    number | undefined | null
  >(undefined, `wrapped-2023-${userId}-total-profit`)
  useEffect(() => {
    getTotalProfit(userId).then((data) => {
      setTotalProfit(data)
    })
  }, [userId])

  return totalProfit
}

async function getTotalProfit(userId: string) {
  const { data: yearStart, error: error1 } = await db.rpc(
    'get_user_portfolio_at_2023_start',
    {
      p_user_id: userId,
    }
  )
  const { data: yearEnd, error: error2 } = await db.rpc(
    'get_user_portfolio_at_2023_end',
    {
      p_user_id: userId,
    }
  )

  if (error1 || error2) {
    console.error(error1 ?? error2)
    return null
  }
  const yearStartRow = (yearStart as any)[0] as rowFor<'user_portfolio_history'>
  const yearEndRow = (yearEnd as any)[0] as rowFor<'user_portfolio_history'>

  return calculateTotalProfit(yearEndRow) - calculateTotalProfit(yearStartRow)
}

function calculateTotalProfit(
  portfolioHistoryRow: rowFor<'user_portfolio_history'>
) {
  return (
    (portfolioHistoryRow.investment_value ?? 0) +
    (portfolioHistoryRow.balance ?? 0) -
    (portfolioHistoryRow.total_deposits ?? 0)
  )
}
async function getMaxProfitContractMetric(userId: string) {
  const { data, error } = await db
    .from('user_contract_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('profit', { ascending: false })
    .limit(1)
  // TODO: fix date range, if we need this

  if (error) {
    console.error(error)
    return null
  }
  return data
}

async function getMinProfitMetric(userId: string) {
  const { data, error } = await db
    .from('user_contract_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('profit', { ascending: true })
    .limit(1)
  // TODO: fix date range, if we need this

  if (error) {
    console.error(error)
    return null
  }
  return data
}

export type ProfitType = {
  profit: number
  contractId: string
  hasYesShares: boolean | null
  hasNoShares: boolean | null
}

export function useMaxAndMinProfit(userId: string) {
  const [maxProfit, setMaxProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2023-${userId}-max-profit`)
  const [minProfit, setMinProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2023-${userId}-min-profit`)
  useEffect(() => {
    getMaxProfitContractMetric(userId).then((data) => {
      if (data) {
        setMaxProfit({
          profit: data[0].profit ?? 0,
          contractId: data[0].contract_id,
          hasNoShares: data[0].has_no_shares,
          hasYesShares: data[0].has_yes_shares,
        })
      }
    })
    getMinProfitMetric(userId).then((data) => {
      if (data) {
        setMinProfit({
          profit: data[0].profit ?? 0,
          contractId: data[0].contract_id,
          hasNoShares: data[0].has_no_shares,
          hasYesShares: data[0].has_yes_shares,
        })
      }
    })
  }, [userId])

  return { maxProfit, minProfit }
}
