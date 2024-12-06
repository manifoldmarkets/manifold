import { Row as rowFor } from 'common/supabase/utils'
import { useEffect } from 'react'
import { api } from 'web/lib/api/api'
import { db } from '../lib/supabase/db'
import { usePersistentLocalState } from './use-persistent-local-state'
import { Contract } from 'common/contract'

export type MonthlyBetsType = {
  month: string
  bet_count: number
  total_amount: number
}

async function getMonthlyBets(userId: string) {
  const dataMap = new Map<string, MonthlyBetsType>()

  try {
    const data = await api('get-monthly-bets-2024', { userId })
    data?.forEach((item) => {
      const monthKey = item.month.substring(0, 7)
      dataMap.set(monthKey, item)
    })
  } catch (e) {
    console.error('Error fetching monthly bets:', e)
  }

  return Array.from({ length: 12 }, (_, month) => {
    const monthDate = new Date(Date.UTC(2024, month, 1))
    const formattedMonth = monthDate.toISOString().substring(0, 7)
    const monthData = dataMap.get(formattedMonth)

    return {
      month: `${formattedMonth}-01T00:00:00.000Z`,
      bet_count: monthData?.bet_count ?? 0,
      total_amount: monthData?.total_amount ?? 0,
    }
  })
}

export function useMonthlyBets(userId: string) {
  const [monthlyBets, setMonthlyBets] = usePersistentLocalState<
    MonthlyBetsType[] | undefined | null
  >(undefined, `wrapped-2024-${userId}-monthly-bets`)
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
  >(undefined, `wrapped-2024-${userId}-total-profit`)
  useEffect(() => {
    getTotalProfit(userId).then((data) => {
      setTotalProfit(data)
    })
  }, [userId])

  return totalProfit
}

async function getTotalProfit(userId: string) {
  const { data: yearStart, error: error1 } = await db
    .from('user_portfolio_history')
    .select('*')
    .eq('user_id', userId)
    .gte('ts', '2024-01-01')
    .order('ts', { ascending: true })
    .limit(1)

  const { data: yearEnd, error: error2 } = await db
    .from('user_portfolio_history')
    .select('*')
    .eq('user_id', userId)
    .lte('ts', '2024-12-31 23:59:59')
    .order('ts', { ascending: false })
    .limit(1)

  console.log('YEAR START', yearStart, 'YEAR END', yearEnd)
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

async function getMaxMinProfitMetric2024(userId: string) {
  try {
    const data = await api('get-max-min-profit-2024', { userId })
    return data
  } catch (error) {
    console.error('Error fetching max/min profit metrics:', error)
    return null
  }
}

export type ProfitType = {
  profit: number
  contract: Contract
  hasYesShares: boolean | null
  hasNoShares: boolean | null
}

export function useMaxAndMinProfit(userId: string) {
  const [maxProfit, setMaxProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2024-${userId}-max-profitz`)
  const [minProfit, setMinProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2024-${userId}-min-profitz`)

  localStorage.removeItem(`wrapped-2024-${userId}-max-profit`)
  localStorage.removeItem(`wrapped-2024-${userId}-min-profit`)

  useEffect(() => {
    getMaxMinProfitMetric2024(userId).then((data) => {
      const [max, min] = data ?? [null, null]
      if (max && min) {
        setMaxProfit({
          profit: max.profit ?? 0,
          contract: max.data,
          hasNoShares: max.has_no_shares,
          hasYesShares: max.has_yes_shares,
        })
        setMinProfit({
          profit: min.profit ?? 0,
          contract: min.data,
          hasNoShares: min.has_no_shares,
          hasYesShares: min.has_yes_shares,
        })
      }
    })
  }, [userId])

  return { maxProfit, minProfit }
}
